import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

type App = ReturnType<typeof createApp>;

const running: App[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const created of running.splice(0)) await created.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true });
});

function startApp(options?: Parameters<typeof createApp>[0]) {
  const created = createApp(options);
  running.push(created);
  return created;
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
