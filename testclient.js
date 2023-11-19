const unix = require('unix-dgram')
const EventEmitter = require('events')
const fs = require('fs')

class DataGram extends EventEmitter {
  constructor(path, connectToPath) {
    super()
    this.path = path
    this.connectToPath = connectToPath
    this.socket = new unix.createSocket('unix_dgram', data => {
      this.emit('data', data)
    })
    this.listening = false
    this.connected = false
    this.connectInterval = null
    try {
      fs.unlinkSync(this.path)
    } catch {}
    this.socket.bind(this.path)

    this.socket.on('error', e => {
      if (this.connected) {
        console.log('disconnected')
        this.connected = false
        this.connectInterval = setInterval(() => {
          console.log('connecting', this.connectToPath)
          this.socket.connect(this.connectToPath)
        })
      } else {
        console.log('error', e)
      }
    })

    this.connectInterval = setInterval(() => {
      console.log('connecting', this.connectToPath)
      this.socket.connect(this.connectToPath)
    })

    this.socket.on('connect', () => {
      console.log('connected')
      clearInterval(this.connectInterval)
      this.connected = true
      this.emit('connect')
    })
  }

  write(data) {
    // console.log("writing", data)
    this.socket.send(Buffer.from(data))
  }
}

module.exports = DataGram
