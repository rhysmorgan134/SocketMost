import {
  InterByteTimeoutParser,
  PacketLengthParser,
  SerialPort,
} from 'serialport'
import EventEmitter from 'events'
import {
  AllocResult,
  DeallocResult,
  MostRxMessage,
  Os8104Events,
  SocketMostSendMessage,
  UsbConfig,
} from '../modules/Messages'

export class SocketMostUsb extends EventEmitter {
  portFound: boolean
  portInterval: NodeJS.Timeout
  port?: SerialPort
  parser?: PacketLengthParser | InterByteTimeoutParser
  constructor() {
    super()
    this.portFound = false

    this.portInterval = setInterval(() => {
      this.findPort()
    }, 1000)
  }

  findPort() {
    SerialPort.list().then(ports => {
      ports.forEach(port => {
        if (port.manufacturer == 'ModernDayMods') {
          if (!this.portFound) {
            console.log('found', port.manufacturer)

            clearInterval(this.portInterval)
            this.port = new SerialPort({
              path: port.path,
              baudRate: 115200,
              lock: false,
            })

            this.port.on('open', () => {
              this.emit('opened')
            })

            this.port.on('close', () => {
              this.portFound = false
              this.portInterval = setInterval(() => {
                this.findPort()
              }, 1000)
            })

            this.port.on('error', err => {
              this.emit('error')
              console.log(err)
              this.portInterval = setInterval(() => {
                this.findPort()
                this.portFound = false
              }, 1000)
            })

            this.parser = this.port.pipe(
              new PacketLengthParser({
                delimiter: 0x55,
                packetOverhead: 3,
                lengthBytes: 1,
                lengthOffset: 1,
              }),
            )

            // this.parser = this.port.pipe(
            //   new InterByteTimeoutParser({ interval: 1 }),
            // )
            this.parser.on('data', data => {
              this.parseData(data)
            })

            setTimeout(() => {
              // this.sendConfigRequest()
              this.sendConnectMic()
            }, 3000)

            this.portFound = true
            this.sendCheckForLock()
          }
        }
      })
    })
  }

  sendAllocateRequest() {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(103, 2)
    console.log('sending', buf)
    this.port!.write(buf)
  }

  sendConfigRequest() {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(111, 2)
    console.log('sending config request', buf)
    this.port!.write(buf)
  }

  sendDellocateRequest() {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(110, 2)
    console.log('sending', buf)
    this.port!.write(buf)
  }

  sendConnectMic() {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(112, 2)
    console.log('sending', buf)
    this.port!.write(buf)
  }

  sendCheckForLock() {
    const buf = Buffer.alloc(4)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(107, 2)
    console.log('sending lock check', buf)
    this.port!.write(buf)
  }

  sendControlMessage = (message: SocketMostSendMessage) => {
    const buf = Buffer.alloc(24)
    buf.writeUint8(0x55, 0)
    buf.writeUint8(20, 1)
    buf.writeUint8(100, 2)
    buf.writeUint8(message.targetAddressHigh, 3)
    buf.writeUint8(message.targetAddressLow, 4)
    buf.writeUint8(message.fBlockID, 5)
    buf.writeUint8(message.instanceID, 6)
    buf.writeUint16LE(message.fktID, 7)
    buf.writeUint8(message.opType, 9)
    buf.writeUint8(message.data.length, 10)
    const data = Buffer.from(message.data)
    data.copy(buf, 11, 0)
    this.port!.write(buf)
  }

  parseData = (data: Buffer) => {
    const header = data.readUInt8(0)
    const len = data.readUInt8(1)
    const type = data.readUInt8(2)
    const buf = data.subarray(3)
    console.log(data)
    switch (type) {
      case 1:
        this.emit(
          Os8104Events.SocketMostMessageRxEvent,
          this.parseMostMessage(buf),
        )
        break
      case 2:
        console.log('shutdown')
        this.emit(Os8104Events.Shutdown)
        break
      case 3:
        console.log('alloc result', data)
        this.emit(Os8104Events.AllocResult, this.parseAllocResponse(buf))
        break
      case 4:
        console.log('message sent')
        this.emit(Os8104Events.MessageSent)
        break
      case 5:
        console.log('locked')
        this.emit(Os8104Events.Locked)
        break
      case 6:
        console.log('unlocked')
        this.emit(Os8104Events.Unlocked)
        break
      case 7:
        console.log('dealloc result')
        this.emit(Os8104Events.DeallocResult, this.parseDeallocResult(buf))
        break
      case 8:
        console.log('node position', data)
        break
      case 9:
        console.log('config request', data)
        this.emit(Os8104Events.UsbConfig, this.parseConfig(buf))
        break
      default:
        console.log('none found: ', data)
    }
  }

  parseConfig = (message: Buffer) => {
    const data: UsbConfig = {
      configSet: message.readUint8(0) ? true : false,
      addrHigh: message.readUint8(1),
      addrLow: message.readUint8(2),
      group: message.readUint8(3),
      amp: {
        addrHigh: message.readUint8(4),
        addrLow: message.readUInt8(5),
        fBlockId: message.readUInt8(6),
        instanceId: message.readUInt8(7),
        interfaceNo: message.readUInt8(8),
      },
      mic: {
        addrHigh: message.readUint8(8),
        addrLow: message.readUInt8(9),
        fBlockId: message.readUInt8(10),
        instanceId: message.readUInt8(11),
        interfaceNo: message.readUInt8(12),
      },
    }
    console.log(data)
    return data
  }

  parseMostMessage = (message: Buffer) => {
    const data: MostRxMessage = {
      type: message.readUint8(0),
      sourceAddrHigh: message.readUint8(1),
      sourceAddrLow: message.readUint8(2),
      fBlockID: message.readUint8(3),
      instanceID: message.readUint8(4),
      fktID: message.slice(5, 7).readUint16BE() >> 4,
      opType: message.readUint16BE(5) & 0xf,
      telID: (message.readUint8(7) & 0xf0) >> 4,
      telLen: message.readUint8(7) & 0xf,
      data:
        message.readUint8(0) > 0x01
          ? message.slice(8, message.length - 1)
          : message.slice(8),
    }
    console.log(data)
    return data
  }

  parseAllocResponse = (data: Buffer): AllocResult => {
    const answer1 = data.readUint8(0)
    const answer2 = data.readUint8(1)
    const cl = data.readUint8(2)
    const loc1 = data.readUint8(2)
    const loc2 = data.readUint8(3)
    const loc3 = data.readUint8(4)
    const loc4 = data.readUint8(5)
    const result: AllocResult = {
      loc1,
      loc2,
      loc3,
      loc4,
      cl,
      eventType: Os8104Events.AllocResult,
    }
    switch (answer1) {
      case 1:
        result.answer1 = 'ALLOC_GRANT'
        result.freeChannels = answer2
        break
      case 2:
        result.answer1 = 'ALLOC_BUSY'
        result.freeChannels = answer2
        break
      case 3:
        result.answer1 = 'ALLOC_DENY'
        result.freeChannels = answer2
        break
      case 4:
        result.answer1 = 'WRONG_TARGET'
        result.freeChannels = answer2
        break
      default:
        result.answer1 = 'ERROR'
        result.freeChannels = 0
    }
    console.log(result)
    return result
  }

  parseDeallocResult = (data: Buffer) => {
    const answer1 = data.readUint8(0)
    const result: DeallocResult = {
      eventType: Os8104Events.DeallocResult,
    }
    switch (answer1) {
      case 1:
        result.answer = 'DEALLOC_GRANT'
        break
      case 2:
        result.answer = 'DEALLOC_BUSY'
        break
      case 3:
        result.answer = 'DEALLOC_WRONG'
        break
      case 4:
        result.answer = 'WRONG_TARGET'
        break
      default:
        result.answer = 'ERROR'
    }
    return result
  }

  getRemoteSource = () => {}

  allocate = () => {
    this.sendAllocateRequest()
  }

  deallocate = () => {}

  stream = () => {}

  retrieveAudio = () => {}

  connectSource = () => {}

  disconnectSource = () => {}
}
