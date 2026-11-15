import { expect, type Browser, type Page } from '@playwright/test';
import { openContext, trackRoom } from './test.js';

export interface Frames {
  // Everything the page sent or received over WebSocket or Socket.IO polling.
  all: string[];
  sent: string[];
}

// Socket.IO may start on polling and upgrade later, so both transports are recorded.
export function captureWsFrames(page: Page): Frames {
  const frames: Frames = { all: [], sent: [] };
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => frames.all.push(String(frame.payload)));
    ws.on('framesent', (frame) => {
      frames.all.push(String(frame.payload));
      frames.sent.push(String(frame.payload));
    });
  });
  page.on('request', (request) => {
    if (!request.url().includes('/socket.io/')) return;
    const body = request.postData();
    if (body) {
      frames.all.push(body);
      frames.sent.push(body);
    }
  });
  page.on('response', (response) => {
    if (!response.url().includes('/socket.io/')) return;
    void response.text().then(
      (text) => frames.all.push(text),
      () => undefined,
    );
  });
  return frames;
}

// Socket.IO packets look like `42["event",{...}]` or `431[{...}]`; the JSON starts at the first bracket.
export function packetJson(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start < 0) return undefined;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return undefined;
  }
}

export interface Host {
  page: Page;
  roomCode: string;
  roomId: string;
  frames: Frames;
}

export async function createHost(browser: Browser): Promise<Host> {
  const context = await openContext(browser, {
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const frames = captureWsFrames(page);
  await page.goto('/');
  await page.getByRole('button', { name: '建立房間' }).click();
  await expect(page).toHaveURL(/\/host\/.+/);
  const roomCode = await page.locator('.host-lobby__code').innerText();
  expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);
  const roomId = new URL(page.url()).pathname.split('/').pop() ?? '';
  trackRoom(roomId);
  return { page, roomCode, roomId, frames };
}

export const startButton = (page: Page) =>
  page.getByRole('button', { name: '開始遊戲' });
export const round = (page: Page, n: number) =>
  page.getByRole('heading', { name: `Round ${n}` });
export const avatar = (page: Page, nickname: string) =>
  page.getByRole('listitem').filter({ hasText: nickname }).getByRole('button');
export const dialog = (page: Page) => page.getByRole('dialog');

export async function eliminate(page: Page, nickname: string) {
  await avatar(page, nickname).click();
  await dialog(page).getByRole('button', { name: '確認淘汰' }).click();
}

// Every path at which a `role` key appears anywhere in a payload.
export function roleKeyPaths(value: unknown, path = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((v, i) => roleKeyPaths(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => [
      ...(k === 'role' ? [`${path}.${k}`] : []),
      ...roleKeyPaths(v, `${path}.${k}`),
    ]);
  return [];
}

// The public room state the host receives lists every player with an id and a nickname.
export function playerIdOf(frames: Frames, nickname: string): string {
  const packets = frames.all.flatMap((frame) => frame.split(''));
  for (const frame of packets) {
    const json = JSON.stringify(packetJson(frame) ?? null);
    const match = new RegExp(
      `"playerId":"([^"]+)"[^{}]*"nickname":"${nickname}"|"nickname":"${nickname}"[^{}]*"playerId":"([^"]+)"`,
    ).exec(json);
    const id = match?.[1] ?? match?.[2];
    if (id) return id;
  }
  throw new Error(`no player id for ${nickname} in the host frames`);
}
