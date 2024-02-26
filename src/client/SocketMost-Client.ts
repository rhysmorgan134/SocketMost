import { DataGram } from './DataGram'
import EventEmitter from 'events'
import {
  AllocResult,
  MasterFoundEvent,
  MessageOnly,
  NodePosition,
  Os8104Events,
  MostRxMessage,
  RetrieveAudio,
  SocketMostSendMessage,
  SocketTypes,
  Stream,
  GetSource,
  Source,
  DeallocResult,
} from '../modules/Messages'

export class SocketMostClient extends EventEmitter {
  client: DataGram
  maxPosition: number
  nodePosition: number

  constructor() {
    super()
    this.client = new DataGram(
      '/tmp/SocketMost-client.sock',
      '/tmp/SocketMost.sock',
    )

    this.client.on('connect', () => {
      console.log('connected')
      this.getPositions().then(() => {
        console.log('resolved')
      })
      this.emit('connected')
    })

    this.maxPosition = 0
    this.nodePosition = 0

    this.client.on('data', data => {
      const event: Os8104Events = JSON.parse(data.toString()).eventType
      switch (event) {
        case Os8104Events.SocketMostMessageRxEvent: {
          const message: MostRxMessage = JSON.parse(data.toString())
          this.emit(Os8104Events.SocketMostMessageRxEvent, message)
          break
        }
        case Os8104Events.PositionUpdate: {
          const message: NodePosition = JSON.parse(data.toString())
          this.maxPosition = message.maxPosition
          this.nodePosition = message.nodePosition
          this.emit(Os8104Events.PositionUpdate, message)
          break
        }
        case Os8104Events.Locked:
          this.emit(Os8104Events.Locked)
          break
        case Os8104Events.MessageSent:
          this.emit(Os8104Events.MessageSent)
          break
        case Os8104Events.MasterFoundEvent: {
          const message: MasterFoundEvent = JSON.parse(data.toString())
          this.emit(Os8104Events.MasterFoundEvent, message)
          break
        }
        case Os8104Events.AllocResult: {
          const message: AllocResult = JSON.parse(data.toString())
          this.emit(Os8104Events.AllocResult, message)
          break
        }
        case Os8104Events.DeallocResult: {
          const message: DeallocResult = JSON.parse(data.toString())
          this.emit(Os8104Events.DeallocResult, message)
          break
        }
        default:
          console.log('no match', event)
      }
    })
  }

  getPositions(): Promise<void> {
    return new Promise((resolve, reject) => {
      const data: MessageOnly = {
        eventType: SocketTypes.GetNodePosition,
      }
      this.sendAppMessage(data)
      const positionTimeout = setTimeout(() => {
        reject('Get Node Position Message Time Out')
        console.log('position request timed out')
      }, 20)
      this.once('positionUpdate', () => {
        console.log('resolving')
        clearTimeout(positionTimeout)
        resolve()
      })
    })
  }

  // parseMostMessage (message) {
  //     let data = {
  //         fBlockID: message.data.readUint8(0),
  //         instanceID: message.data.readUint8(1),
  //         fktId: (message.data.slice(2,4).readUint16BE() >> 4),
  //         opType: ((message.data.readUint16BE(2) & 0xF)),
  //         telId: (message.data.readUint8(4) & 0xF0) >>4,
  //         telLen: (message.data.readUint8(4) & 0xF),
  //         data: message.type > 0x01 ? message.data.slice(5, message.data.length - 1) : message.data.slice(5),
  //         sourceAddrHigh: message.sourceAddrHigh,
  //         sourceAddrLow: message.sourceAddrLow
  //     }
  //
  //     let messageOut = {...data}
  //     messageOut.data = [...message.data]
  //     if(!this.networkMaster) {
  //         if(message.fBlockID === 2) {
  //             console.log("network master found")
  //         }
  //     }
  //     return data
  // }

  sendAppMessage(
    data:
      | SocketMostSendMessage
      | MessageOnly
      | ({ eventType: 'getSource' } & GetSource),
  ) {
    this.client.write(JSON.stringify(data))
  }

  getMaster() {
    this.client.write(JSON.stringify({ eventType: 'getMaster' }) + '\r\n')
  }

  sendControlMessage(data: SocketMostSendMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.write(
        JSON.stringify({ eventType: 'sendControlMessage', ...data }),
      )
      const controlMessageTimeout = setTimeout(() => {
        reject('sendMessage request timed out')
      }, 50)
      this.once('messageSent', () => {
        console.log('resolving sent Message')
        clearTimeout(controlMessageTimeout)
        resolve()
      })
    })
  }

  allocate() {
    this.client.write(JSON.stringify({ eventType: 'allocate' }))
  }

  stream(data: Stream) {
    this.client.write(JSON.stringify({ eventType: 'stream', ...data }) + '\r\n')
  }

  retrieveAudio(data: RetrieveAudio) {
    this.client.write(JSON.stringify({ eventType: 'retrieveAudio', ...data }))
  }

  connectSource(data: Source) {
    this.client.write(
      JSON.stringify({ eventType: SocketTypes.ConnectSource, ...data }),
    )
  }

  disconnectSource(data: Source) {
    this.client.write(
      JSON.stringify({ eventType: SocketTypes.DisconnectSource, ...data }),
    )
  }
}
