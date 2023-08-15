const fs = require('fs')
const net = require('net');
var unix = require('unix-dgram');
const configPath = './config.json'
const Os8104 = require('./OS8104A')

const defaultConfig = {
    version: '1.0.0',
    nodeAddress: 272,
    groupAddress: 34,
    freq: 48
}

let connected = false
let connectInterval = null

let config = defaultConfig
let master = null
let locked = false
if (fs.existsSync(configPath)) {
    console.log('file exists')
    config = JSON.parse(fs.readFileSync(configPath).toString())
    console.log(config)
} else {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig))
}

let stream = new unix.createSocket('unix_dgram', () => {

})
stream.on('error', (error) => {
    if(connected) {
        connected = false
        connectInterval = setInterval(() => {
            stream.connect('/tmp/SocketMost-client.sock')
        }, 100)
    }

})

stream.on('connect', () => {
    connected = true
    if(connectInterval) {
        clearInterval(connectInterval)
    }
})

try { fs.unlinkSync('/tmp/SocketMost.sock'); } catch (e) { /* swallow */ }

stream.bind('/tmp/SocketMost.sock');

connectInterval = setInterval(() => stream.connect('/tmp/SocketMost-client.sock'), 100)

const os8104 = new Os8104( config.nodeAddress, config.groupAddress, config.freq)

// Call on error
// stream.on('error', (error) => {
//     console.log(error);
// });


os8104.on('newMessage', (message) => {
    //console.log(message)
    let data = {}
    data.type = message.readUint8(0)
    data.sourceAddrHigh = message.readUint8(1)
    data.sourceAddrLow = message.readUint8(2)
    data.data = message.slice(3)
    //console.log(data)
    if(!master) {
        if(data.data.readUint8(0) === 2) {
            console.log("master found")
            master = {}
            master.instanceID = data.data.readUint8(1)
            master.sourceAddrHigh = data.sourceAddrHigh
            master.sourceAddrLow = data.sourceAddrLow
            stream.send(Buffer.from(JSON.stringify({eventType: 'masterFound', ...master})))
        }
    }
    stream.send(Buffer.from(JSON.stringify({eventType: 'newMessage', ...data})))
    //console.log("sent message", data)
})

os8104.on('netChanged', (data) => {
    stream.send(Buffer.from(JSON.stringify({eventType: 'netChanged', ...data})))
})

os8104.on('lockStatus', (data) => {
    stream.send(Buffer.from(JSON.stringify({eventType: 'lockStatus', status: data})))
})

os8104.on('shutdown', (data) => {
    stream.send(Buffer.from(JSON.stringify({eventType: 'shutDown'})))
})

os8104.on('allocResult', (data) => {
    stream.send(Buffer.from(JSON.stringify({eventType: 'allocResult', ...data})))
})

os8104.on('messageSent', (data) => {
    stream.send(Buffer.from(JSON.stringify({eventType: 'messageSent'})))
})

os8104.on('locked', () => {
    stream.send(Buffer.from(JSON.stringify({eventType: 'locked'})))
})

os8104.on('unlocked', () => {
    stream.send(Buffer.from(JSON.stringify({eventType: 'unlocked'})))
})

stream.on('message', async (data, info) => {
    let message = JSON.parse(data.toString())
    console.log('message received', message)
    switch (message.eventType) {
        case 'sendControlMessage':
            //console.log("sending", message)
            message.data = Buffer.from(message.data)
            os8104.sendControlMessage(message)
            stream.send(Buffer.from(JSON.stringify({eventType: 'messageSent'})))
            break
        case 'getNodePosition':
            let returnData = {}
            returnData.nodePosition = os8104.getNodePosition()
            returnData.maxPosition = os8104.getMaxPosition()
            stream.send(Buffer.from(JSON.stringify({eventType: 'positionUpdate', ...returnData})))
            break
        case 'getMaster':
            console.log("getting master", master)
            if(master) {
                stream.send(Buffer.from(JSON.stringify({eventType: 'masterFound', ...master})))
            }
            break
        case 'allocate':
            console.log("awaited", os8104.allocate())
            break
        case 'getSource':
            console.log("getting remote source", message)
            os8104.getRemoteSource(message.connectionLabel)
            break
    }
})





process.on('SIGINT', function() {
    console.log("Caught interrupt signal");
    stream.close()
    process.exit();
});