const {SocketMostClient} = require("socketmost-client");
const most = new SocketMostClient()
const dgram = require('dgram')
const socket = dgram.createSocket('udp4');
const io = require('socket.io')()

most.on("newMessage", (data) => {
    io.emit('message', data)
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
    socket.on('requestRegistry', () => {
        console.log("got registry request")
        most.sendAppMessage({
            eventType: "sendControlMessage",
            targetAddressHigh: 0x04,
            targetAddressLow: 0x00,
            fBlockID: 0x02,
            instanceID: 0,
            fktId: 0xA01,
            opType: 0x01,
            data: []
        })
    })
    socket.on('getSource', (data) => {
        console.log("got get source request")
        most.sendAppMessage({
            eventType: "getSource",
            connectionLabel: data.connectionLabel
        })
    })

    socket.on('sendControlMessage', (data, msg) => {
        console.log("send control message", data, msg)
        most.sendControlMessage(data)
    })
})

io

io.listen(5556);