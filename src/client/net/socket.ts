import { io, type ManagerOptions, type SocketOptions } from 'socket.io-client';
import type { Ack } from '../../shared';

// The slice of a Socket.IO client that the connection layer uses. Tests swap in a fake.
export interface SocketLike {
  readonly connected: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  off(event: string, listener: (...args: never[]) => void): unknown;
  emit(
    event: string,
    payload: unknown,
    ack: (response: Ack<unknown>) => void,
  ): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

// Socket.IO doubles the delay after every failed attempt, up to the max.
export const socketOptions: Partial<ManagerOptions & SocketOptions> = {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 10_000,
  randomizationFactor: 0.5,
};

export function createSocket(): SocketLike {
  return io(socketOptions) as unknown as SocketLike;
}
