import { SocketMostClient } from '../client/SocketMost-Client'
import { SocketMostUsb } from '../client/SocketMost-usb'
import {
  AllocResult,
  ModuleSingle,
  MostRxMessage,
  Os8104Events,
  SocketMostSendMessage,
  Source,
} from './Messages'
import EventEmitter from 'events'
import getAppDataPath from 'appdata-path'
import fs from 'fs'
import path from 'node:path'
import { clearInterval } from 'node:timers'

export type SourceRecord = {
  fBlockID: number
  instanceID: number
  shadow: number
  addressHigh: number
  addressLow: number
  name: string
}
// 405 - assign shadow? 407 - allocate and connect, 406 - unassign shadow?, 408 - deallocate and disconenct

const subscriptionList = [
  {
    addrHigh: 1,
    addrLow: 128,
    fBlockId: 49,
    instanceId: 2,
    functions: [],
  },
  {
    addrHigh: 1,
    addrLow: 97,
    fBlockId: 240,
    instanceId: 1,
    functions: [],
  },
  {
    addrHigh: 1,
    addrLow: 128,
    fBlockId: 64,
    instanceId: 1,
    functions: [],
  },
  {
    addrHigh: 1,
    addrLow: 97,
    fBlockId: 34,
    instanceId: 161,
    functions: [],
  },
  {
    addrHigh: 1,
    addrLow: 134,
    fBlockId: 34,
    instanceId: 5,
    functions: [],
  },
  {
    addrHigh: 1,
    addrLow: 97,
    fBlockId: 34,
    instanceId: 161,
    functions: [],
  },
  {
    addrHigh: 1,
    addrLow: 97,
    fBlockId: 245,
    instanceId: 1,
    functions: [],
  },
  {
    addrHigh: 1,
    addrLow: 97,
    fBlockId: 113,
    instanceId: 161,
    functions: [],
  },
]

const sourceMap: Record<string, SourceRecord> = {
  amFmTuner: {
    fBlockID: 0x40,
    instanceID: 0x01,
    shadow: 0xa1,
    addressHigh: 0x01,
    addressLow: 0x80,
    name: 'amFmTuner',
  },
  dabTuner: {
    fBlockID: 0x43,
    instanceID: 0x01,
    shadow: 0xa1,
    addressHigh: 0x01,
    addressLow: 0x80,
    name: 'dabTuner',
  },
  audioDiskPlayer: {
    fBlockID: 0x31,
    instanceID: 0x02,
    shadow: 0xa1,
    addressHigh: 0x01,
    addressLow: 0x80,
    name: 'audioDiskPlayer',
  },
  usbAudio: {
    fBlockID: 0x31,
    instanceID: 0x05,
    shadow: 0xa2,
    addressHigh: 0x01,
    addressLow: 0x6e,
    name: 'usbAudio',
  },
  unknown: {
    fBlockID: 0x23,
    instanceID: 0x05,
    shadow: 0xa1,
    addressHigh: 0x01,
    addressLow: 0x86,
    name: 'unknown',
  },
  auxIn: {
    fBlockID: 0x24,
    instanceID: 0x01,
    shadow: 0xa1,
    addressHigh: 0x01,
    addressLow: 0x80,
    name: 'auxIn',
  },
  carplay: {
    fBlockID: 0x31,
    instanceID: 0x03,
    shadow: 0xa4,
    addressHigh: 0x01,
    addressLow: 0x6e,
    name: 'carplay',
  },
}
export class JlrAudioControl extends EventEmitter {
  driver: SocketMostUsb | SocketMostClient
  position: number
  connectInterval?: NodeJS.Timer
  readyTimer?: NodeJS.Timeout
  sources: Record<string, SourceRecord>
  currentSource: null | SourceRecord
  nextSource: null | SourceRecord
  ready: boolean
  blocksSent: boolean
  firstFblocks: boolean
  lastHeartBeat: number
  heartBeat?: NodeJS.Timeout
  allocRequest?: MostRxMessage
  deallocRequest?: MostRxMessage
  subscriptionList: ModuleSingle[]
  toSubscribe: ModuleSingle[]
  lastSubscription?: number
  subscriptionTimeout?: NodeJS.Timeout
  subscriptions: ModuleSingle[]
  defaultSource: SourceRecord
  configPath: string
  retryInterval?: NodeJS.Timeout
  constructor(driver: SocketMostUsb | SocketMostClient) {
    super()
    this.sources = sourceMap
    this.configPath = path.join(getAppDataPath('jlr-hu'), 'config-jlr.json')
    if (fs.existsSync(this.configPath)) {
      const data = JSON.parse(fs.readFileSync(this.configPath).toString())
      this.defaultSource = data.lastSource
      console.log('config exists ', data)
    } else {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify({ lastSource: sourceMap.amFmTuner }),
      )
      this.defaultSource = sourceMap.amFmTuner
      console.log('config created ')
    }
    this.driver = driver
    this.position = 0

    this.subscriptions = []
    this.subscriptionList = subscriptionList
    this.toSubscribe = []
    this.currentSource = null
    this.nextSource = null
    this.ready = false
    this.blocksSent = false
    this.firstFblocks = true
    this.lastHeartBeat = 55
    this.driver.on(Os8104Events.PositionUpdate, data => {
      //console.log('updating position: ', data)
      this.position = data
    })

    this.driver.on('unlocked', () => {
      this.currentSource = null
      this.ready = false
      this.blocksSent = false
      this.firstFblocks = true
      this.currentSource = null
      if (this.readyTimer) {
        clearTimeout(this.readyTimer)
      }
      if (this.heartBeat) {
        clearInterval(this.heartBeat)
      }
    })
    this.driver.on(Os8104Events.MessageSent, data => {
      console.log('send result', data)
    })
    this.driver.on('locked', () => {
      setTimeout(() => {
        this.ready = true
      }, 50)
    })
  }

  parseMessage(message: MostRxMessage): void {
    if (
      message.fBlockID == 0x01 &&
      message.fktID == 0x00 &&
      message.opType == 0x01
    ) {
      this.sendFBlocks(message)
    }
    if (this.ready) {
      if (message.fBlockID == 0x06 && message.fktID == 0xd22) {
        this.sendD22(message)
      } else if (message.fktID == 0x01) {
        this.sendNotifs(message)
      } else if (message.fktID === 0x405 && message.opType === 0x0d) {
        console.log('complete 405')
        this.emit('complete405')
      } else if (message.fktID === 0x405 && message.opType !== 0x0d) {
        console.log('waiting 405')
      } else if (
        message.fktID === 0x101 &&
        message.sourceAddrLow === 0x61 &&
        message.fBlockID == 0x10
      ) {
        this.send101()
      } else if (message.fktID === 0x407 && message.opType === 0x0d) {
        console.log('complete 407')
        this.emit('complete407')
      } else if (message.fktID === 0x407 && message.opType === 0x0b) {
        console.log('waiting 407')
      } else if (message.fktID === 0x406 && message.opType === 0x0d) {
        console.log('complete 406')
        this.emit('complete406')
      } else if (message.fktID === 0x406 && message.opType === 0x0b) {
        console.log('waiting 406')
      } else if (message.fktID === 0x408 && message.opType === 0x0d) {
        console.log('complete 408')
        this.emit('complete408')
      } else if (message.fktID === 0x408 && message.opType === 0x0b) {
        console.log('waiting 408')
      } else if (message.fktID === 0xda1 && message.opType === 0x02) {
        this.sendDa1(message)
      } else if (message.fktID === 0xda0 && message.opType === 0x02) {
        this.sendDa1(message)
      } else if (message.fktID === 0xc80 && message.opType === 0x06) {
        this.sendC80(message)
      } else if (message.fktID === 0xe00 && message.opType === 0x00) {
        if (
          message.data.readUInt8(0) === 0x01 &&
          message.data.readUInt8(1) === 0x01
        ) {
          // this.emit('softStart')
          // this.switchSource()
        } else if (
          message.data.readUInt8(0) === 0x02 &&
          message.data.readUInt8(1) === 0x01
        ) {
          // this.emit('softShutdown')
          // this.disconnectSources()
        } else {
          console.log('unknown e00', message)
        }
      } else if (message.fktID === 0x101 && message.opType === 0x02) {
        console.log('ALLOC REQUEST YAY')
        this.allocRequest = message
        this.driver.allocate()
        this.driver.once(Os8104Events.AllocResult, (data: AllocResult) => {
          console.log('sending alloc result: ', data)
          const out: SocketMostSendMessage = {
            data: Buffer.from([
              this.allocRequest!.data.readUint8(0),
              this.position,
              data.loc1,
              data.loc2,
              data.loc3,
              data.loc4,
            ]),
            fBlockID: this.allocRequest!.fBlockID,
            fktID: this.allocRequest!.fktID,
            instanceID: this.allocRequest!.instanceID,
            opType: 0x0c,
            targetAddressHigh: this.allocRequest!.sourceAddrHigh,
            targetAddressLow: this.allocRequest!.sourceAddrLow,
          }
          console.log('sending 101 resp: ', out)
          this.driver.sendControlMessage(out)
        })
      } else if (message.fktID === 0x102 && message.opType === 0x02) {
        console.log('DEALLOC REQUEST YAY')
        this.deallocRequest = message
        this.driver.deallocate()
        this.driver.once(Os8104Events.DeallocResult, () => {
          const out: SocketMostSendMessage = {
            data: Buffer.from([this.deallocRequest!.data.readUint8(0)]),
            fBlockID: this.deallocRequest!.fBlockID,
            fktID: this.deallocRequest!.fktID,
            instanceID: this.deallocRequest!.instanceID,
            opType: 0x0c,
            targetAddressHigh: this.deallocRequest!.sourceAddrHigh,
            targetAddressLow: this.deallocRequest!.sourceAddrLow,
          }
          console.log('sending 102 resp: ', out)
          this.driver.sendControlMessage(out)
        })
      }
      switch (message.fktID) {
        case 0xc81:
          if (message.data[0] === 0x00 && message.data[1] == 0x01) {
            this.sendFkt0xC81(message)
          } else if (message.data[0] === 0x00) {
            this.sendFkt0xC81(message)
            if (message.fBlockID === 0x10) {
              this.subscribeToAll()
            }
            // if (this.currentSource) {
            //   if (
            //     message.fBlockID === this.currentSource?.fBlockID &&
            //     message.instanceID === this.currentSource.shadow
            //   ) {
            //     this.switchSource()
            //   }
            // } else {
            //   if (
            //     message.fBlockID === this.defaultSource?.fBlockID &&
            //     message.instanceID === this.defaultSource.shadow
            //   ) {
            //     this.switchSource()
            //   }
            // }
          } else if (message.data[0] === 0x02) {
            if (
              message.instanceID === this.currentSource?.shadow &&
              message.fBlockID === this.currentSource.fBlockID
            ) {
              console.log('switching off')
              this.stopSource()
              this.once('sourceStopped', () => {
                this.currentSource = null
              })
              setTimeout(() => {
                this.sendFkt0xC81(message)
              }, 50)
            } else {
              this.sendFkt0xC81(message)
            }
          }
          if (message.fBlockID === 0x10) {
            if (message.data[0] === 0x02) {
              this.emit('softShutdown')
            } else if (message.data[0] === 0x00) {
              this.emit('softStart')
              setTimeout(() => {
                if (this.currentSource) {
                  this.switchSource(this.currentSource)
                } else {
                  this.switchSource()
                }
              }, 2000)
            }
          }
          break
        case 0xca1:
          const out: SocketMostSendMessage = {
            data: Buffer.from([]),
            fBlockID: this.currentSource!.fBlockID,
            fktID: 0x00,
            instanceID: this.currentSource!.instanceID,
            opType: 0x00,
            targetAddressHigh: this.currentSource!.addressHigh,
            targetAddressLow: this.currentSource!.addressLow,
          }
          if (message.data[0] === 0x03 && message.data[1] == 0x01) {
            switch (this.currentSource?.name) {
              case 'amFmTuner':
                out.data = Buffer.from([0x11])
                out.fktID = 0xd03
                out.opType = 0x02
                this.driver.sendControlMessage(out)
                break
              case 'audioDiskPlayer':
                out.data = Buffer.from([0x1])
                out.fktID = 0x202
                out.opType = 0x03
                this.driver.sendControlMessage(out)
                break
              case 'usbAudio':
                this.emit('skipForward')
            }
          } else if (message.data[0] === 0x04 && message.data[2] == 0x01) {
            switch (this.currentSource?.name) {
              case 'amFmTuner':
                out.data = Buffer.from([0x31])
                out.fktID = 0xd03
                out.opType = 0x02
                this.driver.sendControlMessage(out)
                break
              case 'audioDiskPlayer':
                out.data = Buffer.from([0x1])
                out.fktID = 0x202
                out.opType = 0x04
                this.driver.sendControlMessage(out)
                break
              case 'usbAudio':
                this.emit('skipBackward')
            }
          }
      }
    }
  }

  sendFkt0xC81(message: MostRxMessage): void {
    const out: SocketMostSendMessage = {
      data: Buffer.from([]),
      fBlockID: message.fBlockID,
      fktID: message.fktID,
      instanceID: message.instanceID,
      opType: 0x0c,
      targetAddressHigh: message.sourceAddrHigh,
      targetAddressLow: message.sourceAddrLow,
    }
    console.log('SENDING C81: ')
    this.driver.sendControlMessage(out)
    // switch (message.fBlockID) {
    //   case 0x40:
    //     break
    //   case 0x24:
    //     break
    //   case 0x31:
    //     break
    //   case 0x10:
    //     break
    //   case 0x50:
    //     break
    //   case 0x43:
    //     break
    // }
  }

  sendD22(message: MostRxMessage): void {
    const out: SocketMostSendMessage = {
      data: Buffer.from([
        0xf1, 0x8c, 0x30, 0x38, 0x31, 0x37, 0x32, 0x30, 0x33, 0x32, 0x34, 0x30,
        0x30, 0x30, 0x00, 0x00, 0x00, 0x00,
      ]),
      fBlockID: message.fBlockID,
      fktID: message.fktID,
      instanceID: message.instanceID,
      opType: 0x0c,
      targetAddressHigh: message.sourceAddrHigh,
      targetAddressLow: message.sourceAddrLow,
    }
    //console.log('SENDING D22: ', out)
    this.driver.sendControlMessage(out)
  }

  // sendfBlock0x06(message: MostRxMessage): void {
  //   switch(message.fktID) {
  //     case 0x01:
  //       const outData = {...message}
  //       outData.data = Buffer.from([0x01,0x01,0x61,0x0e,0x10])
  //       outData.opType =
  //
  //   }
  // }

  sendFBlocks(message: MostRxMessage): void {
    console.log('SENDING FBLOCKS: ', this.firstFblocks, message.instanceID)
    console.log('sending full')
    const out: SocketMostSendMessage = {
      data: Buffer.from([
        0x10, 0xa3, 0x06, 0x6e, 0x40, 0xa1, 0x31, 0xa1, 0x52, 0xd1, 0x60, 0x01,
        0x50, 0xa1, 0x05, 0xd1, 0x24, 0xa1, 0x22, 0xd1, 0x11, 0xd1, 0x44, 0xa1,
        0x05, 0xd2, 0x42, 0xa1, 0x31, 0xa2, 0x43, 0xa1, 0x31, 0xa2, 0x31, 0x5,
      ]),
      fBlockID: message.fBlockID,
      fktID: message.fktID,
      instanceID: message.instanceID,
      opType: 0x0c,
      targetAddressHigh: message.sourceAddrHigh,
      targetAddressLow: message.sourceAddrLow,
    }

    this.blocksSent = true
    this.driver.sendControlMessage(out)
  }

  sendNotifs(message: MostRxMessage): void {
    const fkt = message.data.readUInt16BE(3)
    const out: SocketMostSendMessage = {
      fBlockID: message.fBlockID,
      fktID: fkt,
      instanceID: message.instanceID,
      opType: 0x0c,
      targetAddressHigh: message.sourceAddrHigh,
      targetAddressLow: message.sourceAddrLow,
      data: Buffer.from([]),
    }
    switch (message.fBlockID) {
      case 0x10:
        out.data = Buffer.from([0x00])
        setTimeout(() => {
          const out: SocketMostSendMessage = {
            fBlockID: 0x10,
            fktID: 0xc02,
            instanceID: 0x01,
            opType: 0x0c,
            targetAddressHigh: 0x01,
            targetAddressLow: 0x61,
            data: Buffer.from([1]),
          }
          this.driver.sendControlMessage(out)
        }, 700)
        break
      case 0x40:
        out.data = Buffer.from([0x00])
        break
      case 0x60:
        if (fkt === 0xdb0) {
          out.data = Buffer.from([0x00, 0x00, 0x00])
        } else if (fkt === 0xc00) {
          out.data = Buffer.from([0, 0, 0, 0, 0])
        } else if (fkt === 0xc03) {
          out.data = Buffer.from([0, 0, 0])
        }
        break
      case 0x50:
        out.data = Buffer.from([0x00, 0x00, 0x00])
        break
    }
    if (out.data.length > 0) {
      //console.log('SENDING NOTIF: ', out)
      this.driver.sendControlMessage(out)
    } else {
      //console.log('unknown NOTIF: ', out)
    }
  }

  send405(): void {
    console.log('sending 405')
    const out: SocketMostSendMessage = {
      fBlockID: 0xf0,
      fktID: 0x405,
      instanceID: 0x01,
      opType: 0x06,
      targetAddressHigh: 0x01,
      targetAddressLow: 0x61,
      data: Buffer.from([
        0x0,
        0x02,
        this.nextSource!.fBlockID,
        this.nextSource!.shadow,
        0x01,
        0x01,
        this.nextSource!.fBlockID,
        this.nextSource!.instanceID,
        0x01,
        0x11,
      ]),
    }
    this.driver.sendControlMessage(out)
  }

  send407(): void {
    console.log('sending 407')
    const out: SocketMostSendMessage = {
      fBlockID: 0xf0,
      fktID: 0x407,
      instanceID: 0x01,
      opType: 0x06,
      targetAddressHigh: 0x01,
      targetAddressLow: 0x61,
      data: Buffer.from([
        0x00,
        0x01,
        this.nextSource!.fBlockID,
        this.nextSource!.shadow,
        0x01,
        0x11,
      ]),
    }
    this.driver.sendControlMessage(out)
  }

  send408(): void {
    console.log('sending 408')
    const out: SocketMostSendMessage = {
      fBlockID: 0xf0,
      fktID: 0x408,
      instanceID: 0x01,
      opType: 0x06,
      targetAddressHigh: 0x01,
      targetAddressLow: 0x61,
      data: Buffer.from([
        0x00,
        0x02,
        this.currentSource!.fBlockID,
        this.currentSource!.shadow,
        0x01,
        0x11,
      ]),
    }
    // this.once('complete408', () => {
    //   setTimeout(() => {
    //     this.send405()
    //   }, 5)
    // })
    this.driver.sendControlMessage(out)
  }

  send406(): void {
    console.log('sending 406')
    const out: SocketMostSendMessage = {
      fBlockID: 0xf0,
      fktID: 0x406,
      instanceID: 0x01,
      opType: 0x06,
      targetAddressHigh: 0x01,
      targetAddressLow: 0x61,
      data: Buffer.from([
        0x00,
        0x03,
        this.currentSource!.fBlockID,
        this.currentSource!.shadow,
        0x01,
        0x01,
        this.currentSource!.fBlockID,
        this.currentSource!.instanceID,
        0x01,
        0x11,
      ]),
    }
    // this.once('complete406', () => {
    //   setTimeout(() => {
    //     this.send408()
    //   }, 5)
    // })
    this.driver.sendControlMessage(out)
  }

  send101(): void {
    //console.log('sending 101')
    const out: SocketMostSendMessage = {
      fBlockID: 0xf0,
      fktID: 0x101,
      instanceID: 0xa3,
      opType: 0x0c,
      targetAddressHigh: 0x01,
      targetAddressLow: 0x61,
      data: Buffer.from([0x01, 0x02, 0x20, 0x21]),
    }
    this.driver.sendControlMessage(out)
  }

  stopSource() {
    this.retryInterval ? clearInterval(this.retryInterval) : null
    if (this.currentSource) {
      this.removeAllListeners('complete408')
      this.send408()
      // this.retryInterval = setInterval(() => {
      //   this.send408()
      // }, 200)
      this.once('complete408', () => {
        clearInterval(this.retryInterval)
        this.removeAllListeners('complete406')
        this.send406()
        // this.retryInterval = setInterval(() => {
        //   this.send406()
        // }, 200)
        this.once('complete406', () => {
          clearInterval(this.retryInterval)
          this.stopCurrentSource()
        })
      })
    }
  }

  writeLastSource(data: SourceRecord) {
    fs.writeFile(
      this.configPath,
      JSON.stringify({ lastSource: data }),
      () => {},
    )
  }

  switchSource(data: SourceRecord | null = null): void {
    console.log('switch source request', data)
    this.retryInterval ? clearInterval(this.retryInterval) : null
    if (data) {
      this.writeLastSource(data)
    }

    this.nextSource = data
    if (this.nextSource === null) {
      this.nextSource = this.defaultSource
    }
    if (this.currentSource) {
      this.removeAllListeners('complete406')
      this.send406()
      // this.retryInterval = setInterval(() => {
      //   this.send406()
      // }, 200)
      this.once('complete406', () => {
        this.retryInterval ? clearInterval(this.retryInterval) : null
        this.removeAllListeners('complete408')
        this.send408()
        // this.retryInterval = setInterval(() => {
        //   this.send408()
        // }, 200)
        this.once('complete408', () => {
          this.retryInterval ? clearInterval(this.retryInterval) : null
          this.removeAllListeners('complete405')
          this.stopCurrentSource()
          setTimeout(() => {
            this.send405()
            // this.retryInterval = setInterval(() => {
            //   this.send405()
          }, 100)
          this.once('complete405', () => {
            this.retryInterval ? clearInterval(this.retryInterval) : null
            this.removeAllListeners('complete407')
            this.send407()
            // this.retryInterval = setInterval(() => {
            //   this.send407()
            // }, 200)
            this.once('complete407', () => {
              this.retryInterval ? clearInterval(this.retryInterval) : null
              this.currentSource = this.nextSource
              this.startSource()
            })
          })
          // }, 50)
        })
      })
    } else {
      this.nextSource = this.defaultSource
      this.removeAllListeners('complete405')
      this.send405()
      // this.retryInterval = setInterval(() => {
      //   this.send405()
      // }, 200)
      this.once('complete405', () => {
        this.retryInterval ? clearInterval(this.retryInterval) : null
        this.removeAllListeners('complete407')
        this.send407()
        // this.retryInterval = setInterval(() => {
        //   this.send407()
        // }, 200)
        this.once('complete407', () => {
          this.retryInterval ? clearInterval(this.retryInterval) : null
          this.currentSource = this.nextSource
          this.startSource()
        })
      })
    }
  }

  sendDa0(message: MostRxMessage): void {
    const out: SocketMostSendMessage = {
      data: Buffer.from([]),
      fBlockID: message.fBlockID,
      fktID: message.fktID,
      instanceID: message.instanceID,
      opType: 0x0c,
      targetAddressHigh: message.sourceAddrHigh,
      targetAddressLow: message.sourceAddrLow,
    }
    //console.log('SENDING Da1: ', out)
    this.driver.sendControlMessage(out)
  }

  sendDa1(message: MostRxMessage): void {
    const out: SocketMostSendMessage = {
      data: Buffer.from([]),
      fBlockID: message.fBlockID,
      fktID: message.fktID,
      instanceID: message.instanceID,
      opType: 0x0c,
      targetAddressHigh: message.sourceAddrHigh,
      targetAddressLow: message.sourceAddrLow,
    }
    //console.log('SENDING Da1: ', out)
    this.driver.sendControlMessage(out)
  }

  sendC80(message: MostRxMessage): void {
    const out: SocketMostSendMessage = {
      data: Buffer.from([0x00, 0x01]),
      fBlockID: message.fBlockID,
      fktID: message.fktID,
      instanceID: message.instanceID,
      opType: 0x0d,
      targetAddressHigh: message.sourceAddrHigh,
      targetAddressLow: message.sourceAddrLow,
    }
    //console.log('SENDING C80: ', out)
    this.driver.sendControlMessage(out)
  }

  sendHeartBeat(): void {
    this.lastHeartBeat = this.lastHeartBeat == 0x55 ? 0x54 : 0x55
    const out: SocketMostSendMessage = {
      data: [0x00, this.lastHeartBeat],
      fBlockID: 0x01,
      fktID: 0xc01,
      instanceID: this.position,
      opType: 0x0c,
      targetAddressHigh: 0x01,
      targetAddressLow: 0x61,
    }
    this.driver.sendControlMessage(out)
  }

  startSource(): void {
    //console.log('sending source start')
    let out: null | SocketMostSendMessage
    switch (this.currentSource!.fBlockID) {
      case 0x31:
        out = {
          fBlockID: this.currentSource!.fBlockID,
          fktID: 0x200,
          instanceID: this.currentSource!.instanceID,
          opType: 0x00,
          targetAddressHigh: this.currentSource!.addressHigh,
          targetAddressLow: this.currentSource!.addressLow,
          data: Buffer.from([0x00]),
        }
        this.driver.sendControlMessage(out)
        break
      case 0x40:
        out = {
          fBlockID: this.currentSource!.fBlockID,
          fktID: 0x103,
          instanceID: this.currentSource!.instanceID,
          opType: 0x02,
          targetAddressHigh: this.currentSource!.addressHigh,
          targetAddressLow: this.currentSource!.addressLow,
          data: Buffer.from([0x01, 0x02]),
        }
        this.driver.sendControlMessage(out)
    }
  }

  stopCurrentSource(): void {
    //console.log('sending source start')
    let out: null | SocketMostSendMessage
    switch (this.currentSource!.fBlockID) {
      case 0x31:
        if (this.currentSource!.shadow !== 0xa2) {
          out = {
            fBlockID: this.currentSource!.fBlockID,
            fktID: 0x200,
            instanceID: this.currentSource!.instanceID,
            opType: 0x00,
            targetAddressHigh: this.currentSource!.addressHigh,
            targetAddressLow: this.currentSource!.addressLow,
            data: Buffer.from([0x01]),
          }
          this.driver.sendControlMessage(out)
        }
        break
      case 0x40:
        out = {
          fBlockID: this.currentSource!.fBlockID,
          fktID: 0x103,
          instanceID: this.currentSource!.instanceID,
          opType: 0x02,
          targetAddressHigh: this.currentSource!.addressHigh,
          targetAddressLow: this.currentSource!.addressLow,
          data: Buffer.from([0x01, 0x00]),
        }
        this.driver.sendControlMessage(out)
    }
    this.emit('sourceStopped')
  }

  subscribe(module: ModuleSingle): void {
    const address = this.driver.getAddress()
    if (address.nodeAddressLow === null || address.nodeAddressHigh === null) {
      return
    }
    if (module.functions.length == 0) {
      console.log('subscribing to all: ' + module.fBlockId)
      const out: SocketMostSendMessage = {
        fBlockID: module.fBlockId,
        fktID: 0x01,
        instanceID: module.instanceId,
        opType: 0x00,
        targetAddressLow: module.addrLow,
        targetAddressHigh: module.addrHigh,
        data: Buffer.from([0x00, 0x01, 0x6e]),
      }
      console.log(out)
      this.driver.sendControlMessage(out)
    } else if (module.functions.length <= 4) {
      console.log('fkt list fits in one')
      const out: SocketMostSendMessage = {
        fBlockID: module.fBlockId,
        fktID: 0x01,
        instanceID: module.instanceId,
        opType: 0x00,
        targetAddressLow: module.addrLow,
        targetAddressHigh: module.addrHigh,
        data: Buffer.from([0x01, 0x01, 0x6e, ...module.functions]),
      }
      this.driver.sendControlMessage(out)
    } else {
      console.log('need for multiple sends')
    }
    this.subscriptions.push(module)
    this.driver.once(Os8104Events.MessageSent, () => {
      console.log('notification sent sending next')
      setTimeout(() => {
        this.subscribeNext()
      }, 300)
    })
  }

  subscribeNext() {
    if (this.toSubscribe.length > 0) {
      const nextSubscription = this.toSubscribe.shift()
      this.subscribe(nextSubscription!)
      // this.subscriptionTimeout = setTimeout(() => {
      //   this.subscribeNext()
      // }, 100)
    } else {
      const out: SocketMostSendMessage = {
        fBlockID: 0xf5,
        fktID: 0x01,
        instanceID: 0x01,
        opType: 0x01,
        targetAddressLow: 0x01,
        targetAddressHigh: 0x61,
        data: Buffer.from([0x03, 0x01, 0x6e, 0x0e, 0x19]),
      }
      console.log('unsubscribing pesky 0xe19')
      this.driver.sendControlMessage(out)
    }
  }

  subscribeToAll() {
    this.subscriptions = []
    this.toSubscribe = [...this.subscriptionList]
    const nextSubscription = this.toSubscribe.shift()
    // this.subscriptionList = modules
    this.subscribe(nextSubscription!)
    // this.subscriptionTimeout = setTimeout(() => {
    //   this.subscribeNext()
    // }, 100)
  }
}
