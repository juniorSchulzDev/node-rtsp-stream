var Mpeg1Muxer, child_process, events, util

child_process = require('child_process')

util = require('util')

events = require('events')

Mpeg1Muxer = function(options) {
  var key
  this.url = options.url
  this.ffmpegOptions = options.ffmpegOptions
  this.exitCode = undefined
  this.additionalFlags = []
  if (this.ffmpegOptions) {
    for (key in this.ffmpegOptions) {
      this.additionalFlags.push(key)
      if (String(this.ffmpegOptions[key]) !== '') {
        this.additionalFlags.push(String(this.ffmpegOptions[key]))
      }
    }
  }
  this.spawnOptions = [
    '-rtsp_transport', 'tcp' ,
    '-i',
    this.url,
    '-vsync',
    '1',
    '-copyts',
    '-vcodec',
    'copy',
    '-movflags', 'frag_keyframe+empty_moov',
    '-hls_flags', 'delete_segments+append_list',
    '-f', 'mpegts',
    '-codec:v', 'mpeg1video', '-s', '640x480', '-b:v', '1000k', '-bf', '0',
    '-r', '30'
  ]

  if(options.audioCodec) {
    this.spawnOptions.push('-codec:a', 'mp2', '-ar', '44100', '-ac', '1', '-b:a', '128k')
  }

  this.spawnOptions.push('-')

  this.stream = child_process.spawn(options.ffmpegPath, this.spawnOptions, {
    detached: false
  })
  this.inputStreamStarted = true
  this.stream.stdout.on('data', (data) => {
    return this.emit('mpeg1data', data)
  })
  this.stream.stderr.on('data', (data) => {
    return this.emit('ffmpegStderr', data)
  })
  this.stream.on('exit', (code, signal) => {
    if (code === 1) {
      console.error('RTSP stream exited with error')
      this.exitCode = 1
      return this.emit('exitWithError')
    }
  })
  return this
}

util.inherits(Mpeg1Muxer, events.EventEmitter)

module.exports = Mpeg1Muxer
