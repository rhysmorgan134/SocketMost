"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const unix_dgram_1 = __importDefault(require("unix-dgram"));
const OS8104A_1 = require("./OS8104A");
const Messages_js_1 = require("./Messages.js");
const configPath = './config.json';
const defaultConfig = {
    version: '1.0.0',
    nodeAddress: 272,
    groupAddress: 34,
    freq: 48
};
let connected = false;
let connectInterval;
let config = defaultConfig;
let master;
if (fs_1.default.existsSync(configPath)) {
    console.log('file exists');
    config = JSON.parse(fs_1.default.readFileSync(configPath).toString());
    console.log(config);
}
else {
    fs_1.default.writeFileSync(configPath, JSON.stringify(defaultConfig));
}
const stream = new unix_dgram_1.default.createSocket('unix_dgram', () => {
});
stream.on('error', () => {
    if (connected) {
        connected = false;
        connectInterval = setInterval(() => {
            stream.connect('/tmp/SocketMost-client.sock');
        }, 100);
    }
});
stream.on('connect', () => {
    connected = true;
    if (connectInterval) {
        clearInterval(connectInterval);
    }
});
try {
    fs_1.default.unlinkSync('/tmp/SocketMost.sock');
}
catch (e) { /* swallow */ }
stream.bind('/tmp/SocketMost.sock');
connectInterval = setInterval(() => stream.connect('/tmp/SocketMost-client.sock'), 100);
const os8104 = new OS8104A_1.OS8104A(config.nodeAddress, config.groupAddress, config.freq);
// Call on error
// stream.on('error', (error) => {
//     console.log(error);
// });
os8104.on(Messages_js_1.Os8104Events.MostMessageRx, (message) => {
    if (!master) {
        if (message.fBlockID === 2) {
            console.log("master found");
            master = {
                eventType: Messages_js_1.EventTypes.MasterFoundEvent,
                instanceID: message.instanceID,
                sourceAddrHigh: message.sourceAddressHigh,
                sourceAddrLow: message.sourceAddressLow
            };
            streamSend(master);
        }
    }
    const newMessage = {
        eventType: Messages_js_1.EventTypes.SocketMostMessageRxEvent,
        ...message
    };
    streamSend(newMessage);
});
const streamSend = (data) => {
    stream.send(Buffer.from(JSON.stringify(data)));
};
// os8104.on('lockStatus', (data) => {
//     stream.send(Buffer.from(JSON.stringify({eventType: 'lockStatus', status: data})))
// })
os8104.on(Messages_js_1.Os8104Events.Shutdown, () => {
    streamSend({ eventType: 'shutDown' });
});
os8104.on(Messages_js_1.Os8104Events.AllocResult, (data) => {
    streamSend({ eventType: 'allocResult', ...data });
});
os8104.on(Messages_js_1.Os8104Events.MessageSent, () => {
    streamSend({ eventType: 'messageSent' });
});
os8104.on(Messages_js_1.Os8104Events.Locked, () => {
    streamSend({ eventType: 'locked' });
});
os8104.on(Messages_js_1.Os8104Events.Unlocked, () => {
    streamSend({ eventType: 'unlocked' });
});
stream.on(Messages_js_1.SocketTypes.MessageReceived, async (data) => {
    const event = JSON.parse(data.toString()).eventType;
    switch (event) {
        case Messages_js_1.SocketTypes.SendControlMessage: {
            //console.log("sending", message)
            const message = JSON.parse(data.toString());
            os8104.sendControlMessage(message);
            // TODO is this really needed? sendControlMessage doesn't return and is not async, so in what case is this
            //  actually required? No types set for now as suspect it needs to go
            stream.send(Buffer.from(JSON.stringify({ eventType: 'messageSent' })));
            break;
        }
        case Messages_js_1.SocketTypes.GetNodePosition: {
            const returnData = {
                nodePosition: os8104.getNodePosition(),
                maxPosition: os8104.getMaxPosition(),
                eventType: 'positionUpdate'
            };
            // REVIEW This is strange, NodePosition is not stated as a type for streamSend so unsure why no error here
            //  my guess is that it unions the same MessageDefault as the other typed streamSends (MasterFoundEvent, newMessage)
            //  which then makes me think there's something grossly incorrect here, leaving for now for review purposes
            streamSend(returnData);
            break;
        }
        case Messages_js_1.SocketTypes.GetMaster: {
            if (master) {
                streamSend(master);
            }
            break;
        }
        case Messages_js_1.SocketTypes.Allocate:
            console.log("awaited", os8104.allocate());
            break;
        case Messages_js_1.SocketTypes.GetSource: {
            const message = JSON.parse(data.toString());
            // REVIEW don't particularly like this, had to add connection label as a chained property solely for this
            //  call, need to look into alternatives, it feels like using an outer type (MostMessage in this case)
            //  for a switch statement is not ideal
            os8104.getRemoteSource(message.connectionLabel);
            break;
        }
        case Messages_js_1.SocketTypes.Stream: {
            const message = JSON.parse(data.toString());
            os8104.stream(message);
            break;
        }
        case Messages_js_1.SocketTypes.RetrieveAudio: {
            // TODO remove numbers from key in message
            const message = JSON.parse(data.toString());
            os8104.retrieveAudio(message);
        }
    }
});
process.on('SIGINT', function () {
    console.log("Caught interrupt signal");
    stream.close();
    process.exit();
});
