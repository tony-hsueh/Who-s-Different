import { expect, test, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { PlayerPrivateState, PublicRoomState } from '../src/shared/index.js';

// The player join form arrives with PR-10, so players join over a plain socket here.
// PR-14 replaces this with real player browsers.
interface Phone {
  nickname: string;
  playerId: string;
  socket: Socket;
  rooms: PublicRoomState[];
  privates: PlayerPrivateState[];
}

const sockets: Socket[] = [];

test.afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

// Everything the host page sends or receives, whether Socket.IO is polling or on a WebSocket.
function recordTraffic(page: Page) {
  const traffic: string[] = [];
  const sent: string[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => traffic.push(String(frame.payload)));
    ws.on('framesent', (frame) => {
      traffic.push(String(frame.payload));
      sent.push(String(frame.payload));
    });
  });
  page.on('request', (request) => {
    if (!request.url().includes('/socket.io/')) return;
    const body = request.postData();
    if (body) {
      traffic.push(body);
      sent.push(body);
    }
  });
  page.on('response', (response) => {
    if (!response.url().includes('/socket.io/')) return;
    void response.text().then(
      (text) => traffic.push(text),
      () => undefined,
    );
  });
  return { traffic, sent };
}

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '建立房間' }).click();
  await expect(page).toHaveURL(/\/host\/.+/);
  const code = await page.locator('.host-lobby__code').innerText();
  const roomId = new URL(page.url()).pathname.split('/').pop()!;
  return { code, roomId };
}

async function joinAs(
  baseURL: string,
  roomCode: string,
  nickname: string,
): Promise<Phone> {
  const socket = io(baseURL, { transports: ['websocket'] });
  sockets.push(socket);
  const phone: Phone = {
    nickname,
    playerId: '',
    socket,
    rooms: [],
    privates: [],
  };
  socket.on('room:state', (s: PublicRoomState) => phone.rooms.push(s));
  socket.on('game:player-state', (s: PlayerPrivateState) =>
    phone.privates.push(s),
  );
  const joined = await socket.emitWithAck('room:join', { roomCode, nickname });
  expect(joined.ok, `${nickname} joins`).toBe(true);
  phone.playerId = joined.data.playerId;
  const auth = await socket.emitWithAck('player:auth', {
    sessionToken: joined.data.sessionToken,
  });
  expect(auth.ok, `${nickname} auths`).toBe(true);
  phone.rooms.push(auth.data.state);
  phone.privates.push(auth.data.privateState);
  return phone;
}

async function startGame(page: Page, baseURL: string, count: number) {
  const { code, roomId } = await createRoom(page);
  const phones: Phone[] = [];
  for (let i = 1; i <= count; i++)
    phones.push(await joinAs(baseURL, code, `玩家${i}`));
  await expect(page.getByText(`${count} / 15`)).toBeVisible();
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
  await expect
    .poll(() => phones.every((p) => p.privates.at(-1)?.secretWord))
    .toBe(true);
  return { code, roomId, phones };
}

const last = <T>(items: T[]) => items.at(-1)!;
const avatar = (page: Page, nickname: string) =>
  page.getByRole('listitem').filter({ hasText: nickname }).getByRole('button');
const dialog = (page: Page) => page.getByRole('dialog');

function roleKeyPaths(value: unknown, path = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((v, i) => roleKeyPaths(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => [
      ...(k === 'role' ? [`${path}.${k}`] : []),
      ...roleKeyPaths(v, `${path}.${k}`),
    ]);
  return [];
}

// Socket.IO packets look like `42["event",{...}]` or `431[{...}]`; the JSON starts at the first bracket.
function packetJson(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start < 0) return undefined;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return undefined;
  }
}

test('clicking an avatar asks first; cancel and Esc change nothing', async ({
  page,
  baseURL,
}) => {
  const { sent } = recordTraffic(page);
  const { phones } = await startGame(page, baseURL!, 4);
  const roomStatesBefore = phones.map((p) => p.rooms.length);

  await avatar(page, '玩家2').click();
  await expect(
    dialog(page).getByRole('heading', { name: '確定要淘汰玩家 玩家2 嗎？' }),
  ).toBeVisible();
  await expect(dialog(page)).not.toContainText(/陣營|臥底|平民/);
  await dialog(page).getByRole('button', { name: '取消' }).click();
  await expect(dialog(page)).toHaveCount(0);

  await avatar(page, '玩家3').click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  await page.waitForTimeout(300);
  expect(sent.filter((s) => s.includes('game:eliminate'))).toHaveLength(0);
  expect(phones.map((p) => p.rooms.length)).toStrictEqual(roomStatesBefore);
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
  await expect(page.getByText('已淘汰')).toHaveCount(0);
});

test('skipping a round needs a confirm, then every phone sees Round 2', async ({
  page,
  baseURL,
}) => {
  const { sent } = recordTraffic(page);
  const { phones } = await startGame(page, baseURL!, 4);

  await page.getByRole('button', { name: '本輪無人淘汰' }).click();
  await expect(
    dialog(page).getByRole('heading', {
      name: '本輪不淘汰任何人，直接進入下一輪？',
    }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
  expect(sent.filter((s) => s.includes('game:skip-round'))).toHaveLength(0);

  await page.getByRole('button', { name: '本輪無人淘汰' }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await expect
    .poll(() =>
      phones.every(
        (p) =>
          last(p.rooms).roundNumber === 2 &&
          last(p.privates).roundNumber === 2 &&
          last(p.rooms).phase === 'playing',
      ),
    )
    .toBe(true);
  expect(sent.filter((s) => s.includes('game:skip-round'))).toHaveLength(1);
});

test('double-clicking confirm sends one elimination, then the screen moves on', async ({
  page,
  baseURL,
}) => {
  const { sent } = recordTraffic(page);
  const { phones } = await startGame(page, baseURL!, 4);

  await avatar(page, '玩家2').click();
  await dialog(page).getByRole('button', { name: '確認淘汰' }).dblclick();
  await expect(page.getByRole('heading', { name: '淘汰揭曉' })).toBeVisible();
  await page.waitForTimeout(300);

  const eliminations = sent.filter((s) => s.includes('game:eliminate'));
  expect(eliminations).toHaveLength(1);
  expect(packetJson(eliminations[0]!)).toStrictEqual([
    'game:eliminate',
    { roundNumber: 1, playerId: phones[1]!.playerId },
  ]);
  await expect
    .poll(() => phones.every((p) => last(p.rooms).phase === 'reveal'))
    .toBe(true);
});

test('an eliminated avatar cannot be clicked or focused in the next round', async ({
  page,
  baseURL,
}) => {
  const { roomId } = await startGame(page, baseURL!, 7).then(async (game) => {
    await avatar(page, '玩家2').click();
    await dialog(page).getByRole('button', { name: '確認淘汰' }).click();
    await expect(page.getByRole('heading', { name: '淘汰揭曉' })).toBeVisible();
    return game;
  });

  // The reveal and next-round screens are PR-12; a second host connection moves the room on.
  const token = await page.evaluate(
    (id) => localStorage.getItem(`wd:host:${id}`) ?? '',
    roomId,
  );
  expect(token).not.toBe('');
  const hostSocket = io(baseURL!, { transports: ['websocket'] });
  sockets.push(hostSocket);
  const auth = await hostSocket.emitWithAck('host:auth', {
    hostToken: token,
  });
  expect(auth.ok).toBe(true);
  expect((await hostSocket.emitWithAck('game:next-round', {})).ok).toBe(true);

  await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  const out = avatar(page, '玩家2');
  await expect(out).toBeDisabled();
  await expect(page.getByText('已淘汰')).toHaveCount(1);
  await out.click({ force: true });
  await expect(dialog(page)).toHaveCount(0);

  await avatar(page, '玩家1').focus();
  await page.keyboard.press('Tab');
  await expect(avatar(page, '玩家3')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    dialog(page).getByRole('heading', { name: '確定要淘汰玩家 玩家3 嗎？' }),
  ).toBeVisible();
});

test('the host page never receives secret words or roles of living players', async ({
  page,
  baseURL,
}) => {
  const { traffic } = recordTraffic(page);
  const { phones } = await startGame(page, baseURL!, 4);
  const words = [
    ...new Set(phones.map((p) => last(p.privates).secretWord as string)),
  ];
  expect(words.length).toBeGreaterThan(0);

  const checkHost = async (label: string) => {
    const dom = await page.content();
    const text = await page.locator('body').innerText();
    const frames = traffic.join('\n');
    for (const word of words) {
      expect(dom, `${label}: DOM has ${word}`).not.toContain(word);
      expect(text, `${label}: text has ${word}`).not.toContain(word);
      expect(frames, `${label}: frames have ${word}`).not.toContain(word);
    }
    expect(frames, `${label}: frames carry a secret field`).not.toContain(
      'secretWord',
    );
    expect(dom).not.toMatch(/陣營|臥底|平民/);
  };

  await checkHost('playing');
  await avatar(page, '玩家2').click();
  await checkHost('confirm dialog open');
  await dialog(page).getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '本輪無人淘汰' }).click();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  await checkHost('after skip');

  // Roles are public only for the player who was just eliminated, never for the living.
  await avatar(page, '玩家2').click();
  await dialog(page).getByRole('button', { name: '確認淘汰' }).click();
  await expect(page.getByRole('heading', { name: '淘汰揭曉' })).toBeVisible();
  await checkHost('after elimination');
  const eliminatedId = phones[1]!.playerId;
  const livingRoleLeaks = traffic.flatMap((frame) => {
    const json = packetJson(frame);
    if (!json) return [];
    return roleKeyPaths(json).filter(
      (path) => !path.endsWith('.lastElimination.role'),
    );
  });
  expect(livingRoleLeaks).toStrictEqual([]);
  const eliminations = traffic
    .map(packetJson)
    .flatMap((json) => (json ? [JSON.stringify(json)] : []))
    .filter((json) => json.includes('lastElimination'));
  for (const json of eliminations) expect(json).toContain(eliminatedId);
});

test('15 players fit on 1920x1080 without scrolling', async ({
  page,
  baseURL,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const { phones } = await startGame(page, baseURL!, 15);
  expect(phones).toHaveLength(15);
  await expect(page.getByRole('listitem')).toHaveCount(15);
  await page.getByRole('button', { name: '本輪無人淘汰' }).waitFor();
  // Let the entry animation finish before measuring and taking the screenshot.
  await page.waitForTimeout(600);

  const overflow = await page.evaluate(() => ({
    y:
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight,
    x:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(overflow).toStrictEqual({ x: 0, y: 0 });

  const items = page.getByRole('listitem');
  for (let i = 0; i < 15; i++) {
    const box = await items.nth(i).boundingBox();
    expect(box, `player ${i + 1} is laid out`).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(1080);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1920);
  }
  const skip = await page
    .getByRole('button', { name: '本輪無人淘汰' })
    .boundingBox();
  expect(skip!.y + skip!.height).toBeLessThanOrEqual(1080);

  const dir = process.env.EVIDENCE_DIR;
  if (dir) {
    await page.screenshot({ path: `${dir}/playing-15-players-1920x1080.png` });
    await avatar(page, '玩家7').click();
    await page.screenshot({ path: `${dir}/eliminate-confirm-1920x1080.png` });
  }
  expect(info.errors).toHaveLength(0);
});
