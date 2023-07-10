const spi = require('spi-device')
const Gpio = require('onoff').Gpio
const config = require('./config')
const TRANSFERSPEED = 300000

class OS8104A {
    constructor(nodeAddress, groupAddress, freq) {
        this.spi = new spi.openSync(0, 0, {chipSelectHigh: false, bitsPerWord: 8, lsbFirst: false})
        this.interrupt = new Gpio(5, 'in', 'falling')
        this.fault = new Gpio(6, 'in', 'both');
        this.status = new Gpio(16, 'in', 'both', {debounceTimer: 50 });
        this.reset = new Gpio(17, 'out')
        this.nodeAddressNumber = Buffer.alloc(2)
        this.nodeAddressNumber.writeUint16BE(nodeAddress)
        this.groupAddressNumber = Buffer.alloc(1)
        this.groupAddressNumber.writeUInt8(groupAddress)
        this.config = config.getConfig(freq, this.nodeAddressNumber[0], this.nodeAddressNumber[1])


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
    }
}
