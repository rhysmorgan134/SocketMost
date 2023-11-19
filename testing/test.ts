import { DataGram } from './testclient'

const client = new DataGram(
  '/tmp/SocketMost-client.sock',
  '/tmp/SocketMost.sock',
)

client.on('connect', () => {
  console.log('connected')
})

client.on('data', data => {
  const message = JSON.parse(data.toString())
  console.log(message)
})
