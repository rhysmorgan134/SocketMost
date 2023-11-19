import { SocketMostClient } from './client/SocketMost-Client'
import dgram from 'dgram'
import { Server } from 'socket.io'

const most = new SocketMostClient()
const socket = dgram.createSocket('udp4')
const io = new Server()

most.on('newMessage', data => {
  console.log('explorer', data)
  if (data.data?.type === 'Buffer') {
    data.data = Buffer.from(data.data)
  }
  io.emit('message', data)
})

most.on('allocResult', data => {
  console.log('alloc res', data)
  io.emit('allocResult', data)
})

socket.on('listening', function () {
  const address = socket.address()
  console.log('UDP socket listening on ' + address.address + ':' + address.port)
})

socket.on('message', function (message, remote) {
  console.log(
    'SERVER RECEIVED:',
    remote.address + ':' + remote.port + ' - ' + message,
  )
  const response = 'Hello there!'
  socket.send(response, 0, response.length, remote.port, remote.address)
})

socket.bind(5555)

io.on('connection', socket => {
  console.log('connection')
  socket.on('requestRegistry', () => {
    console.log('got registry request')
    most.sendAppMessage({
      eventType: 'sendControlMessage',
      targetAddressHigh: 0x04,
      targetAddressLow: 0x00,
      fBlockID: 0x02,
      instanceID: 0,
      fktID: 0xa01,
      opType: 0x01,
      data: [],
    })
  })
  socket.on('getSource', data => {
    console.log('got get source request')
    most.sendAppMessage({
      eventType: 'getSource',
      connectionLabel: data.connectionLabel,
    })
  })

  socket.on('sendControlMessage', (data, msg) => {
    console.log('send control message', data, msg)
    most.sendControlMessage(data)
  })

  socket.on('allocate', () => {
    most.allocate()
  })

  socket.on('stream', data => {
    console.log('stream request', data)
    most.stream(data)
  })

  socket.on('retrieveAudio', data => {
    console.log('explorer sent retrieve audio')
    most.retrieveAudio(data)
  })
})

io

io.listen(5556)
