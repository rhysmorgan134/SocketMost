import unix from 'unix-dgram'
import EventEmitter from 'events'
import fs from 'fs'

export class DataGram extends EventEmitter{
    path: string
    connectToPath: string
    socket?
    listening: boolean
    connected: boolean
    connectInterval?: NodeJS.Timer

    constructor(path: string, connectToPath: string) {
        super()
        this.path = path
        this.connectToPath = connectToPath
        this.socket = new unix.createSocket('unix_dgram', (data: Buffer) => {
            this.emit('data', data)
        })
        this.listening = false
        this.connected = false
        try {
            fs.unlinkSync(this.path)
        } catch {
            console.log("No Socket to unlink/Error unlinking")
        }
        this.socket.bind(this.path)

        this.socket.on('error', (e: string) => {
            if(this.connected) {
                console.log("disconnected")
                this.connected = false
                this.connectInterval = setInterval(() => {
                    console.log("connecting", this.connectToPath)
                    this.socket.connect(this.connectToPath)
                })
            } else {
                console.log('error', e)
            }
        })


        this.connectInterval = setInterval(() => {
            console.log("connecting", this.connectToPath)
            this.socket.connect(this.connectToPath)
        })

        this.socket.on('connect', () => {
            console.log("connected")
            clearInterval(this.connectInterval)
            this.connected = true
            this.emit('connect')
        })
    }

    write(data: string ) {
        // console.log("writing", data)
        this.socket.send(Buffer.from(data))
    }
}