import winston from 'winston'

winston.addColors({
  driver: 'bold cyan',
  socket: 'bold magenta',
  app: 'bold spring green',
  usb: 'bold yellow',
})
const colorizer = winston.format.colorize()

winston.loggers.add('driverLogger', {
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.cli(),
    winston.format.metadata(),
    winston.format.errors({ stack: true }),
    winston.format.timestamp({ format: 'hh:mm:ss.SSS' }),
    winston.format.printf(info => {
      const out = `${info.timestamp} - ${colorizer.colorize(
        'driver',
        info.metadata.service,
      )}-${info.level}:${info.message} `
      return out
    }),
  ),
  defaultMeta: {
    service: 'OS8104 Driver',
  },
  transports: [new winston.transports.Console()],
  exitOnError: false,
})

winston.loggers.add('usbDebugger', {
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.cli(),
    winston.format.metadata(),
    winston.format.errors({ stack: true }),
    winston.format.timestamp({ format: 'hh:mm:ss.SSS' }),
    winston.format.printf(info => {
      const out = `${info.timestamp} - ${colorizer.colorize(
        'usb',
        info.metadata.service,
      )}-${info.level}:${info.message} `
      return out
    }),
  ),
  defaultMeta: {
    service: 'USB Debugger',
  },
  transports: [new winston.transports.Console()],
  exitOnError: false,
})

winston.loggers.add('socketMostLogger', {
  level: process.env.SOCKETMOST_LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.cli(),
    winston.format.metadata(),
    winston.format.errors({ stack: true }),
    winston.format.timestamp({ format: 'hh:mm:ss.SSS' }),
    winston.format.printf(info => {
      const out = `${info.timestamp} - ${colorizer.colorize(
        'socket',
        info.metadata.service,
      )}-${info.level}:${info.message} `
      return out
    }),
  ),
  defaultMeta: {
    service: 'SocketMost',
  },
  transports: [new winston.transports.Console()],
})
