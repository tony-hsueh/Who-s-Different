import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/index.js';
import { createApp } from './app.js';

type App = ReturnType<typeof createApp>;
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const running: App[] = [];
const sockets: ClientSocket[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  for (const { io } of running.splice(0)) await io.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true });
});

function startApp(options?: Parameters<typeof createApp>[0]) {
  const created = createApp(options);
  running.push(created);
  return created;
}

async function listen({ httpServer }: App) {
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  return (httpServer.address() as AddressInfo).port;
}

function makeClientDir(html: string) {
  const dir = mkdtempSync(join(tmpdir(), 'wd-client-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'index.html'), html);
  return dir;
}

describe('GET /healthz', () => {
  it('answers 200 with exactly {ok:true}', async () => {
    const { app } = startApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ ok: true });
  });
});

describe('echo socket event', () => {
  it('acks with the payload it was sent', async () => {
    const created = startApp();
    const port = await listen(created);
    const socket: ClientSocket = connect(`http://127.0.0.1:${port}`);
    sockets.push(socket);

    const payload = { text: '誰跟我不一樣？' };
    await expect(socket.emitWithAck('echo', payload)).resolves.toStrictEqual(
      payload,
    );
  });

  it('keeps serving after a client emits echo without an ack', async () => {
    const created = startApp();
    const port = await listen(created);
    const socket: ClientSocket = connect(`http://127.0.0.1:${port}`);
    sockets.push(socket);
    // Deliberately bypass the typed event map: a misbehaving client.
    (socket as unknown as { emit(e: string, p: unknown): void }).emit('echo', {
      text: 'no ack',
    });

    await expect(
      socket.emitWithAck('echo', { text: 'still alive' }),
    ).resolves.toStrictEqual({ text: 'still alive' });
  });
});

describe('static client (production)', () => {
  const html = '<!doctype html><title>spa</title><div id="root"></div>';

  it('serves index.html for client-side routes', async () => {
    const { app } = startApp({ clientDir: makeClientDir(html) });
    const res = await request(app).get('/some/route');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toBe(html);
  });

  it('does not swallow /healthz', async () => {
    const { app } = startApp({ clientDir: makeClientDir(html) });
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ ok: true });
  });

  it('leaves /socket.io to Socket.IO', async () => {
    const created = startApp({ clientDir: makeClientDir(html) });
    const res = await request(created.httpServer).get(
      '/socket.io/?EIO=4&transport=polling',
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toBe(html);
  });

  it('serves no html when no clientDir is given', async () => {
    const { app } = startApp();
    const res = await request(app).get('/some/route');
    expect(res.status).toBe(404);
  });
});
