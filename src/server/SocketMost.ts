import fs from 'fs'
import unix from 'unix-dgram'
import { OS8104A } from '../driver/OS8104A'
import {
  AllocResult,
  DeallocResult,
  GetSource,
  MasterFoundEvent,
  MessageOnly,
  MostRxMessage,
  NodePosition,
  Os8104Events,
  RetrieveAudio,
  SocketMostSendMessage,
  SocketTypes,
  Source,
  Stream,
} from '../modules/Messages'
import { ExplorerServer } from './ExplorerServer'
import winston from 'winston'

export type DriverConfig = {
  version: string
  nodeAddress: number
  groupAddress: number
  freq: number
  mostExplorer: boolean
}

const DEFAULT_CONFIG: DriverConfig = {
  version: '1.0.0',
  nodeAddress: 272,
  groupAddress: 34,
  freq: 48,
  mostExplorer: true,
}

export class SocketMost {
  logger: winston.Logger
  configPath: string
  config: DriverConfig
  connected: boolean
  connectInterval?: NodeJS.Timer
  master?: MasterFoundEvent
  udpSocket: unix.Socket
  mostExplorer?: ExplorerServer
  os8104: OS8104A

  constructor() {
    this.configPath = './config.json'
    this.config = DEFAULT_CONFIG
    this.connected = false
    this.logger = winston.loggers.get('socketMostLogger')
    if (fs.existsSync(this.configPath)) {
      this.config = this.checkConfigVersion(
        JSON.parse(fs.readFileSync(this.configPath).toString()),
      )
      this.logger.info(`config file exists: ${JSON.stringify(this.config)}`)
    } else {
      this.logger.info(
        `config doesn't exist, creating default ${JSON.stringify(
          DEFAULT_CONFIG,
        )}`,
      )
      fs.writeFileSync(this.configPath, JSON.stringify(DEFAULT_CONFIG))
    }
    this.udpSocket = unix.createSocket('unix_dgram', () => {})
    this.udpSocket.on('error', () => {
      // this.logger.error('UDP socket error')
      // this.logger.error(e)
      if (this.connected) {
        this.connected = false
        this.connectInterval = setInterval(() => {
          this.udpSocket.connect('/tmp/SocketMost-client.sock')
        }, 1000)
      }
    })

    this.udpSocket.on(SocketTypes.MessageReceived, async (data: Buffer) => {
      this.logger.debug(
        `Socket Most message received: ${JSON.parse(data.toString())}`,
      )
      const event: SocketTypes = JSON.parse(data.toString()).eventType
      switch (event) {
        case SocketTypes.SendControlMessage: {
          //console.log("sending", message)
          const message: SocketMostSendMessage = JSON.parse(data.toString())
          this.logger.debug(`request to send message: ${data.toString()}`)
          this.os8104.sendControlMessage(message)
          this.udpSocket.send(
            Buffer.from(JSON.stringify({ eventType: 'messageSent' })),
          )
          break
        }
        case SocketTypes.GetNodePosition: {
          this.logger.debug('get position request')
          const returnData: NodePosition = {
            nodePosition: this.os8104.getNodePosition(),
            maxPosition: this.os8104.getMaxPosition(),
            eventType: Os8104Events.PositionUpdate,
          }
          // REVIEW This is strange, NodePosition is not stated as a type for streamSend so unsure why no error here
          //  my guess is that it unions the same MessageDefault as the other typed streamSends (MasterFoundEvent, newMessage)
          //  which then makes me think there's something grossly incorrect here, leaving for now for review purposes
          this.streamSend(returnData)
          break
        }
        case SocketTypes.GetMaster: {
          this.logger.debug('get master request')
          if (this.master) {
            this.streamSend(this.master)
          }
          break
        }
        case SocketTypes.Allocate:
          this.logger.debug('allocate request')
          this.os8104.allocate()
          this.logger.debug('allocated')
          break
        case SocketTypes.GetSource: {
          this.logger.debug('get source request')
          const message: GetSource = JSON.parse(data.toString())
          // REVIEW don't particularly like this, had to add connection label as a chained property solely for this
          //  call, need to look into alternatives, it feels like using an outer type (MostMessage in this case)
          //  for a switch statement is not ideal
          this.os8104.getRemoteSource(message.connectionLabel)
          break
        }
        case SocketTypes.Stream: {
          const message: Stream = JSON.parse(data.toString())
          this.logger.debug(`stream request: ${data.toString()}`)
          this.os8104.stream(message)
          break
        }
        case SocketTypes.RetrieveAudio: {
          // TODO remove numbers from key in message
          const message: RetrieveAudio = JSON.parse(data.toString())
          this.logger.debug(`retrieve audio request: ${data.toString()}`)
          this.os8104.retrieveAudio(message)
          break
        }
        case SocketTypes.NewConnection: {
          if (this.os8104.transceiverLocked) {
            this.streamSend({ eventType: Os8104Events.Locked })
          } else {
            this.streamSend({ eventType: Os8104Events.Unlocked })
          }
          break
        }
        case SocketTypes.ConnectSource: {
          const message: Source = JSON.parse(data.toString())
          this.logger.debug(`connect source request: ${data.toString()}`)
          this.os8104.connectSource(message)
          break
        }
        case SocketTypes.DisconnectSource: {
          const message: Source = JSON.parse(data.toString())
          this.logger.debug(`disconnect source request: ${data.toString()}`)
          this.os8104.deAllocateSource(message)
          break
        }
        case SocketTypes.Deallocate: {
          this.logger.debug(`deallocate request`)
          this.os8104.deallocate()
        }
      }
    })

    try {
      fs.unlinkSync('/tmp/SocketMost.sock')
    } catch (e) {
      this.logger.warn(`couldn't unlink socket, might not exist already`)
      /* swallow */
    }
    this.udpSocket.bind('/tmp/SocketMost.sock')
    this.connectInterval = setInterval(
      () => this.udpSocket.connect('/tmp/SocketMost-client.sock'),
      100,
    )
    this.logger.info(
      `creating driver nodeAddress 0x${this.config.nodeAddress.toString(
        16,
      )} groupAddress: 0x${this.config.groupAddress.toString(16)} freq: ${
        this.config.freq
      }`,
    )
    this.os8104 = new OS8104A(
      this.config.nodeAddress,
      this.config.groupAddress,
      this.config.freq,
    )

    this.os8104.on(Os8104Events.MostMessageRx, (message: MostRxMessage) => {
      if (!this.master) {
        if (message.fBlockID === 2) {
          this.master = {
            eventType: Os8104Events.MasterFoundEvent,
            instanceID: message.instanceID,
            sourceAddrHigh: message.sourceAddrHigh,
            sourceAddrLow: message.sourceAddrLow,
          }
          this.logger.info(
            `MOST master found from os8104 ${JSON.stringify(this.master)}`,
          )
          this.streamSend(this.master)
        }
      }
      const newMessage: MostRxMessage = {
        eventType: Os8104Events.SocketMostMessageRxEvent,
        ...message,
      }
      this.logger.debug(
        `MOST message received from os8104: ${JSON.stringify(newMessage)}`,
      )
      this.streamSend(newMessage)
    })

    this.os8104.on(Os8104Events.Shutdown, () => {
      this.logger.warn('shutdown command from os8104')
      this.streamSend({ eventType: Os8104Events.Shutdown })
    })

    this.os8104.on(Os8104Events.AllocResult, (data: AllocResult) => {
      this.logger.info('alloc result from os8104')
      this.streamSend(data)
    })

    this.os8104.on(Os8104Events.MessageSent, () => {
      this.logger.debug('message sent from os8104')
      this.streamSend({ eventType: Os8104Events.MessageSent })
    })

    this.os8104.on(Os8104Events.Locked, () => {
      this.logger.debug('locked from os8104')
      this.streamSend({ eventType: Os8104Events.Locked })
    })

    this.os8104.on(Os8104Events.Unlocked, () => {
      this.logger.debug('unlocked from os8104')
      this.streamSend({ eventType: Os8104Events.Unlocked })
    })

    this.os8104.on(Os8104Events.DeallocResult, (data: DeallocResult) => {
      this.logger.debug(`dealloc result from os8104 ${JSON.stringify(data)}`)
      this.streamSend(data)
    })

    if (this.config.mostExplorer) {
      this.logger.info('most explorer enabled, starting server....')
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
    }

    process.on('SIGINT', () => {
      this.logger.warn('SIGINT received closing UDP socket')
      this.udpSocket.close()
      process.exit()
    })
  }

  // When passing os8104 functions direct there were undefined for values, even when binding to `this`. I've
  // created this external functions as a work around
  // TODO needs revisiting
  extSendControlMessage = (message: SocketMostSendMessage) => {
    this.logger.debug(`external send message: ${JSON.stringify(message)}`)
    this.os8104.sendControlMessage(message)
  }
  extGetRemoteSource = (connectionLabel: number) => {
    this.logger.debug(`external getSource: 0x${connectionLabel.toString(16)}`)
    this.os8104.getRemoteSource(connectionLabel)
  }
  extAllocate = () => {
    this.logger.debug(`external allocate`)
    this.os8104.allocate()
  }
  extDeallocate = () => {
    this.logger.debug('external deallocate')
    this.os8104.deallocate()
  }
  extStream = (stream: Stream) => {
    this.logger.debug(`external stream ${JSON.stringify(stream)}`)
    this.os8104.stream(stream)
  }
  extRetrieveAudio = (bytes: RetrieveAudio) => {
    this.logger.debug(`external receive audio ${JSON.stringify(bytes)}`)
    this.os8104.retrieveAudio(bytes)
  }

  extConnectSource = (data: Source) => {
    this.logger.debug(`external getSource: ${JSON.stringify(data)}`)
    this.os8104.connectSource(data)
  }

  extDisonnectSource = (data: Source) => {
    this.logger.debug(`external disconnect source: ${JSON.stringify(data)}`)
    this.os8104.deAllocateSource(data)
  }

  streamSend = (
    data:
      | MasterFoundEvent
      | MostRxMessage
      | MessageOnly
      | AllocResult
      | NodePosition
      | DeallocResult,
  ) => {
    this.logger.debug(`sending to client ${data}`)
    this.udpSocket.send(Buffer.from(JSON.stringify(data)))
    if (this.config.mostExplorer && data.eventType === 'newMessage') {
      this.mostExplorer?.newMessageRx(data)
    }
  }

  checkConfigVersion(config: DriverConfig) {
    let modified = false
    Object.keys(DEFAULT_CONFIG).forEach(key => {
      if (!Object.keys(config).includes(key)) {
        this.logger.warn(`config out of date, setting defaults`)
        // @ts-ignore
        config[key] = DEFAULT_CONFIG[key]
        modified = true
      }
    })
    if (modified) {
      fs.writeFileSync(this.configPath, JSON.stringify(config))
    }
    return config
  }
}
