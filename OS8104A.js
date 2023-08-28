const spi = require('spi-device')
const Gpio = require('onoff').Gpio
const config = require('./config')
const TRANSFERSPEED = 180000
const registers = require('./registers')
const EventEmitter = require('events')
const {bXSR_SPDIF_LOCK_ACT, bXSR_TRANS_LOCK_ACT, REG_bXSR, REG_bNPR, REG_bMPR, REG_mXCMB, REG_bMSGC, bMSGC_START_TX,
    bXSR_ERR_ACT
} = require("./registers");
const reg = require("./registers");

class OS8104A extends EventEmitter {
    constructor(nodeAddress, groupAddress, freq) {
        super()
        this.spi = new spi.openSync(0, 0, {chipSelectHigh: false, bitsPerWord: 8, lsbFirst: false})
        this.interrupt = new Gpio(5, 'in', 'falling')
        this.fault = new Gpio(6, 'in', 'both', {debounceTimer: 50});
        this.status = new Gpio(16, 'in', 'both', {debounceTimer: 50 });
        this.mostStatus = new Gpio(26, 'in', 'both', {debounceTimer: 10})
        this.reset = new Gpio(17, 'out')
        this.freq = freq
        this.nodeAddressNumber = Buffer.alloc(2)
        this.nodeAddressNumber.writeUint16BE(nodeAddress)
        this.groupAddressNumber = Buffer.alloc(1)
        this.groupAddressNumber.writeUInt8(groupAddress)
        this.awaitAlloc = false
        this.allocResult = false
        this.awaitGetSource = false
        this.getSourceResult = false
        this.allocTimeout = null
        this.streamAllocTimeout = null
        this.allocCheck = null
        this.delayTimer = null
        this.startUp()
        this.transceiverLocked = true
        this.fault.watch((err, val) => {
            if(err) {
                throw err
            }
            console.log("fault", val)
        })

        this.status.watch((err, val) => {
            if(err) {
                throw err
            }
            console.log("status", val)
        })

        this.mostStatus.watch((err, val) => {
            if(val) {
                console.log("status lost")
                this.writeReg(registers.REG_bXCR, [this.readSingleReg(registers.REG_bXCR) & ~registers.bXCR_OUTPUT_ENABLE])
            } else {
                console.log("network status up")
                this.writeReg(registers.REG_bXCR, [this.readSingleReg(registers.REG_bXCR) | registers.bXCR_OUTPUT_ENABLE])
            }
        })

        this.lockInterval = null;
    }

    startUp() {
        console.log("resetting")
        this.interrupt.unwatchAll()
        this.reset.writeSync(0)
        this.wait(200).then(() => {
            this.reset.writeSync(1)
            this.interrupt.watch(() => {
                this.resetOs8104()
            })
        })
    }

    resetOs8104() {
        this.interrupt.unwatchAll()
        //this.getMode()
        this.runConfig()
    }


    runConfig() {
        console.log("running config")
        for(const entry of config.getConfig(this.freq, this.nodeAddressNumber[1], this.nodeAddressNumber[0], this.groupAddressNumber, 0)) {
            console.log("0", entry[0])
            console.log("1", entry[1])
            this.writeReg(entry[0], [entry[1]])
        }
        this.interrupt.watch(() => {
            this.interruptHandler()
        })

    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    writeReg(address, value=[]) {
        const message = [{
            byteLength: 2 + value.length,
            sendBuffer: Buffer.from([0x00, address, ...value]),
            receiveBuffer: Buffer.alloc(2 + value.length),
            speedHz: TRANSFERSPEED,
        }];

        this.spi.transferSync(message);
        // debugPrint(`Register write: 0x${addr.toString(16)} => 0x${value.toString(16)}`);
        return message[0].receiveBuffer[1];
    }

    readReg(address, bytes=1) {
        this.writeReg(address)
        const message = [
            {
                byteLength: 1,
                sendBuffer: Buffer.from([0x01]),
                speedHz: TRANSFERSPEED,
            },
            {
                byteLength: bytes,
                receiveBuffer: Buffer.alloc(bytes),
                speedHz: TRANSFERSPEED,
            }
        ];
        this.spi.transferSync(message)
        return message[1].receiveBuffer;
    }

    readSingleReg(address) {
        this.writeReg(address)
        const message = [
            {
                byteLength: 1,
                sendBuffer: Buffer.from([0x01]),
                speedHz: TRANSFERSPEED,
            },
            {
                byteLength: 1,
                receiveBuffer: Buffer.alloc(1),
                speedHz: TRANSFERSPEED,
            }
        ];
        this.spi.transferSync(message)
        return message[1].receiveBuffer[0];
    }

    interruptHandler() {
        //Read interrupts
        let interrupts = this.readSingleReg(registers.REG_bMSGS)
        if(interrupts & registers.bMSGS_MESS_RECEIVED) {
            this.emit("newMessage", this.readReg(0xA0, 20))
            this.writeReg(registers.REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) | registers.bMSGC_RESET_MESSAGE_RX_INT | registers.bMSGC_RECEIVE_BUFF_EN])
        } else if(interrupts & registers.bMSGS_ERR) {
            console.log("error active")
            if(this.transceiverLocked) {
                this.parseFault(this.readSingleReg(REG_bXSR))
            }
        } else if(interrupts & registers.bMSGS_MESS_TRANSMITTED) {
            this.emit('messageSent')
            this.writeReg(registers.REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) | registers.bMSGC_RESET_MESSAGE_TX_INT])
            if(this.awaitAlloc) {
                let res = this.readReg(REG_mXCMB, 20)
                this.allocResult = this.parseAllocateResponse(res)
                this.emit("allocResult", this.allocResult)
                this.writeReg(registers.REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) & ~registers.bMSGC_START_TX])
                this.awaitAlloc = false
                if(this.allocResult.answer1 === "ALLOC_GRANT") {

                }
                clearTimeout(this.allocTimeout)
            } else if(this.awaitGetSource) {
                let res = this.readReg(REG_mXCMB, 20)
                this.getSourceResult = this.parseRemoteGetSource(res)
                console.log("remote source result", this.getSourceResult, res)
                this.emit("getSourceResult", this.getSourceResult)
                this.writeReg(registers.REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) & ~registers.bMSGC_START_TX])
                this.awaitGetSource = false
                clearTimeout(this.getSourceTimeout)
            }
        } else if(interrupts & registers.bMSGS_NET_CHANGED) {
            console.log("net changed")
            this.writeReg(registers.REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) | registers.bMSGC_RESET_NET_CONF_CHANGE])
        } else {
            console.log("unknown")
        }
    }

    parseFault(data) {
        console.log("Error", this.fault.readSync(), data)
        let masks = this.readSingleReg(registers.REG_bXSR)
        if(data & bXSR_TRANS_LOCK_ACT) {
            if((!(masks & registers.bXSR_LOCK_ERR_MASK)) && this.transceiverLocked) {
                this.transceiverLocked = false;
                this.emit("unlocked")
                this.lockInterval = setInterval(() => {
                    this.checkForLock()
                }, 100)
            }
        } else {
            console.log("resetting in parse")
            this.writeReg(registers.REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) | registers.bMSGC_RESET_ERR_INT])
        }

    }


    sendControlMessage ({targetAddressHigh, targetAddressLow, fBlockID, instanceID, fktId, opType, data}) {
        console.log(targetAddressHigh, targetAddressLow, fBlockID, instanceID, fktId, opType, data)
        if(this.transceiverLocked) {
            let header = Buffer.alloc(9)
            header.writeUInt8(0x01, 0)
            header.writeUInt8(0x00, 1)
            header.writeUInt8(targetAddressHigh, 2)
            header.writeUInt8(targetAddressLow, 3)
            header.writeUInt8(fBlockID, 4)
            header.writeUInt8(instanceID, 5)
            header.writeUInt16BE((fktId << 4) | opType, 6)
            header.writeUInt8(0x00 | data.length, 8)
            let buf = Buffer.alloc(21)
            let tempData = Buffer.concat([header, Buffer.from(data)])
            tempData.copy(buf, 0, 0, tempData.length)
            console.log("sending", buf)
            this.writeReg(0xC0, [...buf])
            this.writeReg(REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) | bMSGC_START_TX] )
        } else {
            console.log("CAN'T SEND NO LOCK")
        }

    }

    getNodePosition() {
        return this.readSingleReg(registers.REG_bNPR)
    }

    getMaxPosition() {
        return this.readSingleReg(registers.REG_bMPR)
    }

    allocate() {
        let header = Buffer.alloc(7)
        header.writeUInt8(0x01, 0)
        header.writeUInt8(0x03, 1)
        header.writeUInt8(0x04, 2)
        header.writeUInt8(0x00, 3)
        header.writeUInt8(0x00, 4)
        header.writeUInt8(0x04, 5)
        header.writeUInt8(0x00, 6)
        this.writeReg(0xC0, [...header])
        this.writeReg(REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) | bMSGC_START_TX] )
        this.awaitAlloc = true
        this.allocTimeout = setTimeout(() => {
            this.awaitAlloc = false
            console.log("ALLOCATE TIMEOUT")
        }, 500)
    }

    getRemoteSource(connectionLabel) {
        let header = Buffer.alloc(7)
        header.writeUInt8(0x01, 0)
        header.writeUInt8(0x05, 1)
        header.writeUInt8(0x03, 2)
        header.writeUInt8(0xC8, 3)
        header.writeUInt8(0x00, 4)
        header.writeUInt8(connectionLabel, 5)
        header.writeUInt8(0x00, 6)
        this.writeReg(0xC0, [...header])
        this.writeReg(REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) | bMSGC_START_TX] )
        this.awaitGetSource = true
        this.getSourceTimeout = setTimeout(() => {
            this.awaitGetSource = false
            console.log("Remote TIMEOUT")
        }, 500)
    }

    checkForLock() {
        let lockStatus = this.readSingleReg(registers.REG_bCM2)
        let pllLocked = lockStatus & registers.bCM2_UNLOCKED
        let lockSource = this.readSingleReg(registers.REG_bXSR) & registers.bXSR_FREQ_REG_ACT
        if(!pllLocked && !lockSource) {
            this.emit("locked")
            console.log("resetting in check")
            this.writeReg(registers.REG_bMSGC, [this.readSingleReg(registers.REG_bMSGC) | registers.bMSGC_RESET_ERR_INT])
            this.transceiverLocked = true
            clearInterval(this.lockInterval)
        }
    }

    parseAllocateResponse(data) {
        let answer1 = data.readUint8(7)
        let answer2 = data.readUint8(8)
        let cl = data.readUint8(9)
        let loc1 = data.readUint8(9)
        let loc2 = data.readUint8(10)
        let loc3 = data.readUint8(11)
        let loc4 = data.readUint8(12)
        let result = {
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

        }
        return result
    }

    stream({sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr}) {
        this.allocResult = false
        this.allocate()
        this.waitForAlloc(sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr)
    }

    waitForAlloc(sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr) {
        this.allocCheck = setInterval(() => {
            if(this.allocResult) {
                console.log("alloc done, setting MRT")
                clearTimeout(this.streamAllocTimeout)
                clearInterval(this.allocCheck)
                this.setMrtSource1(sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr)
            }
        }, 20)
        this.streamAllocTimeout = setTimeout(() => {
            clearInterval(this.allocCheck)
            console.log("stream audio timed out on alloc check")
        }, 1000)
    }

    parseRemoteGetSource(data) {
        let nodePos = data.readUint8(10)
        let group = data.readUint8(12)
        let logicalHigh = data.readUint8(13)
        let logicalLow = data.readUint8(14)
        let result = {
            nodePos,
            group,
            logicalHigh,
            logicalLow,
        }
        return result
    }

    // Set the MOST routing table, alloc result has to be present, it will the write the source1 data to
    // that routing table, effectively streaming on the network
    setMrtSource1(targetAddressHigh, targetAddressLow, fBlockID, instanceID, sinkNr) {
        console.log("setting mrt")
        if(this.allocResult?.loc1) {
            console.log("mrt running", this.allocResult)
            this.writeReg(this.allocResult.loc1, [0x49])
            this.writeReg(this.allocResult.loc2, [0x59])
            this.writeReg(this.allocResult.loc3, [0x69])
            this.writeReg(this.allocResult.loc4, [0x79])
            this.sendControlMessage({targetAddressHigh, targetAddressLow, fBlockID, instanceID, fktId: 0x112, opType: 0x02, data: [sinkNr]})
            setTimeout(() => {
                console.log("connecting target to sink")
                this.connectSink(targetAddressHigh, targetAddressLow, fBlockID, instanceID, sinkNr)
                this.writeReg(registers.REG_bSDC3, [0x00])
                this.writeReg(registers.REG_bSDC1, [this.readSingleReg(registers.REG_bSDC1) | registers.bSDC1_UNMUTE_SOURCE])
                console.log(this.readSingleReg(registers.REG_bSDC1))
                console.log(this.readSingleReg(registers.REG_bSDC2))
                console.log(this.readSingleReg(registers.REG_bSDC3))
                // await this.sourceDataControl3.setMultiple({mute: false, sourceEnable: false})
                // await this.sourceDataControl1.setMultiple({mute: true})
            }, 100)
        }
    }

    connectSink(targetAddressHigh, targetAddressLow, fBlockID, instanceID, sinkNr) {
        // TODO make srcDelay dynamic, unsure of impact
        let data = [sinkNr, 3, this.allocResult.loc1, this.allocResult.loc2, this.allocResult.loc3, this.allocResult.loc4] // data format is [sinkNumber, srcDelay, channelList]

        this.sendControlMessage({targetAddressHigh, targetAddressLow, fBlockID, instanceID, fktId: 0x111, opType: 0x02, data})
    }

    getMode() {
        let mode = this.readSingleReg(registers.REG_bCM3) & registers.bCM3_ENH
        console.log('mode', mode)
    }
}

module.exports = OS8104A
