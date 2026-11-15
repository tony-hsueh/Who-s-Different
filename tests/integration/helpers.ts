import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp, type CreateAppOptions } from '../../src/server/app.js';
import { questionBank } from '../../src/server/questions/bank.js';
import { RoomStore } from '../../src/server/rooms/room-store.js';
import type { GameState } from '../../src/shared/game-types.js';
import type {
  Ack,
  ClientToServerEvents,
  Requests,
  ServerToClientEvents,
} from '../../src/shared/protocol.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type RawSocket = {
  emit(event: string, ...args: unknown[]): void;
  emitWithAck(event: string, ...args: unknown[]): Promise<unknown>;
};

export type Frame = { event: string; data: unknown };

export function createClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

// Records every frame the server sends, acks included, so a test can search
// everything one socket ever received.
export class TestClient {
  readonly frames: Frame[] = [];

  constructor(readonly socket: ClientSocket) {
    socket.onAny((event: string, ...args: unknown[]) => {
      this.frames.push({ event, data: args });
    });
  }

  async call<E extends keyof Requests>(
    event: E,
    payload: Requests[E]['payload'],
  ): Promise<Ack<Requests[E]['data']>> {
    const res = (await this.raw().emitWithAck(event, payload)) as Ack<
      Requests[E]['data']
    >;
    this.frames.push({ event: `ack:${event}`, data: res });
    return res;
  }

  raw(): RawSocket {
    return this.socket as unknown as RawSocket;
  }

  received(event: string): unknown[] {
    return this.frames
      .filter((f) => f.event === event)
      .map((f) => (f.data as unknown[])[0]);
  }

  everything(): string {
    return JSON.stringify(this.frames);
  }
}

export async function startServer(options: CreateAppOptions = {}) {
  const clock = createClock();
  const store = new RoomStore({ bank: questionBank, now: clock.now });
  const app = createApp({ store, now: clock.now, ...options });
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const port = (app.httpServer.address() as AddressInfo).port;
  const clients: TestClient[] = [];

  const client = async () => {
    const socket: ClientSocket = connect(`http://127.0.0.1:${port}`, {
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    const c = new TestClient(socket);
    clients.push(c);
    return c;
  };

  return {
    app,
    store,
    clock,
    client,
    async close() {
      for (const c of clients) c.socket.close();
      await app.close();
    },
  };
}

export type Server = Awaited<ReturnType<typeof startServer>>;

export function must<T>(res: Ack<T>): T {
  if (!res.ok) throw new Error(`expected ok, got ${res.code}: ${res.message}`);
  return res.data;
}

export function gameOf(server: Server, roomId: string): GameState {
  const game = server.store.getRoom(roomId)?.game;
  if (!game) throw new Error('no game');
  return game;
}

// A room with an authenticated host and `count` authenticated players.
export async function openLobby(server: Server, count: number) {
  const host = await server.client();
  const created = must(await host.call('room:create', {}));
  must(await host.call('host:auth', { hostToken: created.hostToken }));
  const players: { client: TestClient; playerId: string; token: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const client = await server.client();
    const joined = must(
      await client.call('room:join', {
        roomCode: created.roomCode,
        nickname: `P${i}`,
      }),
    );
    must(
      await client.call('player:auth', { sessionToken: joined.sessionToken }),
    );
    players.push({
      client,
      playerId: joined.playerId,
      token: joined.sessionToken,
    });
  }
  return { host, roomId: created.roomId, roomCode: created.roomCode, players };
}

export async function startedGame(server: Server, count = 4) {
  const lobby = await openLobby(server, count);
  must(await lobby.host.call('game:start', {}));
  return lobby;
}

export function aliveOf(
  server: Server,
  roomId: string,
  role: 'majority' | 'minority',
): string {
  const found = gameOf(server, roomId).players.find(
    (p) => p.role === role && !p.eliminated,
  );
  if (!found) throw new Error(`no alive ${role}`);
  return found.playerId;
}
