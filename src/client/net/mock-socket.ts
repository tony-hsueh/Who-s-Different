import type { Ack } from '../../shared';
import type { SocketLike } from './socket';

type Listener = (...args: never[]) => void;

interface Pending {
  event: string;
  payload: unknown;
  ack: (response: Ack<unknown>) => void;
  answered: boolean;
}

// A fake Socket.IO client for tests. The `server*` and `answer` methods play the server.
export class MockSocket implements SocketLike {
  connected = false;
  readonly sendBuffer: unknown[] = [];
  connectCalls = 0;
  readonly sent: Pending[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload: unknown, ack: (response: Ack<unknown>) => void) {
    this.sent.push({ event, payload, ack, answered: false });
    return this;
  }

  connect() {
    this.connectCalls++;
    return this;
  }

  disconnect() {
    if (this.connected) this.serverDisconnect();
    return this;
  }

  serverConnect() {
    this.connected = true;
    this.fire('connect');
  }

  serverDisconnect() {
    this.connected = false;
    this.fire('disconnect', 'transport close');
  }

  serverEmit(event: string, ...args: unknown[]) {
    this.fire(event, ...args);
  }

  requestsFor(event: string) {
    return this.sent.filter((p) => p.event === event);
  }

  // Answers the oldest unanswered request of `event`.
  answer(event: string, response: Ack<unknown>) {
    const pending = this.sent.find((p) => p.event === event && !p.answered);
    if (!pending) throw new Error(`no pending ${event} request`);
    pending.answered = true;
    pending.ack(response);
  }

  private fire(event: string, ...args: unknown[]) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      (listener as (...a: unknown[]) => void)(...args);
    }
  }
}
