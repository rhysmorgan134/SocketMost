const Dgram = require('./testclient')

client = new Dgram("/tmp/SocketMost-client.sock", "/tmp/SocketMost.sock")

client.on("connect", () => {
    console.log("connected")
});

client.on("data", (data) => {
    let message = JSON.parse(data.toString())
    console.log(message)
})