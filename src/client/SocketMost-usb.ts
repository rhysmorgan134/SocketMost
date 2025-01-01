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
  TargetMostMessage,
  UsbConfig,
  UsbSettings,
} from '../modules/Messages'
import winston from 'winston'
const { exec } = require('child_process')

export class SocketMostUsb extends EventEmitter {
  portFound: boolean
  portInterval: NodeJS.Timeout
  port?: SerialPort
  parser?: PacketLengthParser | InterByteTimeoutParser
  multiPartMessage?: TargetMostMessage<number[]>
  multiPartSequence: number
  position: number
  logger: winston.Logger
  usbDebug: winston.Logger
  locked: boolean
  settings?: UsbSettings
  constructor() {
    super()
    this.portFound = false
    this.multiPartSequence = 0
    this.position = 0
    this.locked = false
    this.logger = winston.loggers.get('driverLogger')
    this.usbDebug = winston.loggers.get('usbDebugger')
    this.portInterval = setInterval(() => {
      this.findPort()
    }, 1000)
  }

  findPort() {
    SerialPort.list().then(ports => {
      ports.forEach(port => {
        if (port.productId == '4011') {
          if (!this.portFound) {
            //console.log('found', port.manufacturer)

            clearInterval(this.portInterval)
            this.port = new SerialPort({
              path: port.path,
              baudRate: 115200,
              lock: false,
            })

            this.port.on('open', () => {
              this.emit('opened')
              this.getSettings()
            })

            this.port.on('close', () => {
              this.portFound = false
              this.portInterval = setInterval(() => {
                this.findPort()
              }, 1000)
            })

            this.port.on('error', err => {
              console.log(err)
              this.emit('error')
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
    //console.log('sending', buf)
    this.port!.write(buf)
  }

  sendConfigRequest() {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(111, 2)
    //console.log('sending config request', buf)
    this.port!.write(buf)
  }

  sendDellocateRequest() {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(110, 2)
    //console.log('sending', buf)
    this.port!.write(buf)
  }

  sendConnectMic() {
    const buf = Buffer.alloc(4)
    buf.writeUInt32LE(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(112, 2)
    //console.log('sending', buf)
    this.port!.write(buf)
  }

  sendCheckForLock() {
    const buf = Buffer.alloc(4)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(107, 2)
    //console.log('sending lock check', buf)
    this.port!.write(buf)
  }

  sendShutDown() {
    const buf = Buffer.alloc(4)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(113, 2)
    console.log('sending shutdown Ack', buf)
    this.port!.write(buf)
    setTimeout(() => {
      exec('sudo shutdown now')
    }, 500)
  }

  sendControlMessage = (message: SocketMostSendMessage, telId = 0) => {
    if (this.locked) {
      if (message.data.length > 12) {
        //console.log('send multiplart message request')
        this.multiPartSequence = 0
        this.multiPartMessage = {
          targetAddressHigh: message.targetAddressHigh,
          targetAddressLow: message.targetAddressLow,
          fBlockID: message.fBlockID,
          instanceID: message.instanceID,
          fktID: message.fktID,
          opType: message.opType,
          data: [...message.data],
        }
        this.sendMultiPartMessage()
      } else {
        const buf = Buffer.alloc(25)
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
        buf.writeUint8(telId, 11)
        const data = Buffer.from(message.data)
        data.copy(buf, 12, 0)
        this.port!.write(buf)
      }
    } else {
      this.emit(Os8104Events.MessageSent, Buffer.from([255]))
    }
  }

  sendMultiPartMessage() {
    const tempMessage = { ...this.multiPartMessage! }
    this.multiPartMessage!.data.length > 11
      ? (tempMessage.data = this.multiPartMessage!.data.splice(0, 11))
      : (tempMessage.data = this.multiPartMessage!.data)
    //console.log('spliced data is: ', tempMessage.data)
    //console.log('remaining data is: ', this.multiPartMessage?.data)
    tempMessage.data = [this.multiPartSequence, ...tempMessage.data]
    let telId
    // In a multipart message telId represents the beginning, middle and end of the message, telId = 1 means first message, telId = 2 means message continuing
    // telId = 3 means final message
    if (this.multiPartSequence === 0) {
      telId = 1
      //console.log('tel id: ', telId)
      //console.log(tempMessage.data.length)
    } else if (tempMessage.data.length <= 11) {
      telId = 3
      //console.log('tel id: ', telId)
      //console.log(tempMessage.data.length)
    } else {
      telId = 2
      //console.log('tel id: ', telId)
      //console.log(tempMessage.data.length)
    }
    this.sendControlMessage(tempMessage, telId)
    if (telId !== 3) {
      this.once('messageSent', () => {
        this.multiPartSequence += 1
        this.sendMultiPartMessage()
      })
    }
  }

  parseData = (data: Buffer) => {
    const type = data.readUInt8(2)
    const buf = data.subarray(3)
    //console.log(data)
    switch (type) {
      case 1:
        this.emit(
          Os8104Events.SocketMostMessageRxEvent,
          this.parseMostMessage(buf),
        )
        break
      case 2:
        //console.log('shutdown')
        this.emit(Os8104Events.Shutdown)
        break
      case 3:
        //console.log('alloc result', data)
        this.emit(Os8104Events.AllocResult, this.parseAllocResponse(buf))
        break
      case 4:
        //console.log('message sent')
        this.emit(Os8104Events.MessageSent, buf)
        break
      case 5:
        //console.log('locked')
        this.emit(Os8104Events.Locked)
        this.locked = true
        setTimeout(() => {
          this.getPosition()
        }, 10)
        break
      case 6:
        //console.log('unlocked')
        this.locked = false
        this.emit(Os8104Events.Unlocked)
        break
      case 7:
        //console.log('dealloc result')
        this.emit(Os8104Events.DeallocResult, this.parseDeallocResult(buf))
        break
      case 8:
        //console.log('node position', data)
        this.position = data.readUInt8(3)
        this.emit(Os8104Events.PositionUpdate, data.readUInt8(3))
        break
      case 9:
        //console.log('config request', data)
        break
      case 10:
        //console.log('shutdown request', data)
        this.sendShutDown()
        break
      case 11:
        this.parseSettings(buf)
        break
      case 12:
        this.usbDebug.info(buf.toString())
        break
      case 13:
        this.parseDebugInfo(buf)
        break
      default:
        console.log('none found: ', data)
    }
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
    //console.log(data)
    return data
  }

  parseSettings = (data: Buffer) => {
    const settings: UsbSettings = {
      version: data.slice(0, 5).toString(),
      standalone: data.readUInt8(5) & 1 ? true : false,
      autoShutdown: data.readUInt8(5) & 2 ? true : false,
      customShutdown: data.readUInt8(5) & 4 ? true : false,
      auxPower: data.readUInt8(5) & 8 ? true : false,
      forty8Khz: data.readUInt8(5) & 16 ? true : false,
      debug: data.readUInt8(5) & 32 ? true : false,
      spare4: data.readUInt8(5) & 64 ? true : false,
      spare5: data.readUInt8(5) & 128 ? true : false,
      nodeAddressHigh: data.readUInt8(6),
      nodeAddressLow: data.readUInt8(7),
      groupAddress: data.readUInt8(8),
      shutdownTimeDelay: data.readUInt32LE(12),
      startupTimeDelay: data.readUInt32LE(16),
      customShutdownMessage: {
        fblockId: data.readUInt8(20),
        fktId: data.readUInt8(22),
        optype: data.readUInt8(24),
        data: Array.from(data.slice(25, 37)), //31
      },
      amplifier: {
        fblockId: data.readUInt8(38),
        targetAddressHigh: data.readUInt8(39),
        targetAddressLow: data.readUInt8(40),
        instanceId: data.readUInt8(41),
        sinkNumber: data.readUInt8(42),
      },
      microphone: {
        fblockId: 0,
        targetAddressHigh: 0,
        targetAddressLow: 0,
        instanceId: 0,
        sinkNumber: 0,
      },
    }
    this.settings = settings
    this.emit(Os8104Events.Settings, settings)
    console.log('settings received!', settings)
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
    //console.log(result)
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

  deallocate = () => {
    this.sendDellocateRequest()
  }

  stream = () => {}

  retrieveAudio = () => {}

  connectSource = () => {}

  disconnectSource = () => {}

  bootToDFU = () => {
    const buf = Buffer.alloc(3)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(99, 2)
  }

  getPosition = () => {
    const buf = Buffer.alloc(4)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(101, 2)
    //console.log('sending position request', buf)
    this.port!.write(buf)
  }

  getSettings = () => {
    const buf = Buffer.alloc(4)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(115, 2)
    //console.log('sending position request', buf)
    this.port!.write(buf)
  }

  forceSwitch = () => {
    const buf = Buffer.alloc(4)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(116, 2)
    //console.log('sending position request', buf)
    this.port!.write(buf)
  }

  getAddress = () => {
    return {
      nodeAddressHigh: this.settings?.nodeAddressHigh,
      nodeAddressLow: this.settings?.nodeAddressLow,
    }
  }

  saveSettings = (settings: UsbSettings) => {
    let bitField = 0
    bitField |= (settings.standalone ? 1 : 0) << 0
    bitField |= (settings.autoShutdown ? 1 : 0) << 1
    bitField |= (settings.customShutdown ? 1 : 0) << 2
    bitField |= (settings.auxPower ? 1 : 0) << 3
    bitField |= (settings.forty8Khz ? 1 : 0) << 4
    bitField |= (settings.debug ? 1 : 0) << 5
    const buf = Buffer.alloc(51)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(40, 1)
    buf.writeUint8(114, 2)
    const version = Buffer.from(settings.version)
    version.copy(buf, 3, 0, 5)
    buf.writeUint8(bitField, 8)
    buf.writeUint8(settings.nodeAddressHigh, 9)
    buf.writeUint8(settings.nodeAddressLow, 10)
    buf.writeUint8(settings.groupAddress, 11)
    buf.writeUInt32LE(settings.shutdownTimeDelay, 15)
    buf.writeUInt32LE(settings.startupTimeDelay, 19)
    buf.writeUint8(settings.customShutdownMessage.fblockId, 23)
    buf.writeUint8(0xff, 24)
    buf.writeUint16LE(settings.customShutdownMessage.fktId, 25)
    buf.writeUint8(settings.customShutdownMessage.optype, 27)
    buf.fill(Buffer.from(settings.customShutdownMessage.data), 28, 40)
    buf.writeUint8(settings.amplifier.fblockId, 40)
    buf.writeUint8(settings.amplifier.fblockId, 41)
    buf.writeUint8(settings.amplifier.targetAddressHigh, 42)
    buf.writeUint8(settings.amplifier.targetAddressLow, 43)
    buf.writeUint8(settings.amplifier.instanceId, 44)
    buf.writeUint8(settings.amplifier.sinkNumber, 45)
    buf.writeUint8(settings.microphone.fblockId, 46)
    buf.writeUint8(settings.microphone.targetAddressHigh, 47)
    buf.writeUint8(settings.microphone.targetAddressLow, 48)
    buf.writeUint8(settings.microphone.instanceId, 49)
    buf.writeUint8(settings.microphone.sinkNumber, 50)
    console.log(buf)
    this.port!.write(buf)
  }

  getAllDebugInfo() {
    const buf = Buffer.alloc(4)
    buf.writeUInt8(0x55, 0)
    buf.writeUint8(1, 1)
    buf.writeUint8(117, 2)
    //console.log('sending position request', buf)
    this.port!.write(buf)
  }

  parseDebugInfo(buf: Buffer) {
    this.usbDebug.info(buf.toString('hex').match(/[0-9]{2}/g))
  }
}
