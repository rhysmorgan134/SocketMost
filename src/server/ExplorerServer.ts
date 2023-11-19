import EventEmitter from 'events'
import { Server } from 'socket.io'
import dgram from 'dgram'
import {
  AllocResult,
  MasterFoundEvent,
  MessageOnly,
  MostRxMessage,
  NodePosition,
  RetrieveAudio,
  SocketMostSendMessage,
  Stream,
} from '../modules/Messages'

const REQ_REGISTRY: SocketMostSendMessage = {
  eventType: 'sendControlMessage',
  targetAddressHigh: 0x04,
  targetAddressLow: 0x00,
  fBlockID: 0x02,
  instanceID: 0x00,
  fktId: 0xa01,
  opType: 0x01,
  data: [],
}

export class ExplorerServer extends EventEmitter {
  io: Server
  serverListener: dgram.Socket
  sendControlMessage: (message: SocketMostSendMessage, telId?: number) => void
  getRemoteSource: (connectionLabel: number) => void
  allocate: () => void
  stream: (stream: Stream) => void
  retrieveAudio: (audio: RetrieveAudio) => void

  constructor(
    sendControlMessage: (
      message: SocketMostSendMessage,
      telId?: number,
    ) => void,
    getRemoteSource: (connectionLabel: number) => void,
    allocate: () => void,
    stream: (stream: Stream) => void,
    retrieveAudio: (audio: RetrieveAudio) => void,
  ) {
    super()
    this.sendControlMessage = sendControlMessage
    this.getRemoteSource = getRemoteSource
    this.allocate = allocate
    this.stream = stream
    this.retrieveAudio = retrieveAudio
    this.io = new Server()
    this.serverListener = dgram.createSocket('udp4')
    this.io.on('connection', socket => {
      socket.on
    })
    this.io.listen(5556)

    this.serverListener.on('listening', () => {
      const address = this.serverListener.address()
      console.log(
        'Listening for Most-Explorer requests on ' +
          address.address +
          ':' +
          address.port,
      )
    })

    this.serverListener.on('message', (message, remote) => {
      console.log(
        'SERVER RECEIVED:',
        remote.address + ':' + remote.port + ' - ' + message,
      )
      const response = 'Hello there!'
      this.serverListener.send(
        response,
        0,
        response.length,
        remote.port,
        remote.address,
      )
    })

    this.io.on('connection', socket => {
      socket.on('requestRegistry', () => {
        this.sendControlMessage(REQ_REGISTRY)
      })
      socket.on('getSource', data => {
        this.getRemoteSource(data.connectionLabel)
      })
      socket.on('allocate', () => {
        this.allocate()
      })
      socket.on('stream', (data: Stream) => {
        this.stream(data)
      })
      socket.on('retrieveAudio', (data: RetrieveAudio) => {
        this.retrieveAudio(data)
      })
    })

    this.serverListener.bind(5555)
  }

  newMessageRx(
    data:
      | MasterFoundEvent
      | MostRxMessage
      | MessageOnly
      | AllocResult
      | NodePosition,
  ) {
    this.io.emit('message', data)
  }
}
