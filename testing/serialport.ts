import { SerialPort } from 'serialport'

SerialPort.list().then(data => {
  console.log(data)
})
