import {Gpio} from "onoff"
import spi, {type SpiDevice, type SpiOptions} from "spi-device"
import EventEmitter from "events"
import {getRegisterConfig} from "./RegisterConfig"
import {Registers} from "./Registers"
import {
    AllocResult,
    Mode,
    MostMessage,
    Os8104Events,
    RawMostRxMessage,
    SocketMostSendMessage,
    SourceResult,
    Stream
} from "../modules/Messages";

const TRANSFER_SPEED = 180000

const options: SpiOptions = {
    chipSelectHigh: false,
    bitsPerWord: 8,
    lsbFirst: false
}

export class OS8104A extends EventEmitter {
    readonly freq: number
    readonly spi: SpiDevice
    readonly interrupt: Gpio
    readonly fault: Gpio
    readonly status: Gpio
    getRegisterConfig: typeof getRegisterConfig
    mostStatus: Gpio
    reset: Gpio
    nodeAddressBuf: Buffer
    groupAddressBuf: Buffer
    awaitAlloc: boolean
    allocResult?: AllocResult
    awaitGetSource: boolean
    getSourceResult: SourceResult | null
    allocTimeout?: NodeJS.Timeout
    streamAllocTimeout?: NodeJS.Timeout
    delayTimer?: NodeJS.Timeout
    getSourceTimeout?: NodeJS.Timeout
    allocCheck?: NodeJS.Timer
    lockInterval?: NodeJS.Timer
    multiPartMessage?: MostMessage
    multiPartSequence: number
    transceiverLocked: boolean

    constructor(nodeAddress: number, groupAddress: number, freq: number) {
        super()
        this.spi = spi.openSync(0, 0, options)
        this.interrupt = new Gpio(5, "in", "falling")
        // TODO this had an unnoticed type error for debounce, now TS has saved the day, it may mess things up
        // now that it's actually working
        this.fault = new Gpio(6, "in", "both", { debounceTimeout: 50 })
        this.status = new Gpio(16, "in", "both", { debounceTimeout: 50 })
        this.mostStatus = new Gpio(26, "in", "both", { debounceTimeout: 10 })
        this.reset = new Gpio(17, "out")
        this.freq = freq
        // TODO not sure why these were buffers, need to review
        this.nodeAddressBuf = Buffer.alloc(2)
        this.nodeAddressBuf.writeUint16BE(nodeAddress)
        this.groupAddressBuf = Buffer.alloc(1)
        this.groupAddressBuf.writeUInt8(groupAddress)
        this.awaitAlloc = false
        this.awaitGetSource = false
        this.getSourceResult = null
        this.multiPartSequence = 0
        this.transceiverLocked = true
        this.startUp()
        this.getRegisterConfig = getRegisterConfig

        this.fault.watch((err, val) => {
            if (err) {
                throw err
            }
            console.log("fault", val)
        })

        this.status.watch((err, val) => {
            if (err) {
                throw err
            }
            console.log("status", val)
        })

        this.mostStatus.watch((err, val) => {
            if (err) {
                throw err
            }
            if (val === 1) {
                console.log("status lost")
                this.writeReg(Registers.REG_bXCR, [
                    this.readSingleReg(Registers.REG_bXCR) & ~Registers.bXCR_OUTPUT_ENABLE
                ])
                this.startUp()
            } else {
                console.log("network status up")
                this.writeReg(Registers.REG_bXCR, [
                    this.readSingleReg(Registers.REG_bXCR) | Registers.bXCR_OUTPUT_ENABLE
                ])
            }
        })
    }

    startUp(): void {
        console.log("resetting")
        this.interrupt.unwatchAll()
        this.reset.writeSync(0)
        this.wait(200)
            .then(() => {
                this.reset.writeSync(1)
                this.interrupt.watch(() => {
                    this.resetOs8104()
                })
            })
            .catch((reason) => {
                throw reason
            })
    }

    resetOs8104(): void {
        this.interrupt.unwatchAll()
        this.runConfig()
    }

    runConfig(): void {
        console.log("running config")
        for (const entry of this.getRegisterConfig(
            {
                nodeAddressLow: this.nodeAddressBuf[1],
                nodeAddressHigh: this.nodeAddressBuf[0],
                groupAddress: this.groupAddressBuf[0]
            },
            Mode.leg
        )) {
            console.log("0", entry[0])
            console.log("1", entry[1])
            this.writeReg(entry[0], [entry[1]])
        }
        this.interrupt.watch(() => {
            this.interruptHandler()
        })
    }

    async wait(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    writeReg(address: number, value: number[] = []): number | null {
        const message = [
            {
                byteLength: 2 + value.length,
                sendBuffer: Buffer.from([0x00, address, ...value]),
                receiveBuffer: Buffer.alloc(2 + value.length),
                speedHz: TRANSFER_SPEED
            }
        ]

        this.spi.transferSync(message)
        // debugPrint(`Register write: 0x${addr.toString(16)} => 0x${value.toString(16)}`);
        return message[0].receiveBuffer[1]
    }

    readReg(address: number, bytes = 1): Buffer {
        this.writeReg(address)
        const message = [
            {
                byteLength: 1,
                sendBuffer: Buffer.from([0x01]),
                speedHz: TRANSFER_SPEED
            },
            {
                byteLength: bytes,
                receiveBuffer: Buffer.alloc(bytes),
                speedHz: TRANSFER_SPEED
            }
        ]
        this.spi.transferSync(message)
        if (message[1].receiveBuffer !== undefined) {
            return message[1].receiveBuffer
        } else {
            return Buffer.alloc(1)
        }
    }

    readSingleReg(address: number): number {
        this.writeReg(address)
        const message = [
            {
                byteLength: 1,
                sendBuffer: Buffer.from([0x01]),
                speedHz: TRANSFER_SPEED
            },
            {
                byteLength: 1,
                receiveBuffer: Buffer.alloc(1),
                speedHz: TRANSFER_SPEED
            }
        ]
        this.spi.transferSync(message)
        if (message[1].receiveBuffer !== undefined) {
            return message[1].receiveBuffer[0]
        } else {
            return -1
        }
    }

    interruptHandler(): void {
        // Read interrupts
        const interrupts = this.readSingleReg(Registers.REG_bMSGS)
        if ((interrupts & Registers.bMSGS_MESS_RECEIVED) > 0) {
            this.parseMostMessage(this.readReg(0xa0, 20))
            this.writeReg(Registers.REG_bMSGC, [
                this.readSingleReg(Registers.REG_bMSGC) |
                    Registers.bMSGC_RESET_MESSAGE_RX_INT |
                    Registers.bMSGC_RECEIVE_BUFF_EN
            ])
        } else if ((interrupts & Registers.bMSGS_ERR) > 0) {
            console.log("error active")
            if (this.transceiverLocked) {
                this.parseFault(this.readSingleReg(Registers.REG_bXSR))
            }
        } else if ((interrupts & Registers.bMSGS_MESS_TRANSMITTED) > 0) {
            this.writeReg(Registers.REG_bMSGC, [
                this.readSingleReg(Registers.REG_bMSGC) | Registers.bMSGC_RESET_MESSAGE_TX_INT
            ])
            if (this.awaitAlloc) {
                const res = this.readReg(Registers.REG_mXCMB, 20)
                this.allocResult = this.parseAllocateResponse(res)
                this.emit(Os8104Events.AllocResult, this.allocResult)
                this.writeReg(Registers.REG_bMSGC, [
                    this.readSingleReg(Registers.REG_bMSGC) & ~Registers.bMSGC_START_TX
                ])
                this.awaitAlloc = false
                clearTimeout(this.allocTimeout)
            } else if (this.awaitGetSource) {
                const res = this.readReg(Registers.REG_mXCMB, 20)
                this.getSourceResult = this.parseRemoteGetSource(res)
                console.log("remote source result", this.getSourceResult, res)
                this.emit(Os8104Events.GetSourceResult, this.getSourceResult)
                this.writeReg(Registers.REG_bMSGC, [
                    this.readSingleReg(Registers.REG_bMSGC) & ~Registers.bMSGC_START_TX
                ])
                this.awaitGetSource = false
                clearTimeout(this.getSourceTimeout)

            }
            this.emit(Os8104Events.MessageSent)
        } else if ((interrupts & Registers.bMSGS_NET_CHANGED) > 0) {
            console.log("net changed")
            this.writeReg(Registers.REG_bMSGC, [
                this.readSingleReg(Registers.REG_bMSGC) | Registers.bMSGC_RESET_NET_CONF_CHANGE
            ])
        } else {
            console.log("unknown")
        }
    }

    parseMostMessage(message: Buffer) {
        const data: RawMostRxMessage = {
            type: message.readUint8(0),
            sourceAddrHigh: message.readUint8(1),
            sourceAddrLow: message.readUint8(2),
            fBlockID: message.readUint8(3),
            instanceID: message.readUint8(4),
            fktID: (message.slice(5,7).readUint16BE() >> 4),
            opType: ((message.readUint16BE(5) & 0xF)),
            telID: (message.readUint8(7) & 0xF0) >>4,
            telLen: (message.readUint8(7) & 0xF),
            data: message.readUint8(0) > 0x01 ? message.slice(8, message.length - 1) : message.slice(8)
            }
        this.emit(Os8104Events.MostMessageRx, data)
    }

    parseFault(data: number): void {
        console.log("Error", this.fault.readSync(), data)
        const masks = this.readSingleReg(Registers.REG_bXSR)
        if ((data & Registers.bXSR_TRANS_LOCK_ACT) > 0) {
            if ((masks & Registers.bXSR_LOCK_ERR_MASK) === 0 && this.transceiverLocked) {
                this.transceiverLocked = false
                this.emit(Os8104Events.Unlocked)
                this.lockInterval = setInterval(() => {
                    this.checkForLock()
                }, 100)
            }
        } else {
            console.log("resetting in parse")
            this.writeReg(Registers.REG_bMSGC, [
                this.readSingleReg(Registers.REG_bMSGC) | Registers.bMSGC_RESET_ERR_INT
            ])
        }
    }

    sendControlMessage(
        {
            targetAddressHigh,
            targetAddressLow,
            fBlockID,
            instanceID,
            fktId,
            opType,
            data
        }: SocketMostSendMessage,
        telId = 0
    ): void {
        if (data.length > 12) {
            this.multiPartMessage = {
                targetAddressHigh,
                targetAddressLow,
                fBlockID,
                instanceID,
                fktId,
                opType,
                data: [...data]
            }
            this.multiPartSequence = 0
            this.sendMultiPartMessage()
        } else {
            if (this.transceiverLocked) {
                const header = Buffer.alloc(9)
                header.writeUInt8(0x01, 0)
                header.writeUInt8(0x00, 1)
                header.writeUInt8(targetAddressHigh, 2)
                header.writeUInt8(targetAddressLow, 3)
                header.writeUInt8(fBlockID, 4)
                header.writeUInt8(instanceID, 5)
                header.writeUInt16BE((fktId << 4) | opType, 6)
                header.writeUInt8(telId | data.length, 8)
                const buf = Buffer.alloc(21)
                const tempData = Buffer.concat([header, Buffer.from(data)])
                tempData.copy(buf, 0, 0, tempData.length)
                this.writeReg(0xc0, [...buf])
                this.writeReg(Registers.REG_bMSGC, [
                    this.readSingleReg(Registers.REG_bMSGC) | Registers.bMSGC_START_TX
                ])
            } else {
                console.log("CAN'T SEND NO LOCK")
            }
        }
    }

    sendMultiPartMessage(): void {
        const tempMessage = { ...this.multiPartMessage! }
        this.multiPartMessage!.data.length > 11
            ? (tempMessage.data = this.multiPartMessage!.data.splice(0, 11))
            : (tempMessage.data = this.multiPartMessage!.data)
        tempMessage.data = [this.multiPartSequence, ...tempMessage.data]
        let telId
        // In a multipart message telId represents the beginning, middle and end of the message, telId = 1 means first message, telId = 2 means message continuing
        // telId = 3 means final message
        if (this.multiPartSequence === 0) {
            telId = 1
        } else if (this.multiPartMessage!.data.length < 11) {
            telId = 3
        } else {
            telId = 2
        }
        this.sendControlMessage(tempMessage, telId)
        if (telId !== 3) {
            this.once("messageSent", () => {
                this.multiPartSequence += 1
                this.sendMultiPartMessage()
            })
        }
    }

    getNodePosition(): number {
        return this.readSingleReg(Registers.REG_bNPR)
    }

    getMaxPosition(): number {
        return this.readSingleReg(Registers.REG_bMPR)
    }

    allocate(): void {
        const header = Buffer.alloc(7)
        header.writeUInt8(0x01, 0)
        header.writeUInt8(0x03, 1)
        header.writeUInt8(0x04, 2)
        header.writeUInt8(0x00, 3)
        header.writeUInt8(0x00, 4)
        header.writeUInt8(0x04, 5)
        header.writeUInt8(0x00, 6)
        this.writeReg(0xc0, [...header])
        this.writeReg(Registers.REG_bMSGC, [
            this.readSingleReg(Registers.REG_bMSGC) | Registers.bMSGC_START_TX
        ])
        this.awaitAlloc = true
        this.allocTimeout = setTimeout(() => {
            this.awaitAlloc = false
            console.log("ALLOCATE TIMEOUT")
        }, 500)
    }

    getRemoteSource(connectionLabel: number): void {
        const header = Buffer.alloc(7)
        header.writeUInt8(0x01, 0)
        header.writeUInt8(0x05, 1)
        header.writeUInt8(0x03, 2)
        header.writeUInt8(0xc8, 3)
        header.writeUInt8(0x00, 4)
        header.writeUInt8(connectionLabel, 5)
        header.writeUInt8(0x00, 6)
        this.writeReg(0xc0, [...header])
        this.writeReg(Registers.REG_bMSGC, [
            this.readSingleReg(Registers.REG_bMSGC) | Registers.bMSGC_START_TX
        ])
        this.awaitGetSource = true
        this.getSourceTimeout = setTimeout(() => {
            this.awaitGetSource = false
            console.log("Remote TIMEOUT")
        }, 500)
    }

    checkForLock(): void {
        const lockStatus = this.readSingleReg(Registers.REG_bCM2)
        const pllLocked = lockStatus & Registers.bCM2_UNLOCKED
        const lockSource = this.readSingleReg(Registers.REG_bXSR) & Registers.bXSR_FREQ_REG_ACT
        if (pllLocked === 0 && lockSource === 0) {
            this.emit(Os8104Events.Locked)
            this.writeReg(Registers.REG_bMSGC, [
                this.readSingleReg(Registers.REG_bMSGC) | Registers.bMSGC_RESET_ERR_INT
            ])
            this.transceiverLocked = true
            clearInterval(this.lockInterval)
        }
    }

    parseAllocateResponse(data: Buffer): AllocResult {
        const answer1 = data.readUint8(7)
        const answer2 = data.readUint8(8)
        const cl = data.readUint8(9)
        const loc1 = data.readUint8(9)
        const loc2 = data.readUint8(10)
        const loc3 = data.readUint8(11)
        const loc4 = data.readUint8(12)
        const result: AllocResult = {
            loc1,
            loc2,
            loc3,
            loc4,
            cl
        }
        switch (answer1) {
            case 1:
                result.answer1 = "ALLOC_GRANT"
                result.freeChannels = answer2
                break
            case 2:
                result.answer1 = "ALLOC_BUSY"
                result.freeChannels = answer2
                break
            case 3:
                result.answer1 = "ALLOC_DENY"
                result.freeChannels = answer2
                break
            case 4:
                result.answer1 = "WRONG_TARGET"
                result.freeChannels = answer2
                break
            default:
                result.answer1 = "ERROR"
                result.freeChannels = 0
        }
        return result
    }

    stream({ sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr }: Stream): void {
        this.allocResult = {
            loc1: -1,
            loc2: -1,
            loc3: -1,
            loc4: -1,
            cl: -1
        }
        this.allocate()
        this.waitForAlloc(sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr)
    }

    retrieveAudio(bytes: { "0": number; "1": number; "2"?: number; "3"?: number }): void {
        console.log("retrieve audio in os8104", bytes)
        const bytesT: number[] = []
        bytesT.push(bytes["0"])
        bytesT.push(bytes["1"])
        if (bytes["2"] !== undefined) {
            bytesT.push(bytes["2"])
        }
        if (bytes["3"] !== undefined) {
            bytesT.push(bytes["3"])
        }
        this.setMrtSink1(bytesT)
    }

    waitForAlloc(
        sourceAddrHigh: number,
        sourceAddrLow: number,
        fBlockID: number,
        instanceID: number,
        sinkNr: number
    ): void {
        this.allocCheck = setInterval(() => {
            if (this.allocResult !== null) {
                console.log("alloc done, setting MRT")
                clearTimeout(this.streamAllocTimeout)
                clearInterval(this.allocCheck)
                this.setMrtSource1({sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr})
            }
        }, 20)
        this.streamAllocTimeout = setTimeout(() => {
            clearInterval(this.allocCheck)
            console.log("stream audio timed out on alloc check")
        }, 1000)
    }

    parseRemoteGetSource(data: Buffer): SourceResult {
        const nodePos = data.readUint8(10)
        const group = data.readUint8(12)
        const logicalHigh = data.readUint8(13)
        const logicalLow = data.readUint8(14)
        return {
            nodePos,
            group,
            logicalHigh,
            logicalLow
        }
    }

    // Set the MOST routing table, alloc result has to be present, it will the write the source1 data to
    // that routing table, effectively streaming on the network
    setMrtSource1(
        {sourceAddrHigh,
        sourceAddrLow,
        fBlockID,
        instanceID,
        sinkNr}: Stream
    ): void {
        console.log("setting mrt")
        if (this.allocResult!.loc1 > -1) {
            console.log("mrt running", this.allocResult)
            this.writeReg(this.allocResult!.loc1, [0x49])
            this.writeReg(this.allocResult!.loc2, [0x59])
            this.writeReg(this.allocResult!.loc3, [0x69])
            this.writeReg(this.allocResult!.loc4, [0x79])
            this.sendControlMessage({
                //TODO need to align these types
                targetAddressHigh: sourceAddrHigh,
                targetAddressLow: sourceAddrLow,
                fBlockID,
                instanceID,
                fktId: 0x112,
                opType: 0x02,
                data: [sinkNr]
            })
            setTimeout(() => {
                console.log("connecting target to sink")
                this.connectSink({sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr})
                this.writeReg(Registers.REG_bSDC3, [0x00])
                this.writeReg(Registers.REG_bSDC1, [
                    this.readSingleReg(Registers.REG_bSDC1) | Registers.bSDC1_UNMUTE_SOURCE
                ])
                console.log(this.readSingleReg(Registers.REG_bSDC1))
                console.log(this.readSingleReg(Registers.REG_bSDC2))
                console.log(this.readSingleReg(Registers.REG_bSDC3))
                // await this.sourceDataControl3.setMultiple({mute: false, sourceEnable: false})
                // await this.sourceDataControl1.setMultiple({mute: true})
            }, 100)
        }
    }

    setMrtSink1(bytes: number[]): void {
        console.log("setting mrt", bytes)
        if (bytes.length > 2) {
            this.writeReg(0x46, [bytes[0]])
            this.writeReg(0x56, [bytes[1]])
            this.writeReg(0x66, [bytes[2]])
            this.writeReg(0x76, [bytes[3]])
        } else {
            this.writeReg(0x46, [bytes[0]])
            this.writeReg(0x56, [bytes[1]])
            this.writeReg(0x66, [bytes[0]])
            this.writeReg(0x76, [bytes[1]])
        }
        // TODO duplicated from mrtSource, needs to move both to a separate function, not needed either if already un-muted
        setTimeout(() => {
            this.writeReg(Registers.REG_bSDC3, [0x00])
            this.writeReg(Registers.REG_bSDC1, [
                this.readSingleReg(Registers.REG_bSDC1) | Registers.bSDC1_UNMUTE_SOURCE
            ])
            console.log(this.readSingleReg(Registers.REG_bSDC1))
            console.log(this.readSingleReg(Registers.REG_bSDC2))
            console.log(this.readSingleReg(Registers.REG_bSDC3))
            // await this.sourceDataControl3.setMultiple({mute: false, sourceEnable: false})
            // await this.sourceDataControl1.setMultiple({mute: true})
        }, 100)
    }

    connectSink(
        {
            sourceAddrHigh,
            sourceAddrLow,
            fBlockID,
            instanceID,
            sinkNr
    }: Stream
    ): void {
        // TODO make srcDelay dynamic, unsure of impact
        const data = [
            sinkNr,
            3,
            this.allocResult!.loc1,
            this.allocResult!.loc2,
            this.allocResult!.loc3,
            this.allocResult!.loc4
        ] // data format is [sinkNumber, srcDelay, channelList]

        this.sendControlMessage({
            targetAddressHigh: sourceAddrHigh,
            targetAddressLow: sourceAddrLow,
            fBlockID,
            instanceID,
            fktId: 0x111,
            opType: 0x02,
            data
        })
    }

    getMode(): void {
        const mode = this.readSingleReg(Registers.REG_bCM3) & Registers.bCM3_ENH
        console.log("mode", mode)
    }
}
