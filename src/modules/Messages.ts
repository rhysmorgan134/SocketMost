export type MessageSource = {
  sourceAddrHigh: number
  sourceAddrLow: number
}

export type MessageTarget = {
  targetAddressHigh: number
  targetAddressLow: number
}

export type MasterFoundEvent = MessageSource & {
  eventType: Os8104Events.MasterFoundEvent
  instanceID: number
}

export type newMessageEvent = MessageSource & {
  eventType: Os8104Events.SocketMostMessageRxEvent
  data: Buffer
}

export type MostMessage<T> = {
  eventType?: string
  fBlockID: number
  instanceID: number
  fktID: number
  opType: number
  data: T
}

export type TargetMostMessage<T> = MostMessage<T> & MessageTarget

export type SourceMostMessage<T> = MostMessage<T> & MessageSource

//this is the message received over socket most with the event type attached
export type SocketMostSendMessage = TargetMostMessage<number[] | Buffer>

export type RetrieveAudio = {
  '0': number
  '1': number
  '2'?: number
  '3'?: number
}

export type MostRxMessage = SourceMostMessage<Buffer> & {
  type: number
  telID: number
  telLen: number
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

export type Source = {
  fBlockID: number
  instanceID: number
  sourceNr: number
  sourceAddrHigh: number
  sourceAddrLow: number
}

export type AllocSourceResult = {
  byte0: number
  byte1: number
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
  answer1?:
    | 'ALLOC_GRANT'
    | 'ALLOC_BUSY'
    | 'ALLOC_DENY'
    | 'WRONG_TARGET'
    | 'ERROR'
  freeChannels?: number
  eventType: Os8104Events.AllocResult
}

export type DeallocResult = {
  answer?:
    | 'DEALLOC_GRANT'
    | 'DEALLOC_BUSY'
    | 'DEALLOC_WRONG'
    | 'WRONG_TARGET'
    | 'ERROR'
  eventType: Os8104Events.DeallocResult
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
  eventType: Os8104Events.PositionUpdate
}

export type newMessage = {
  sourceAddressHigh: number
  sourceAddressLow: number
}

export type MessageOnly = {
  eventType:
    | Os8104Events.Locked
    | Os8104Events.Unlocked
    | Os8104Events.Shutdown
    | Os8104Events.MessageSent
    | SocketTypes.GetNodePosition
}

export type ShutdownMessage = {
  fblockId: number
  fktId: number
  optype: number
  data: number[]
}

export type Amplifier = {
  fblockId: number
  targetAddressHigh: number
  targetAddressLow: number
  instanceId: number
  sinkNumber: number
}

export type UsbSettings = {
  version: string
  standalone: boolean
  autoShutdown: boolean
  customShutdown: boolean
  auxPower: boolean
  forty8Khz: boolean
  spare3: boolean
  spare4: boolean
  spare5: boolean
  nodeAddressHigh: number
  nodeAddressLow: number
  groupAddress: number
  shutdownTimeDelay: number
  startupTimeDelay: number
  customShutdownMessage: ShutdownMessage
  amplifier: Amplifier
}

export enum Os8104Events {
  MostMessageRx = 'newMessageRx',
  AllocResult = 'allocResult',
  GetSourceResult = 'getSourceResult',
  Unlocked = 'unlocked',
  Locked = 'locked',
  MessageSent = 'messageSent',
  Shutdown = 'shutdown',
  PositionUpdate = 'positionUpdate',
  MasterFoundEvent = 'masterFound',
  SocketMostMessageRxEvent = 'newMessage',
  DeallocResult = 'deallocResult',
  Settings = 'settings',
}

export enum SocketTypes {
  MessageReceived = 'message',
  SendControlMessage = 'sendControlMessage',
  GetNodePosition = 'getNodePosition',
  GetMaster = 'getMaster',
  Allocate = 'allocate',
  GetSource = 'getSource',
  Stream = 'stream',
  RetrieveAudio = 'retrieveAudio',
  NewConnection = 'newConnection',
  ConnectSource = 'connectSource',
  DisconnectSource = 'disconnectSource',
  StopStream = 'stopStream',
  Deallocate = 'deallocate',
}

export enum Mode {
  leg = 0,
  enh = 1,
}

export type Device = {
  addrHigh: number
  addrLow: number
  fBlockId: number
  instanceId: number
  interfaceNo: number
}

export type ModuleSingle = {
  addrHigh: number
  addrLow: number
  fBlockId: number
  instanceId: number
  functions: number[]
}

export type UsbConfig = {
  configSet: boolean
  addrHigh: number
  addrLow: number
  group: number
  amp: Device
  mic: Device
}

type PreDefinedAmplifers = { [key: string]: Amplifier }

export const preDefinedAmplifiers: PreDefinedAmplifers = {
  jlr: {
    fblockId: 0x22,
    targetAddressHigh: 0x01,
    targetAddressLow: 0x86,
    instanceId: 0x05,
    sinkNumber: 0x01,
  },
  bmw: {
    fblockId: 0x22,
    targetAddressHigh: 0x01,
    targetAddressLow: 0x01,
    instanceId: 0x01,
    sinkNumber: 0x02,
  },
  volvoP1: {
    fblockId: 0x22,
    targetAddressHigh: 0x1,
    targetAddressLow: 0x6d,
    instanceId: 0x01,
    sinkNumber: 0x01,
  },
}
