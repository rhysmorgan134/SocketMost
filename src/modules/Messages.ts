export type DriverConfig = {
    version: string,
    nodeAddress: number,
    groupAddress: number,
    freq: number
}

export type MessageDefault = {
    sourceAddrHigh: number
    sourceAddrLow: number
}

export type MasterFoundEvent = MessageDefault & {
    eventType: Os8104Events.MasterFoundEvent
    instanceID: number
}

export type newMessageEvent = MessageDefault & {
    eventType: 'newMessage'
    data: Buffer
}

export type netChangedEvent = {
    eventType: 'netChanged'
}

export type shutDown = {
    eventType: 'shutDown'
}

export interface MostMessage {
    eventType?: string
    targetAddressHigh: number
    targetAddressLow: number
    fBlockID: number
    instanceID: number
    fktId: number
    opType: number
    data: number[]
}

//this is the message received over socket most with the event type attached
export type SocketMostSendMessage = {
    eventType?: string
    targetAddressHigh: number
    targetAddressLow: number
    fBlockID: number
    instanceID: number
    fktId: number
    opType: number
    data: number[] | Buffer
}

// connectionLabel?: number
// sinkNr?: number

export type RetrieveAudio = {
    "0": number
    "1": number
    "2"?: number
    "3"?: number
}


export type RawMostRxMessage = {
    type: number
    sourceAddrHigh: number
    sourceAddrLow: number
    fBlockID: number
    instanceID: number
    fktID: number
    opType: number
    telID: number
    telLen: number
    data: Buffer
}

export type SocketMostMessageRx = RawMostRxMessage &{
    eventType: string
}

export type Config = {
    nodeAddressLow: number
    nodeAddressHigh: number
    groupAddress: number
}

export type Stream = {
    fBlockID: number
    instanceID: number
    sinkNr: number
    sourceAddrHigh: number
    sourceAddrLow: number
}

export type GetSource = {
    connectionLabel: number
}

export type AllocResult = {
    loc1: number
    loc2: number
    loc3: number
    loc4: number
    cl: number
    answer1?: "ALLOC_GRANT" | "ALLOC_BUSY" | "ALLOC_DENY" | "WRONG_TARGET" | "ERROR"
    freeChannels?: number
}

export type SourceResult = {
    nodePos: number
    group: number
    logicalHigh: number
    logicalLow: number
}

export type NodePosition = {
    nodePosition: number
    maxPosition: number
    eventType: 'positionUpdate'
}

export type newMessage = {
    sourceAddressHigh: number
    sourceAddressLow: number
}

export type MessageOnly = {
    eventType: 'locked' | 'unlocked' | 'shutDown' | 'messageSent' | 'getNodePosition'
}

export enum Os8104Events {
    MostMessageRx= "newMessageRx",
    AllocResult= "allocResult",
    GetSourceResult= "getSourceResult",
    Unlocked= "unlocked",
    Locked= "locked",
    MessageSent= "messageSent",
    Shutdown = "shutdown",
    PositionUpdate = "positionUpdate",
    MasterFoundEvent = 'masterFound',
    SocketMostMessageRxEvent = 'newMessage'
}

export enum SocketTypes {
    MessageReceived= 'message',
    SendControlMessage= 'sendControlMessage',
    GetNodePosition= 'getNodePosition',
    GetMaster= 'getMaster',
    Allocate= 'allocate',
    GetSource= 'getSource',
    Stream= 'stream',
    RetrieveAudio= 'retrieveAudio'
}

export enum Mode {
    leg = 0,
    enh = 1
}
