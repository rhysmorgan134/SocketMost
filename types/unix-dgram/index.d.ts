declare module 'unix-dgram' {
  import { EventEmitter } from 'events'
  interface ReceiveInfo {
    size: number
    address: object
    path: string
  }
  class ErrnoException extends Error {
    errno: number
    code: number
    syscall: string
  }
  class InternalError extends Error {
    code: number
  }
  type OnMessageCallback = (data: Buffer, rinfo: ReceiveInfo) => void
  type SendCallback = (e?: ErrnoException | InternalError) => void
  type SocketType = 'udp4' | 'udp6' | 'unix_dgram'

  export class Socket extends EventEmitter {
    readonly type: SocketType
    bind(path: string): void
    connect(path: string): void
    send(buf: Buffer, callback?: SendCallback): void
    on(event: 'message', callback: OnMessageCallback): this
    on(event: 'writable', callback: () => void): this
    on(event: 'listening', callback: () => void): this
    on(event: 'connect', callback: () => void): this
    on(event: 'congestion', callback: (buf: Buffer) => void): this
    on(
      event: 'error',
      callback: (e: ErrnoException | InternalError) => void,
    ): this
    close(): void
  }
  export function createSocket(
    type: SocketType,
    listener?: OnMessageCallback,
  ): Socket
}
