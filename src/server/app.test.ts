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

describe('response headers', () => {
  it('does not announce the framework', async () => {
    const dir = makeClientDir('<html></html>');
    const { app } = startApp({ clientDir: dir });
    for (const path of ['/healthz', '/config', '/', '/room/ABCD']) {
      const res = await request(app).get(path);
      expect(res.headers['x-powered-by'], path).toBeUndefined();
    }
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

describe('Content-Security-Policy', () => {
  it('is set on API and client responses', async () => {
    const { app } = startApp({
      clientDir: makeClientDir('<!doctype html><title>spa</title>'),
    });
    for (const path of ['/healthz', '/', '/room/ABCD']) {
      const res = await request(app).get(path).set('Host', '127.0.0.1:3100');
      const csp = String(res.headers['content-security-policy']);
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("script-src 'self'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
    }
  });

  it('allows websocket connections back to the same host', async () => {
    const { app } = startApp();
    const res = await request(app)
      .get('/healthz')
      .set('Host', '192.168.1.5:3000');
    expect(String(res.headers['content-security-policy'])).toContain(
      "connect-src 'self' ws://192.168.1.5:3000 wss://192.168.1.5:3000",
    );
  });

  it('does not let a hostile Host header inject directives', async () => {
    const { app } = startApp();
    const res = await request(app)
      .get('/healthz')
      .set('Host', 'evil.test; script-src *');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).not.toContain('evil.test');
    expect(csp).toContain("connect-src 'self'");
  });
});

describe('GET /config', () => {
  it('reports the public base url the server was given', async () => {
    const { app } = startApp({ publicBaseUrl: 'https://wd.example.com' });
    const res = await request(app).get('/config');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ publicBaseUrl: 'https://wd.example.com' });
  });

  it('reports null when none is configured', async () => {
    const { app } = startApp();
    const res = await request(app).get('/config');
    expect(res.body).toStrictEqual({ publicBaseUrl: null });
  });

  it('is not swallowed by the SPA fallback', async () => {
    const { app } = startApp({
      clientDir: makeClientDir('<!doctype html><title>spa</title>'),
      publicBaseUrl: 'https://wd.example.com',
    });
    const res = await request(app).get('/config');
    expect(res.body).toStrictEqual({ publicBaseUrl: 'https://wd.example.com' });
  });
});
