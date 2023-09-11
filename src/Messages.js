"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketTypes = exports.EventTypes = exports.Os8104Events = void 0;
var Os8104Events;
(function (Os8104Events) {
    Os8104Events["MostMessageRx"] = "newMessageRx";
    Os8104Events["AllocResult"] = "AllocResult";
    Os8104Events["GetSourceResult"] = "getSourceResult";
    Os8104Events["Unlocked"] = "unlocked";
    Os8104Events["Locked"] = "locked";
    Os8104Events["MessageSent"] = "messageSent";
    Os8104Events["Shutdown"] = "shutdown";
})(Os8104Events || (exports.Os8104Events = Os8104Events = {}));
var EventTypes;
(function (EventTypes) {
    EventTypes["MasterFoundEvent"] = "masterFound";
    EventTypes["SocketMostMessageRxEvent"] = "newMessage";
})(EventTypes || (exports.EventTypes = EventTypes = {}));
var SocketTypes;
(function (SocketTypes) {
    SocketTypes["MessageReceived"] = "message";
    SocketTypes["SendControlMessage"] = "sendControlMessage";
    SocketTypes["GetNodePosition"] = "getNodePosition";
    SocketTypes["GetMaster"] = "getMaster";
    SocketTypes["Allocate"] = "allocate";
    SocketTypes["GetSource"] = "getSource";
    SocketTypes["Stream"] = "stream";
    SocketTypes["RetrieveAudio"] = "retrieveAudio";
})(SocketTypes || (exports.SocketTypes = SocketTypes = {}));
