"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OS8104A = void 0;
const onoff_1 = require("onoff");
const spi_device_1 = __importDefault(require("spi-device"));
const events_1 = __importDefault(require("events"));
const RegisterConfig_1 = require("./RegisterConfig");
const Registers_js_1 = require("./Registers.js");
const Messages_1 = require("./Messages");
const TRANSFER_SPEED = 180000;
const options = {
    chipSelectHigh: false,
    bitsPerWord: 8,
    lsbFirst: false
};
class OS8104A extends events_1.default {
    freq;
    spi;
    interrupt;
    fault;
    status;
    getRegisterConfig;
    mostStatus;
    reset;
    nodeAddressBuf;
    groupAddressBuf;
    awaitAlloc;
    allocResult;
    awaitGetSource;
    getSourceResult;
    allocTimeout;
    streamAllocTimeout;
    delayTimer;
    getSourceTimeout;
    allocCheck;
    lockInterval;
    multiPartMessage;
    multiPartSequence;
    transceiverLocked;
    constructor(nodeAddress, groupAddress, freq) {
        super();
        this.spi = spi_device_1.default.openSync(0, 0, options);
        this.interrupt = new onoff_1.Gpio(5, "in", "falling");
        // TODO this had an unnoticed type error for debounce, now TS has saved the day, it may mess things up
        // now that it's actually working
        this.fault = new onoff_1.Gpio(6, "in", "both", { debounceTimeout: 50 });
        this.status = new onoff_1.Gpio(16, "in", "both", { debounceTimeout: 50 });
        this.mostStatus = new onoff_1.Gpio(26, "in", "both", { debounceTimeout: 10 });
        this.reset = new onoff_1.Gpio(17, "out");
        this.freq = freq;
        // TODO not sure why these were buffers, need to review
        this.nodeAddressBuf = Buffer.alloc(2);
        this.nodeAddressBuf.writeUint16BE(nodeAddress);
        this.groupAddressBuf = Buffer.alloc(1);
        this.groupAddressBuf.writeUInt8(groupAddress);
        this.awaitAlloc = false;
        this.awaitGetSource = false;
        this.getSourceResult = null;
        this.multiPartSequence = 0;
        this.transceiverLocked = true;
        this.startUp();
        this.getRegisterConfig = RegisterConfig_1.getRegisterConfig;
        this.fault.watch((err, val) => {
            if (err) {
                throw err;
            }
            console.log("fault", val);
        });
        this.status.watch((err, val) => {
            if (err) {
                throw err;
            }
            console.log("status", val);
        });
        this.mostStatus.watch((err, val) => {
            if (err) {
                throw err;
            }
            if (val === 1) {
                console.log("status lost");
                this.writeReg(Registers_js_1.Registers.REG_bXCR, [
                    this.readSingleReg(Registers_js_1.Registers.REG_bXCR) & ~Registers_js_1.Registers.bXCR_OUTPUT_ENABLE
                ]);
            }
            else {
                console.log("network status up");
                this.writeReg(Registers_js_1.Registers.REG_bXCR, [
                    this.readSingleReg(Registers_js_1.Registers.REG_bXCR) | Registers_js_1.Registers.bXCR_OUTPUT_ENABLE
                ]);
            }
        });
    }
    startUp() {
        console.log("resetting");
        this.interrupt.unwatchAll();
        this.reset.writeSync(0);
        this.wait(200)
            .then(() => {
            this.reset.writeSync(1);
            this.interrupt.watch(() => {
                this.resetOs8104();
            });
        })
            .catch((reason) => {
            throw reason;
        });
    }
    resetOs8104() {
        this.interrupt.unwatchAll();
        this.runConfig();
    }
    runConfig() {
        console.log("running config");
        for (const entry of this.getRegisterConfig({
            freq: this.freq,
            nodeAddressLow: this.nodeAddressBuf[1],
            nodeAddressHigh: this.nodeAddressBuf[0],
            groupAddress: this.groupAddressBuf[0]
        }, 0)) {
            console.log("0", entry[0]);
            console.log("1", entry[1]);
            this.writeReg(entry[0], [entry[1]]);
        }
        this.interrupt.watch(() => {
            this.interruptHandler();
        });
    }
    async wait(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
    writeReg(address, value = []) {
        const message = [
            {
                byteLength: 2 + value.length,
                sendBuffer: Buffer.from([0x00, address, ...value]),
                receiveBuffer: Buffer.alloc(2 + value.length),
                speedHz: TRANSFER_SPEED
            }
        ];
        this.spi.transferSync(message);
        // debugPrint(`Register write: 0x${addr.toString(16)} => 0x${value.toString(16)}`);
        return message[0].receiveBuffer[1];
    }
    readReg(address, bytes = 1) {
        this.writeReg(address);
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
        ];
        this.spi.transferSync(message);
        if (message[1].receiveBuffer !== undefined) {
            return message[1].receiveBuffer;
        }
        else {
            return Buffer.alloc(1);
        }
    }
    readSingleReg(address) {
        this.writeReg(address);
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
        ];
        this.spi.transferSync(message);
        if (message[1].receiveBuffer !== undefined) {
            return message[1].receiveBuffer[0];
        }
        else {
            return -1;
        }
    }
    interruptHandler() {
        // Read interrupts
        const interrupts = this.readSingleReg(Registers_js_1.Registers.REG_bMSGS);
        if ((interrupts & Registers_js_1.Registers.bMSGS_MESS_RECEIVED) > 0) {
            this.parseMostMessage(this.readReg(0xa0, 20));
            this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
                this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) |
                    Registers_js_1.Registers.bMSGC_RESET_MESSAGE_RX_INT |
                    Registers_js_1.Registers.bMSGC_RECEIVE_BUFF_EN
            ]);
        }
        else if ((interrupts & Registers_js_1.Registers.bMSGS_ERR) > 0) {
            console.log("error active");
            if (this.transceiverLocked) {
                this.parseFault(this.readSingleReg(Registers_js_1.Registers.REG_bXSR));
            }
        }
        else if ((interrupts & Registers_js_1.Registers.bMSGS_MESS_TRANSMITTED) > 0) {
            this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
                this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) | Registers_js_1.Registers.bMSGC_RESET_MESSAGE_TX_INT
            ]);
            if (this.awaitAlloc) {
                const res = this.readReg(Registers_js_1.Registers.REG_mXCMB, 20);
                this.allocResult = this.parseAllocateResponse(res);
                this.emit(Messages_1.Os8104Events.AllocResult, this.allocResult);
                this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
                    this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) & ~Registers_js_1.Registers.bMSGC_START_TX
                ]);
                this.awaitAlloc = false;
                clearTimeout(this.allocTimeout);
            }
            else if (this.awaitGetSource) {
                const res = this.readReg(Registers_js_1.Registers.REG_mXCMB, 20);
                this.getSourceResult = this.parseRemoteGetSource(res);
                console.log("remote source result", this.getSourceResult, res);
                this.emit(Messages_1.Os8104Events.GetSourceResult, this.getSourceResult);
                this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
                    this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) & ~Registers_js_1.Registers.bMSGC_START_TX
                ]);
                this.awaitGetSource = false;
                clearTimeout(this.getSourceTimeout);
            }
            this.emit(Messages_1.Os8104Events.MessageSent);
        }
        else if ((interrupts & Registers_js_1.Registers.bMSGS_NET_CHANGED) > 0) {
            console.log("net changed");
            this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
                this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) | Registers_js_1.Registers.bMSGC_RESET_NET_CONF_CHANGE
            ]);
        }
        else {
            console.log("unknown");
        }
    }
    parseMostMessage(message) {
        const data = {
            type: message.readUint8(0),
            sourceAddressHigh: message.readUint8(1),
            sourceAddressLow: message.readUint8(2),
            fBlockID: message.readUint8(3),
            instanceID: message.readUint8(4),
            fktID: (message.slice(5, 7).readUint16BE() >> 4),
            opType: ((message.readUint16BE(5) & 0xF)),
            telID: (message.readUint8(7) & 0xF0) >> 4,
            telLen: (message.readUint8(7) & 0xF),
            data: message.readUint8(0) > 0x01 ? message.slice(8, message.length - 1) : message.slice(8)
        };
        this.emit(Messages_1.Os8104Events.MostMessageRx, data);
    }
    parseFault(data) {
        console.log("Error", this.fault.readSync(), data);
        const masks = this.readSingleReg(Registers_js_1.Registers.REG_bXSR);
        if ((data & Registers_js_1.Registers.bXSR_TRANS_LOCK_ACT) > 0) {
            if ((masks & Registers_js_1.Registers.bXSR_LOCK_ERR_MASK) === 0 && this.transceiverLocked) {
                this.transceiverLocked = false;
                this.emit(Messages_1.Os8104Events.Unlocked);
                this.lockInterval = setInterval(() => {
                    this.checkForLock();
                }, 100);
            }
        }
        else {
            console.log("resetting in parse");
            this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
                this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) | Registers_js_1.Registers.bMSGC_RESET_ERR_INT
            ]);
        }
    }
    sendControlMessage({ targetAddressHigh, targetAddressLow, fBlockID, instanceID, fktId, opType, data }, telId = 0) {
        console.log(targetAddressHigh, targetAddressLow, fBlockID, instanceID, fktId, opType, data);
        if (data.length > 12) {
            this.multiPartMessage = {
                targetAddressHigh,
                targetAddressLow,
                fBlockID,
                instanceID,
                fktId,
                opType,
                data: [...data]
            };
            this.multiPartSequence = 0;
            this.sendMultiPartMessage();
        }
        else {
            if (this.transceiverLocked) {
                const header = Buffer.alloc(9);
                header.writeUInt8(0x01, 0);
                header.writeUInt8(0x00, 1);
                header.writeUInt8(targetAddressHigh, 2);
                header.writeUInt8(targetAddressLow, 3);
                header.writeUInt8(fBlockID, 4);
                header.writeUInt8(instanceID, 5);
                header.writeUInt16BE((fktId << 4) | opType, 6);
                header.writeUInt8(telId | data.length, 8);
                const buf = Buffer.alloc(21);
                const tempData = Buffer.concat([header, Buffer.from(data)]);
                tempData.copy(buf, 0, 0, tempData.length);
                console.log("sending", buf);
                this.writeReg(0xc0, [...buf]);
                this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
                    this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) | Registers_js_1.Registers.bMSGC_START_TX
                ]);
            }
            else {
                console.log("CAN'T SEND NO LOCK");
            }
        }
    }
    sendMultiPartMessage() {
        const tempMessage = { ...this.multiPartMessage };
        this.multiPartMessage.data.length > 11
            ? (tempMessage.data = this.multiPartMessage.data.splice(0, 11))
            : (tempMessage.data = this.multiPartMessage.data);
        tempMessage.data = [this.multiPartSequence, ...tempMessage.data];
        let telId;
        // In a multipart message telId represents the beginning, middle and end of the message, telId = 1 means first message, telId = 2 means message continuing
        // telId = 3 means final message
        if (this.multiPartSequence === 0) {
            telId = 1;
        }
        else if (this.multiPartMessage.data.length < 11) {
            telId = 3;
        }
        else {
            telId = 2;
        }
        console.log("tel id", telId);
        this.sendControlMessage(tempMessage, telId);
        if (telId !== 3) {
            this.once("messageSent", () => {
                this.multiPartSequence += 1;
                console.log("moving to next sequence", this.multiPartSequence);
                this.sendMultiPartMessage();
            });
        }
        else {
            console.log("Sequence finished");
        }
    }
    getNodePosition() {
        return this.readSingleReg(Registers_js_1.Registers.REG_bNPR);
    }
    getMaxPosition() {
        return this.readSingleReg(Registers_js_1.Registers.REG_bMPR);
    }
    allocate() {
        const header = Buffer.alloc(7);
        header.writeUInt8(0x01, 0);
        header.writeUInt8(0x03, 1);
        header.writeUInt8(0x04, 2);
        header.writeUInt8(0x00, 3);
        header.writeUInt8(0x00, 4);
        header.writeUInt8(0x04, 5);
        header.writeUInt8(0x00, 6);
        this.writeReg(0xc0, [...header]);
        this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
            this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) | Registers_js_1.Registers.bMSGC_START_TX
        ]);
        this.awaitAlloc = true;
        this.allocTimeout = setTimeout(() => {
            this.awaitAlloc = false;
            console.log("ALLOCATE TIMEOUT");
        }, 500);
    }
    getRemoteSource(connectionLabel) {
        const header = Buffer.alloc(7);
        header.writeUInt8(0x01, 0);
        header.writeUInt8(0x05, 1);
        header.writeUInt8(0x03, 2);
        header.writeUInt8(0xc8, 3);
        header.writeUInt8(0x00, 4);
        header.writeUInt8(connectionLabel, 5);
        header.writeUInt8(0x00, 6);
        this.writeReg(0xc0, [...header]);
        this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
            this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) | Registers_js_1.Registers.bMSGC_START_TX
        ]);
        this.awaitGetSource = true;
        this.getSourceTimeout = setTimeout(() => {
            this.awaitGetSource = false;
            console.log("Remote TIMEOUT");
        }, 500);
    }
    checkForLock() {
        const lockStatus = this.readSingleReg(Registers_js_1.Registers.REG_bCM2);
        const pllLocked = lockStatus & Registers_js_1.Registers.bCM2_UNLOCKED;
        const lockSource = this.readSingleReg(Registers_js_1.Registers.REG_bXSR) & Registers_js_1.Registers.bXSR_FREQ_REG_ACT;
        if (pllLocked === 0 && lockSource === 0) {
            this.emit(Messages_1.Os8104Events.Locked);
            console.log("resetting in check");
            this.writeReg(Registers_js_1.Registers.REG_bMSGC, [
                this.readSingleReg(Registers_js_1.Registers.REG_bMSGC) | Registers_js_1.Registers.bMSGC_RESET_ERR_INT
            ]);
            this.transceiverLocked = true;
            clearInterval(this.lockInterval);
        }
    }
    parseAllocateResponse(data) {
        const answer1 = data.readUint8(7);
        const answer2 = data.readUint8(8);
        const cl = data.readUint8(9);
        const loc1 = data.readUint8(9);
        const loc2 = data.readUint8(10);
        const loc3 = data.readUint8(11);
        const loc4 = data.readUint8(12);
        const result = {
            loc1,
            loc2,
            loc3,
            loc4,
            cl,
            answer1: "",
            freeChannels: 0
        };
        switch (answer1) {
            case 1:
                result.answer1 = "ALLOC_GRANT";
                result.freeChannels = answer2;
                break;
            case 2:
                result.answer1 = "ALLOC_BUSY";
                result.freeChannels = answer2;
                break;
            case 3:
                result.answer1 = "ALLOC_DENY";
                result.freeChannels = answer2;
                break;
            case 4:
                result.answer1 = "WRONG_TARGET";
                result.freeChannels = answer2;
                break;
            default:
                result.answer1 = "ERROR";
                result.freeChannels = 0;
        }
        return result;
    }
    stream({ sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr }) {
        this.allocResult = {
            loc1: -1,
            loc2: -1,
            loc3: -1,
            loc4: -1,
            cl: -1,
            answer1: "",
            freeChannels: -1
        };
        this.allocate();
        this.waitForAlloc(sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr);
    }
    retrieveAudio(bytes) {
        console.log("retrieve audio in os8104", bytes);
        const bytesT = [];
        bytesT.push(bytes["0"]);
        bytesT.push(bytes["1"]);
        if (bytes["2"] !== undefined) {
            bytesT.push(bytes["2"]);
        }
        if (bytes["3"] !== undefined) {
            bytesT.push(bytes["3"]);
        }
        this.setMrtSink1(bytesT);
    }
    waitForAlloc(sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr) {
        this.allocCheck = setInterval(() => {
            if (this.allocResult !== null) {
                console.log("alloc done, setting MRT");
                clearTimeout(this.streamAllocTimeout);
                clearInterval(this.allocCheck);
                this.setMrtSource1(sourceAddrHigh, sourceAddrLow, fBlockID, instanceID, sinkNr);
            }
        }, 20);
        this.streamAllocTimeout = setTimeout(() => {
            clearInterval(this.allocCheck);
            console.log("stream audio timed out on alloc check");
        }, 1000);
    }
    parseRemoteGetSource(data) {
        const nodePos = data.readUint8(10);
        const group = data.readUint8(12);
        const logicalHigh = data.readUint8(13);
        const logicalLow = data.readUint8(14);
        return {
            nodePos,
            group,
            logicalHigh,
            logicalLow
        };
    }
    // Set the MOST routing table, alloc result has to be present, it will the write the source1 data to
    // that routing table, effectively streaming on the network
    setMrtSource1(targetAddressHigh, targetAddressLow, fBlockID, instanceID, sinkNr) {
        console.log("setting mrt");
        if (this.allocResult.loc1 > -1) {
            console.log("mrt running", this.allocResult);
            this.writeReg(this.allocResult.loc1, [0x49]);
            this.writeReg(this.allocResult.loc2, [0x59]);
            this.writeReg(this.allocResult.loc3, [0x69]);
            this.writeReg(this.allocResult.loc4, [0x79]);
            this.sendControlMessage({
                targetAddressHigh,
                targetAddressLow,
                fBlockID,
                instanceID,
                fktId: 0x112,
                opType: 0x02,
                data: [sinkNr]
            });
            setTimeout(() => {
                console.log("connecting target to sink");
                this.connectSink(targetAddressHigh, targetAddressLow, fBlockID, instanceID, sinkNr);
                this.writeReg(Registers_js_1.Registers.REG_bSDC3, [0x00]);
                this.writeReg(Registers_js_1.Registers.REG_bSDC1, [
                    this.readSingleReg(Registers_js_1.Registers.REG_bSDC1) | Registers_js_1.Registers.bSDC1_UNMUTE_SOURCE
                ]);
                console.log(this.readSingleReg(Registers_js_1.Registers.REG_bSDC1));
                console.log(this.readSingleReg(Registers_js_1.Registers.REG_bSDC2));
                console.log(this.readSingleReg(Registers_js_1.Registers.REG_bSDC3));
                // await this.sourceDataControl3.setMultiple({mute: false, sourceEnable: false})
                // await this.sourceDataControl1.setMultiple({mute: true})
            }, 100);
        }
    }
    setMrtSink1(bytes) {
        console.log("setting mrt", bytes);
        if (bytes.length > 2) {
            this.writeReg(0x46, [bytes[0]]);
            this.writeReg(0x56, [bytes[1]]);
            this.writeReg(0x66, [bytes[2]]);
            this.writeReg(0x76, [bytes[3]]);
        }
        else {
            this.writeReg(0x46, [bytes[0]]);
            this.writeReg(0x56, [bytes[1]]);
            this.writeReg(0x66, [bytes[0]]);
            this.writeReg(0x76, [bytes[1]]);
        }
        // TODO duplicated from mrtSource, needs to move both to a separate function, not needed either if already un-muted
        setTimeout(() => {
            this.writeReg(Registers_js_1.Registers.REG_bSDC3, [0x00]);
            this.writeReg(Registers_js_1.Registers.REG_bSDC1, [
                this.readSingleReg(Registers_js_1.Registers.REG_bSDC1) | Registers_js_1.Registers.bSDC1_UNMUTE_SOURCE
            ]);
            console.log(this.readSingleReg(Registers_js_1.Registers.REG_bSDC1));
            console.log(this.readSingleReg(Registers_js_1.Registers.REG_bSDC2));
            console.log(this.readSingleReg(Registers_js_1.Registers.REG_bSDC3));
            // await this.sourceDataControl3.setMultiple({mute: false, sourceEnable: false})
            // await this.sourceDataControl1.setMultiple({mute: true})
        }, 100);
    }
    connectSink(targetAddressHigh, targetAddressLow, fBlockID, instanceID, sinkNr) {
        // TODO make srcDelay dynamic, unsure of impact
        const data = [
            sinkNr,
            3,
            this.allocResult.loc1,
            this.allocResult.loc2,
            this.allocResult.loc3,
            this.allocResult.loc4
        ]; // data format is [sinkNumber, srcDelay, channelList]
        this.sendControlMessage({
            targetAddressHigh,
            targetAddressLow,
            fBlockID,
            instanceID,
            fktId: 0x111,
            opType: 0x02,
            data
        });
    }
    getMode() {
        const mode = this.readSingleReg(Registers_js_1.Registers.REG_bCM3) & Registers_js_1.Registers.bCM3_ENH;
        console.log("mode", mode);
    }
}
exports.OS8104A = OS8104A;
