import fs from 'fs'
import unix from 'unix-dgram'
import { EventEmitter } from 'events'

export class DataGram extends EventEmitter {
  path: string
  connectToPath: string
  socket: unix.Socket
  listening: boolean
  connected: boolean
  connectInterval?: NodeJS.Timeout

  constructor(path: string, connectToPath: string) {
    super()
    this.path = path
    this.connectToPath = connectToPath
    this.socket = unix.createSocket('unix_dgram', data => {
      this.emit('data', data)
    })
    this.listening = false
    this.connected = false
    this.connectInterval = undefined
    try {
      fs.unlinkSync(this.path)
    } catch (err) {
      console.error(err)
    }
    this.socket.bind(this.path)

    this.socket.on('error', (e: unknown) => {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  write(data: any) {
    // console.log("writing", data)
    this.socket.send(Buffer.from(data))
  }
}
