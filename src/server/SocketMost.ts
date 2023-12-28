import fs from 'fs'
import unix from 'unix-dgram'
import { OS8104A } from '../driver/OS8104A'
import {
  AllocResult,
  GetSource,
  MasterFoundEvent,
  MessageOnly,
  NodePosition,
  Os8104Events,
  MostRxMessage,
  RetrieveAudio,
  SocketMostSendMessage,
  SocketTypes,
  Stream,
} from '../modules/Messages'
import { ExplorerServer } from './ExplorerServer'

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
    this.udpSocket = unix.createSocket('unix_dgram', () => {
      if (fs.existsSync(this.configPath)) {
        console.log('file exists')
        this.config = this.checkConfigVersion(
          JSON.parse(fs.readFileSync(this.configPath).toString()),
        )
      } else {
        fs.writeFileSync(this.configPath, JSON.stringify(DEFAULT_CONFIG))
      }
    })
    this.udpSocket.on('error', () => {
      if (this.connected) {
        this.connected = false
        this.connectInterval = setInterval(() => {
          this.udpSocket.connect('/tmp/SocketMost-client.sock')
        }, 100)
      }
    })

    this.udpSocket.on(SocketTypes.MessageReceived, async (data: Buffer) => {
      const event: SocketTypes = JSON.parse(data.toString()).eventType
      switch (event) {
        case SocketTypes.SendControlMessage: {
          //console.log("sending", message)
          const message: SocketMostSendMessage = JSON.parse(data.toString())
          this.os8104.sendControlMessage(message)
          // TODO is this really needed? sendControlMessage doesn't return and is not async, so in what case is this
          //  actually required? No types set for now as suspect it needs to go
          this.udpSocket.send(
            Buffer.from(JSON.stringify({ eventType: 'messageSent' })),
          )
          break
        }
        case SocketTypes.GetNodePosition: {
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
          if (this.master) {
            this.streamSend(this.master)
          }
          break
        }
        case SocketTypes.Allocate:
          console.log('awaited', this.os8104.allocate())
          break
        case SocketTypes.GetSource: {
          const message: GetSource = JSON.parse(data.toString())
          // REVIEW don't particularly like this, had to add connection label as a chained property solely for this
          //  call, need to look into alternatives, it feels like using an outer type (MostMessage in this case)
          //  for a switch statement is not ideal
          this.os8104.getRemoteSource(message.connectionLabel)
          break
        }
        case SocketTypes.Stream: {
          const message: Stream = JSON.parse(data.toString())
          this.os8104.stream(message)
          break
        }
        case SocketTypes.RetrieveAudio: {
          // TODO remove numbers from key in message
          const message: RetrieveAudio = JSON.parse(data.toString())
          this.os8104.retrieveAudio(message)
          break
        }
        case SocketTypes.NewConnection: {
          if (this.os8104.transceiverLocked) {
            this.streamSend({ eventType: Os8104Events.Locked })
          } else {
            this.streamSend({ eventType: Os8104Events.Unlocked })
          }
        }
      }
    })

    try {
      fs.unlinkSync('/tmp/SocketMost.sock')
    } catch (e) {
      /* swallow */
    }
    this.udpSocket.bind('/tmp/SocketMost.sock')
    this.connectInterval = setInterval(
      () => this.udpSocket.connect('/tmp/SocketMost-client.sock'),
      100,
    )
    this.os8104 = new OS8104A(
      this.config.nodeAddress,
      this.config.groupAddress,
      this.config.freq,
    )

    this.os8104.on(Os8104Events.MostMessageRx, (message: MostRxMessage) => {
      // console.log('message', message)
      if (!this.master) {
        if (message.fBlockID === 2) {
          console.log('master found')
          this.master = {
            eventType: Os8104Events.MasterFoundEvent,
            instanceID: message.instanceID,
            sourceAddrHigh: message.sourceAddrHigh,
            sourceAddrLow: message.sourceAddrLow,
          }
          this.streamSend(this.master)
        }
      }
      const newMessage: MostRxMessage = {
        eventType: Os8104Events.SocketMostMessageRxEvent,
        ...message,
      }
      this.streamSend(newMessage)
    })

    this.os8104.on(Os8104Events.Shutdown, () => {
      this.streamSend({ eventType: Os8104Events.Shutdown })
    })

    this.os8104.on(Os8104Events.AllocResult, (data: AllocResult) => {
      this.streamSend(data)
    })

    this.os8104.on(Os8104Events.MessageSent, () => {
      this.streamSend({ eventType: Os8104Events.MessageSent })
    })

    this.os8104.on(Os8104Events.Locked, () => {
      console.log('locked')
      this.streamSend({ eventType: Os8104Events.Locked })
    })

    this.os8104.on(Os8104Events.Unlocked, () => {
      console.log('unlocked')
      this.streamSend({ eventType: Os8104Events.Unlocked })
    })

    if (this.config.mostExplorer) {
      this.mostExplorer = new ExplorerServer(
        this.extSendControlMessage,
        this.extGetRemoteSource,
        this.extAllocate,
        this.extStream,
        this.extRetrieveAudio,
      )
    }

    process.on('SIGINT', () => {
      console.log('Caught interrupt signal')
      this.udpSocket.close()
      process.exit()
    })
  }

  // When passing os8104 functions direct there were undefined for values, even when binding to `this`. I've
  // created this external functions as a work around
  // TODO needs revisiting
  extSendControlMessage = (message: SocketMostSendMessage) => {
    this.os8104.sendControlMessage(message)
  }
  extGetRemoteSource = (connectionLabel: number) => {
    this.os8104.getRemoteSource(connectionLabel)
  }
  extAllocate = () => {
    this.os8104.allocate()
  }
  extStream = (stream: Stream) => {
    this.os8104.stream(stream)
  }
  extRetrieveAudio = (bytes: RetrieveAudio) => {
    this.os8104.retrieveAudio(bytes)
  }

  streamSend = (
    data:
      | MasterFoundEvent
      | MostRxMessage
      | MessageOnly
      | AllocResult
      | NodePosition,
  ) => {
    this.udpSocket.send(Buffer.from(JSON.stringify(data)))
    if (this.config.mostExplorer && data.eventType === 'newMessage') {
      this.mostExplorer?.newMessageRx(data)
    } else {
      console.log('discarding', data)
    }
  }

  checkConfigVersion = (config: DriverConfig) => {
    let modified = false
    Object.keys(DEFAULT_CONFIG).forEach(key => {
      if (!Object.keys(config).includes(key)) {
        console.log('missing config key, setting default')
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
