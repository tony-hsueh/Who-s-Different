import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PING_INTERVAL_MS,
  DEFAULT_PING_TIMEOUT_MS,
} from '../../src/server/app.js';
import { startServer, type Server } from './helpers.js';

let server: Server;
afterEach(async () => {
  await server.close();
});

// The Engine.IO handshake packet (`0{...}`) tells the client how often to expect a ping.
async function handshake(s: Server) {
  const { port } = s.app.httpServer.address() as AddressInfo;
  const res = await fetch(
    `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`,
  );
  const body = await res.text();
  return JSON.parse(body.slice(1)) as {
    pingInterval: number;
    pingTimeout: number;
  };
}

describe('heartbeat (QA-01)', () => {
  it('defaults to a 10 s interval and 10 s timeout, so a dead link is noticed within 20 s', async () => {
    expect(DEFAULT_PING_INTERVAL_MS).toBe(10_000);
    expect(DEFAULT_PING_TIMEOUT_MS).toBe(10_000);
    server = await startServer();
    expect(await handshake(server)).toMatchObject({
      pingInterval: 10_000,
      pingTimeout: 10_000,
    });
  });

  it('lets createApp override both values', async () => {
    server = await startServer({ pingIntervalMs: 1_500, pingTimeoutMs: 2_500 });
    expect(await handshake(server)).toMatchObject({
      pingInterval: 1_500,
      pingTimeout: 2_500,
    });
  });
});
