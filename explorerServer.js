const Dgram = require('./testclient')
const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const io = require('socket.io')()

client = new Dgram("/tmp/SocketMost-client.sock", "/tmp/SocketMost.sock")

client.on("connect", () => {
    console.log("connected")

});

client.on("data", (data) => {
    let message = JSON.parse(data.toString())
    message.data = Buffer.from(message.data)
    let dataOut = {
        fBlockID: message.data.readUint8(0),
        instanceID: message.data.readUint8(1),
        fktID: (message.data.slice(2,4).readUint16BE() >> 4),
        opType: ((message.data.readUint16BE(2) & 0xF)),
        telId: (message.data.readUint8(4) & 0xF0) >>4,
        telLen: (message.data.readUint8(4) & 0xF),
        data: message.type > 0x01 ? message.data.slice(0, message.data.length - 1) : message.data,
        sourceAddrHigh: message.sourceAddrHigh,
        sourceAddrLow: message.sourceAddrLow
    }
    console.log(message)
    io.emit('message', dataOut)
})

socket.on('listening', function () {
    const address = socket.address();
    console.log('UDP socket listening on ' + address.address + ":" + address.port);
});

socket.on('message', function (message, remote) {
    console.log('SERVER RECEIVED:', remote.address + ':' + remote.port +' - ' + message);
    const response = "Hello there!";
    socket.send(response, 0, response.length, remote.port, remote.address);
});

socket.bind('5555');

io.on('connection', (socket) => {
    console.log("connection")
})

io.listen(5556);