var Mpeg1Muxer, STREAM_MAGIC_BYTES, VideoStream, events, util, ws

ws = require('ws')

util = require('util')

events = require('events')

Mpeg1Muxer = require('./mpeg1muxer')

STREAM_MAGIC_BYTES = "jsmp" // Must be 4 bytes

fs = require('fs')

path  = require('path')

https = require('https')

VideoStream = function(options) {
  this.options = options
  this.name = options.name
  this.streamUrl = options.streamUrl
  this.width = options.width
  this.height = options.height
  this.wsPort = options.wsPort
  this.audioCodec = options.audioCodec
  this.inputStreamStarted = false
  this.stream = undefined
  this.httpsServer = undefined
  this.startMpeg1Stream()
  this.pipeStreamToSocketServer()
  return this
}

util.inherits(VideoStream, events.EventEmitter)

VideoStream.prototype.stop = function() {
  console.log('Derrubando serviços')
  this.wsServer.close()
  this.stream.kill()
  this.httpsServer.close()
  this.inputStreamStarted = false
  return this
}

VideoStream.prototype.startMpeg1Stream = function() {
  var gettingInputData, gettingOutputData, inputData, outputData
  this.mpeg1Muxer = new Mpeg1Muxer({
    ffmpegOptions: this.options.ffmpegOptions,
    url: this.streamUrl,
    ffmpegPath: this.options.ffmpegPath == undefined ? "ffmpeg" : this.options.ffmpegPath,
    audioCodec: this.audioCodec
  })
  this.stream = this.mpeg1Muxer.stream
  if (this.inputStreamStarted) {
    return
  }
  this.mpeg1Muxer.on('mpeg1data', (data) => {
    return this.emit('camdata', data)
  })
  gettingInputData = false
  inputData = []
  gettingOutputData = false
  outputData = []
  this.mpeg1Muxer.on('ffmpegStderr', (data) => {
    var size
    data = data.toString()
    if (data.indexOf('Input #') !== -1) {
      gettingInputData = true
    }
    if (data.indexOf('Output #') !== -1) {
      gettingInputData = false
      gettingOutputData = true
    }
    if (data.indexOf('frame') === 0) {
      gettingOutputData = false
    }
    if (gettingInputData) {
      inputData.push(data.toString())
      size = data.match(/\d+x\d+/)
      if (size != null) {
        size = size[0].split('x')
        if (this.width == null) {
          this.width = parseInt(size[0], 10)
        }
        if (this.height == null) {
          return this.height = parseInt(size[1], 10)
        }
      }
    }
  })
  this.mpeg1Muxer.on('ffmpegStderr', function(data) {
    return global.process.stderr.write(data)
  })
  this.mpeg1Muxer.on('exitWithError', () => {
    return this.emit('exitWithError')
  })
  return this
}

  VideoStream.prototype.pipeStreamToSocketServer = function() {
    const serverOptions = {
      cert: fs.readFileSync('/etc/letsencrypt/live/websocket-stream.rotaexata.com.br-0001/fullchain.pem'),
      key: fs.readFileSync('/etc/letsencrypt/live/websocket-stream.rotaexata.com.br-0001/privkey.pem')
    };
    
    // Cria um servidor HTTPS
    this.httpsServer = https.createServer(serverOptions);
  
    // Cria um WebSocket.Server usando o servidor HTTPS
    this.wsServer = new ws.Server({
      server: this.httpsServer
    });
  
    this.wsServer.on("connection", (socket, request) => {
      return this.onSocketConnect(socket, request);
    });
  
    this.wsServer.broadcast = function(data, opts) {
      var results;
      results = [];
      for (let client of this.clients) {
        if (client.readyState === 1) {
          results.push(client.send(data, opts));
        } else {
          results.push(console.log("Error: Client from remoteAddress " + client.remoteAddress + " not connected."));
        }
      }
      return results;
    };
  
    this.on('camdata', (data) => {
      return this.wsServer.broadcast(data);
    });
  
    // Faz o servidor HTTPS escutar na porta especificada
    this.httpsServer.listen(this.wsPort, () => {
      console.log(`Servidor WebSocket seguro rodando na porta ${this.wsPort}`);
    });
  };

VideoStream.prototype.onSocketConnect = function(socket, request) {
  var streamHeader
  // Send magic bytes and video size to the newly connected socket
  // struct { char magic[4]; unsigned short width, height;}
  streamHeader = new Buffer(8)
  streamHeader.write(STREAM_MAGIC_BYTES)
  streamHeader.writeUInt16BE(this.width, 4)
  streamHeader.writeUInt16BE(this.height, 6)
  socket.send(streamHeader, {
    binary: true
  })
  console.log(`${this.name}: New WebSocket Connection (` + this.wsServer.clients.size + " total)")

  socket.remoteAddress = request.connection.remoteAddress

  return socket.on("close", (code, message) => {
    return console.log(`${this.name}: Disconnected WebSocket (` + this.wsServer.clients.size + " total)")
  })
}

module.exports = VideoStream