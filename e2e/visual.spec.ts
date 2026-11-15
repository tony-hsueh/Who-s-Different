import {
  devices,
  expect,
  test,
  type Browser,
  type Page,
} from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { PlayerPrivateState } from '../src/shared/index.js';

// Produces the acceptance screenshots (set EVIDENCE_DIR) and checks the cover does not get in the way.
const sockets: Socket[] = [];

test.afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

async function shot(page: Page, name: string) {
  const dir = process.env.EVIDENCE_DIR;
  if (dir)
    await page.screenshot({
      path: `${dir}/${name}.png`,
      animations: 'disabled',
    });
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '建立房間' }).click();
  await expect(page).toHaveURL(/\/host\/.+/);
  return page.locator('.host-lobby__code').innerText();
}

async function addBot(baseURL: string, roomCode: string, nickname: string) {
  const socket = io(baseURL, { transports: ['websocket'] });
  sockets.push(socket);
  const privates: PlayerPrivateState[] = [];
  socket.on('game:player-state', (s: PlayerPrivateState) => privates.push(s));
  const joined = await socket.emitWithAck('room:join', { roomCode, nickname });
  expect(joined.ok, `${nickname} joins`).toBe(true);
  const auth = await socket.emitWithAck('player:auth', {
    sessionToken: joined.data.sessionToken,
  });
  expect(auth.ok, `${nickname} auths`).toBe(true);
  privates.push(auth.data.privateState);
  return { nickname, privates };
}

type Bot = Awaited<ReturnType<typeof addBot>>;
const lastWord = (bot: Bot) => bot.privates.at(-1)?.secretWord ?? '';

async function openPhone(browser: Browser, roomCode: string, nickname: string) {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
  });
  const phone = await context.newPage();
  await phone.goto(`/room/${roomCode}`);
  await phone.getByLabel('暱稱').fill(nickname);
  await phone.getByRole('button', { name: '加入' }).click();
  await expect(phone.getByText('等待主持人開始')).toBeVisible();
  return { context, phone };
}

async function phoneWord(phone: Page, baseURL: string, roomCode: string) {
  const token = await phone.evaluate(
    (key) => localStorage.getItem(key),
    `wd:player:${roomCode}`,
  );
  const socket = io(baseURL, { transports: ['websocket'] });
  sockets.push(socket);
  const auth = await socket.emitWithAck('player:auth', { sessionToken: token });
  expect(auth.ok).toBe(true);
  return auth.data.privateState.secretWord as string;
}

const avatar = (page: Page, nickname: string) =>
  page.getByRole('listitem').filter({ hasText: nickname }).getByRole('button');

async function eliminate(page: Page, nickname: string) {
  await avatar(page, nickname).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '確認淘汰' })
    .click();
}

test.describe('phone width (375px)', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  test('home and join screens show the cover without blocking the action or scrolling sideways', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.wd-cover')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '建立房間' }),
    ).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await shot(page, 'home-phone');

    await page.goto('/room/ABCD');
    await expect(page.locator('.wd-cover')).toBeVisible();
    await expect(page.getByRole('button', { name: '加入' })).toBeInViewport();
    await expect(page.getByLabel('暱稱')).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await shot(page, 'join-phone');
  });

  test('the host lobby does not scroll sideways at 375px', async ({ page }) => {
    await createRoom(page);
    await expect(page.locator('.wd-cover')).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test('home on the projector', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.locator('.wd-cover')).toBeVisible();
  await expect(page.getByRole('button', { name: '建立房間' })).toBeInViewport();
  await shot(page, 'home-desktop');
});

test('lobby with 15 players: cover on top, start button and QR code stay visible', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const roomCode = await createRoom(page);
  for (let i = 1; i <= 15; i++) await addBot(baseURL!, roomCode, `玩家${i}`);
  await expect(page.getByText('15 / 15')).toBeVisible();
  await expect(page.locator('.wd-cover')).toBeVisible();
  await expect(page.getByRole('button', { name: '開始遊戲' })).toBeInViewport();
  await expect(page.getByLabel('加入房間的 QR Code')).toBeInViewport();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await shot(page, 'lobby-15-desktop');

  // Colorblind check: with every hue removed the 15 avatars must still look different.
  const sources = await page
    .locator('.host-lobby__grid .wd-avatar__badge img')
    .evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')));
  expect(new Set(sources).size).toBe(15);
  await page.addStyleTag({ content: 'html { filter: grayscale(1); }' });
  await shot(page, 'lobby-15-grayscale');
});

test('secret card, both reveals and the finish screen on host and phone', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const roomCode = await createRoom(page);
  const bots = [
    await addBot(baseURL!, roomCode, '機器人1'),
    await addBot(baseURL!, roomCode, '機器人2'),
    await addBot(baseURL!, roomCode, '機器人3'),
  ];
  const { context, phone } = await openPhone(browser, roomCode, '小明');
  await expect(page.getByText('4 / 15')).toBeVisible();
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
  await expect.poll(() => bots.every((b) => lastWord(b) !== '')).toBe(true);
  await shot(page, 'playing-desktop');

  const myWord = await phoneWord(phone, baseURL!, roomCode);
  const words = [myWord, ...bots.map(lastWord)];
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const minorityWord = [...counts].find(([, n]) => n === 1)![0];
  const minorityNick =
    myWord === minorityWord
      ? '小明'
      : bots.find((b) => lastWord(b) === minorityWord)!.nickname;
  const wrong = bots.find((b) => b.nickname !== minorityNick)!;

  await phone.getByRole('button', { name: '查看題目' }).click();
  await expect(phone.locator('.wd-secret__word')).toBeVisible();
  expect(await horizontalOverflow(phone)).toBeLessThanOrEqual(0);
  await shot(phone, 'phone-secret-card');
  await phone.getByRole('button', { name: '隱藏題目' }).click();

  await eliminate(page, wrong.nickname);
  await expect(page.locator('.host-reveal')).toHaveAttribute(
    'data-outcome',
    'wrong',
  );
  await page.waitForTimeout(1700);
  await shot(page, 'reveal-wrong');
  await expect(
    phone.getByText(`${wrong.nickname} 被淘汰了，是平民`),
  ).toBeVisible();
  await shot(phone, 'phone-reveal');

  await page.getByRole('button', { name: '下一輪' }).click();
  await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  await eliminate(page, minorityNick);
  await expect(page.locator('.host-reveal')).toHaveAttribute(
    'data-outcome',
    'caught',
  );
  await page.waitForTimeout(1700);
  await shot(page, 'reveal-caught');

  await page.getByRole('button', { name: '看結果' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: '平民獲勝！' }),
  ).toBeVisible();
  await shot(page, 'finished-desktop');
  await expect(phone.getByText('請看大螢幕')).toBeVisible();
  await expect(phone.getByText('平民獲勝')).toBeVisible();
  await expect(phone.getByText('平民詞語')).toBeVisible();
  expect(await horizontalOverflow(phone)).toBeLessThanOrEqual(0);
  await shot(phone, 'finished-phone');
  await context.close();
});

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('home and the lobby follow prefers-color-scheme', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('.wd-cover')).toBeVisible();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe('rgb(20, 18, 43)');
    await shot(page, 'home-dark');
    await createRoom(page);
    await expect(page.getByRole('button', { name: '開始遊戲' })).toBeVisible();
    await shot(page, 'lobby-dark');
  });
});
