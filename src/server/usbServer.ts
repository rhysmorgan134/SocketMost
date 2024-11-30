import { SocketMostUsb } from '../client/SocketMost-usb'
import { ExplorerServer } from './ExplorerServer'
import {
  AllocResult,
  DeallocResult,
  MasterFoundEvent,
  MessageOnly,
  MostRxMessage,
  NodePosition,
  Os8104Events,
  RetrieveAudio,
  SocketMostSendMessage,
  Source,
  Stream,
} from '../modules/Messages'
import winston from 'winston'

export class UsbServer {
  os8104: SocketMostUsb
  mostExplorer: ExplorerServer
  logger: winston.Logger
  constructor(os8104: SocketMostUsb) {
    this.os8104 = os8104
    this.logger = winston.loggers.get('socketMostLogger')
    this.mostExplorer = new ExplorerServer(
      this.extSendControlMessage,
      this.extGetRemoteSource,
      this.extAllocate,
      this.extStream,
      this.extRetrieveAudio,
      this.extConnectSource,
      this.extDisonnectSource,
      this.extDeallocate,
    )
    this.os8104.on(
      Os8104Events.SocketMostMessageRxEvent,
      (message: MostRxMessage) => {
        const newMessage: MostRxMessage = {
          eventType: Os8104Events.SocketMostMessageRxEvent,
          ...message,
        }
        this.logger.debug(
          `MOST message received from os8104: ${JSON.stringify(newMessage)}`,
        )
        this.mostExplorer?.newMessageRx(newMessage)
      },
    )
  }

  extSendControlMessage = (message: SocketMostSendMessage) => {
    this.logger.debug(`external send message: ${JSON.stringify(message)}`)
    this.os8104.sendControlMessage(message)
  }
  extGetRemoteSource = (connectionLabel: number) => {
    this.logger.debug(`external getSource: 0x${connectionLabel.toString(16)}`)
    this.os8104.getRemoteSource()
  }
  extAllocate = () => {
    this.logger.debug(`external allocate`)
    this.os8104.allocate()
  }
  extDeallocate = () => {
    this.logger.debug('external deallocate')
    this.os8104.deallocate()
  }
  //TODO implement the below functions in socketmostusb
  extStream = (stream: Stream) => {
    this.logger.debug(`external stream ${JSON.stringify(stream)}`)
    // this.os8104.stream(stream)
  }
  extRetrieveAudio = (bytes: RetrieveAudio) => {
    this.logger.debug(`external receive audio ${JSON.stringify(bytes)}`)
    // this.os8104.retrieveAudio(bytes)
  }

  extConnectSource = (data: Source) => {
    this.logger.debug(`external getSource: ${JSON.stringify(data)}`)
    // this.os8104.connectSource(data)
  }

  extDisonnectSource = (data: Source) => {
    this.logger.debug(`external disconnect source: ${JSON.stringify(data)}`)
    // this.os8104.deAllocateSource(data)
  }
}

// When passing os8104 functions direct there were undefined for values, even when binding to `this`. I've
// created this external functions as a work around
// TODO needs revisiting

import { SocketMost } from './SocketMost'
