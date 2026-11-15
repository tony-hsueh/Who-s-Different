import { expect, test, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

// The player join form arrives with PR-10, so players join over a plain socket here.
// PR-14 replaces this with real player browsers.
const sockets: Socket[] = [];

test.afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

async function joinAs(baseURL: string, roomCode: string, nickname: string) {
  const socket = io(baseURL, { transports: ['websocket'] });
  sockets.push(socket);
  const ack = await socket.emitWithAck('room:join', { roomCode, nickname });
  expect(ack.ok, `${nickname} joins`).toBe(true);
}

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '建立房間' }).click();
  await expect(page).toHaveURL(/\/host\/.+/);
  const code = await page.locator('.host-lobby__code').innerText();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code;
}

const startButton = (page: Page) =>
  page.getByRole('button', { name: '開始遊戲' });

test('lobby shows the QR code, the code and the link, and the QR holds no token', async ({
  page,
  baseURL,
}) => {
  const code = await createRoom(page);
  const joinUrl = `${baseURL}/room/${code}`;
  await expect(page.getByText(joinUrl, { exact: true })).toBeVisible();
  const qr = page.getByRole('img', { name: /QR/ });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute('data-value', joinUrl);

  const stored = await page.evaluate(() => Object.values(localStorage));
  expect(stored.length).toBeGreaterThan(0);
  for (const secret of stored) {
    expect(joinUrl).not.toContain(secret);
  }
});

test('players appear live, start needs 4, and a reload keeps the lobby', async ({
  page,
  baseURL,
}) => {
  const code = await createRoom(page);
  await expect(startButton(page)).toBeDisabled();

  for (let i = 1; i <= 3; i++) {
    await joinAs(baseURL!, code, `玩家${i}`);
    await expect(page.getByText(`玩家${i}`)).toBeVisible({ timeout: 1000 });
  }
  await expect(page.getByText('3 / 15')).toBeVisible();
  await expect(startButton(page)).toBeDisabled();

  await joinAs(baseURL!, code, '玩家4');
  await expect(page.getByText('玩家4')).toBeVisible({ timeout: 1000 });
  await expect(page.getByText('4 / 15')).toBeVisible();
  await expect(startButton(page)).toBeEnabled();

  await page.reload();
  await expect(page.locator('.host-lobby__code')).toHaveText(code);
  await expect(page.getByText('4 / 15')).toBeVisible();
  await expect(startButton(page)).toBeEnabled();

  await startButton(page).click();
  await expect(page.getByRole('heading', { name: '遊戲進行中' })).toBeVisible();
  await expect(startButton(page)).toHaveCount(0);
});

test('15 players fit on 1920x1080 without scrolling', async ({
  page,
  baseURL,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const code = await createRoom(page);
  for (let i = 1; i <= 15; i++) await joinAs(baseURL!, code, `玩家${i}`);
  await expect(page.getByText('15 / 15')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(15);
  await expect(startButton(page)).toBeEnabled();
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
  const button = await startButton(page).boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(1080);

  const dir = process.env.EVIDENCE_DIR;
  if (dir)
    await page.screenshot({ path: `${dir}/lobby-15-players-1920x1080.png` });
  expect(info.errors).toHaveLength(0);
});
