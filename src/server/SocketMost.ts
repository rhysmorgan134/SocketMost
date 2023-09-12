import fs from 'fs'
import unix from 'unix-dgram'
import { OS8104A } from '../driver/OS8104A'
import {
    AllocResult,
    GetSource,
    MasterFoundEvent,
    MessageOnly,
    MostMessage,
    NodePosition,
    Os8104Events,
    RawMostRxMessage,
    RetrieveAudio,
    SocketMostMessageRx,
    SocketTypes,
    Stream
} from '../modules/Messages'

const configPath: string = './config.json'

type config = {
    version: string,
    nodeAddress: number,
    groupAddress: number,
    freq: number
}

const defaultConfig: config = {
    version: '1.0.0',
    nodeAddress: 272,
    groupAddress: 34,
    freq: 48
}


let connected: boolean = false
let connectInterval: NodeJS.Timer
let config: config = defaultConfig
let master: MasterFoundEvent

if (fs.existsSync(configPath)) {
    console.log('file exists')
    config = JSON.parse(fs.readFileSync(configPath).toString())
    console.log(config)
} else {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig))
}

const stream = new unix.createSocket('unix_dgram', () => {

})
stream.on('error', () => {
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

const os8104 = new OS8104A( config.nodeAddress, config.groupAddress, config.freq)

// Call on error
// stream.on('error', (error) => {
//     console.log(error);
// });


os8104.on(Os8104Events.MostMessageRx, (message: RawMostRxMessage) => {
    console.log('message', message)
    if(!master) {
        if(message.fBlockID === 2) {
            console.log("master found")
            master = {
                eventType: Os8104Events.MasterFoundEvent,
                instanceID: message.instanceID,
                sourceAddrHigh: message.sourceAddressHigh,
                sourceAddrLow: message.sourceAddressLow
            }
            streamSend(master)
        }
    }
    const newMessage: SocketMostMessageRx = {
        eventType: Os8104Events.SocketMostMessageRxEvent,
        ...message
    }
    streamSend(newMessage)
})

const streamSend = (data: MasterFoundEvent | SocketMostMessageRx | MessageOnly | AllocResult | NodePosition) => {
    stream.send(Buffer.from(JSON.stringify(data)))
}

// os8104.on('lockStatus', (data) => {
//     stream.send(Buffer.from(JSON.stringify({eventType: 'lockStatus', status: data})))
// })

os8104.on(Os8104Events.Shutdown, () => {
    streamSend({eventType: 'shutDown'})
})

os8104.on(Os8104Events.AllocResult, (data: AllocResult) => {
    streamSend({eventType: 'allocResult', ...data})
})

os8104.on(Os8104Events.MessageSent, () => {
    streamSend({eventType: 'messageSent'})
})

os8104.on(Os8104Events.Locked, () => {
    streamSend({eventType: 'locked'})
})

os8104.on(Os8104Events.Unlocked, () => {
    streamSend({eventType: 'unlocked'})
})

stream.on(SocketTypes.MessageReceived, async (data: Buffer) => {
    const event: SocketTypes = JSON.parse(data.toString()).eventType
    switch (event) {
        case SocketTypes.SendControlMessage: {
            //console.log("sending", message)
            const message: MostMessage = JSON.parse(data.toString());
            os8104.sendControlMessage(message)
            // TODO is this really needed? sendControlMessage doesn't return and is not async, so in what case is this
            //  actually required? No types set for now as suspect it needs to go
            stream.send(Buffer.from(JSON.stringify({eventType: 'messageSent'})))
            break
        }
        case SocketTypes.GetNodePosition:{
            const returnData: NodePosition = {
                nodePosition: os8104.getNodePosition(),
                maxPosition: os8104.getMaxPosition(),
                eventType: Os8104Events.PositionUpdate
            }
            // REVIEW This is strange, NodePosition is not stated as a type for streamSend so unsure why no error here
            //  my guess is that it unions the same MessageDefault as the other typed streamSends (MasterFoundEvent, newMessage)
            //  which then makes me think there's something grossly incorrect here, leaving for now for review purposes
            streamSend(returnData)
            break
        }
        case SocketTypes.GetMaster: {
            if(master) {
                streamSend(master)
            }
            break
        }
        case SocketTypes.Allocate:
            console.log("awaited", os8104.allocate())
            break
        case SocketTypes.GetSource: {
            const message: GetSource = JSON.parse(data.toString());
            // REVIEW don't particularly like this, had to add connection label as a chained property solely for this
            //  call, need to look into alternatives, it feels like using an outer type (MostMessage in this case)
            //  for a switch statement is not ideal
            os8104.getRemoteSource(message.connectionLabel!)
            break
        }
        case SocketTypes.Stream: {
            const message: Stream = JSON.parse(data.toString());
            os8104.stream(message)
            break
        }
        case SocketTypes.RetrieveAudio: {
            // TODO remove numbers from key in message
            const message: RetrieveAudio = JSON.parse(data.toString());
            os8104.retrieveAudio(message)
        }
    }
});





process.on('SIGINT', function() {
    console.log("Caught interrupt signal");
    stream.close()
    process.exit();
});