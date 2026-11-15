import type { Locator, Page } from '@playwright/test';
import {
  avatar,
  eliminate,
  expect,
  joinPlayers,
  createHost,
  readSecretWord,
  round,
  secretWordLocator,
  startedGame,
  test,
} from './helpers/index.js';

const offlineMark = (host: Page, nickname: string): Locator =>
  host.getByRole('listitem').filter({ hasText: nickname }).getByText('離線');

// The server waits 3 s before it announces a lost connection, and the browser needs a moment
// to notice; coming back can take one Socket.IO connect timeout on top of the backoff.
const DETECT = { timeout: 15_000 };
const RECOVER = { timeout: 40_000 };

test('scenario 15: a reload brings the player back as the same person, in the lobby and in the game', async ({
  browser,
}) => {
  const host = await createHost(browser);
  const players = await joinPlayers(browser, host.roomCode, 4);
  const me = players[0]!;

  await me.page.reload();
  await expect(me.page.getByText('等待主持人開始')).toBeVisible();
  await expect(me.page.getByLabel('暱稱')).toHaveCount(0);
  await expect(host.page.getByText('4 / 15')).toBeVisible();
  await expect(host.page.getByText(me.nickname, { exact: true })).toHaveCount(
    1,
  );

  await host.page.getByRole('button', { name: '開始遊戲' }).click();
  await expect(me.page.getByRole('button', { name: '查看題目' })).toBeVisible();
  const before = await readSecretWord(me.page);

  await me.page.reload();
  await expect(me.page.getByText('點一下查看題目')).toBeVisible();
  await expect(me.page.getByLabel('暱稱')).toHaveCount(0);
  await expect(secretWordLocator(me.page)).toHaveCount(0);
  expect(await readSecretWord(me.page)).toBe(before);
  await expect(host.page.getByRole('listitem')).toHaveCount(4);
});

test('the host reloads and still holds the controls', async ({ browser }) => {
  const game = await startedGame(browser, 7);
  const { page } = game.host;

  await page.reload();
  await expect(round(page, 1)).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(7);
  await eliminate(page, game.majority[0]!.nickname);
  await expect(page.locator('.host-reveal')).toBeVisible();

  await page.reload();
  await expect(page.locator('.host-reveal')).toBeVisible();
  await page.getByRole('button', { name: '下一輪' }).click();
  await expect(round(page, 2)).toBeVisible();
  await expect(avatar(page, game.majority[0]!.nickname)).toBeDisabled();
});

test('scenario 16: a lost connection does not change who is alive', async ({
  browser,
}) => {
  const game = await startedGame(browser, 7);
  const { page } = game.host;
  const gone = game.majority[0]!;
  const rest = game.seats.filter((s) => s !== gone);

  await gone.page.context().setOffline(true);
  await expect(offlineMark(page, gone.nickname)).toBeVisible(DETECT);
  await expect(gone.page.getByText('連線中…')).toBeVisible();

  // Still alive: not struck out, still pickable, and the game goes on without them.
  await expect(page.getByText('已淘汰')).toHaveCount(0);
  await expect(avatar(page, gone.nickname)).toBeEnabled();
  await eliminate(
    page,
    rest.find((s) => s.word !== game.minorityWord)!.nickname,
  );
  await expect(page.locator('.host-reveal')).toBeVisible();
  await page.getByRole('button', { name: '下一輪' }).click();
  await expect(round(page, 2)).toBeVisible();
  await expect(avatar(page, gone.nickname)).toBeEnabled();
  await expect(page.getByText('已淘汰')).toHaveCount(1);
});

test('scenario 17: after reconnecting the avatar is normal again and the phone has its word', async ({
  browser,
}) => {
  const game = await startedGame(browser, 4);
  const { page } = game.host;
  const seat = game.seats[0]!;

  await seat.page.context().setOffline(true);
  await expect(offlineMark(page, seat.nickname)).toBeVisible(DETECT);
  await seat.page.context().setOffline(false);

  await expect(offlineMark(page, seat.nickname)).toHaveCount(0, RECOVER);
  await expect(seat.page.getByText('連線中…')).toHaveCount(0);
  await expect(
    seat.page.getByRole('button', { name: '查看題目' }),
  ).toBeVisible();
  expect(await readSecretWord(seat.page)).toBe(seat.word);
});

test('scenario 18: closing an old tab does not knock the player offline', async ({
  browser,
}) => {
  const game = await startedGame(browser, 4);
  const { page } = game.host;
  const seat = game.seats[0]!;

  const second = await seat.page.context().newPage();
  await second.goto(`/room/${game.host.roomCode}`);
  await expect(second.getByRole('button', { name: '查看題目' })).toBeVisible();
  await seat.page.close();

  // Well past the server's 3 s debounce: the new tab's connection must still count.
  await second.waitForTimeout(5_000);
  await expect(offlineMark(page, seat.nickname)).toHaveCount(0);
  expect(await readSecretWord(second)).toBe(seat.word);

  // Control: with no tab left the same mark does appear, so the check above could fail.
  await second.close();
  await expect(offlineMark(page, seat.nickname)).toBeVisible(DETECT);
});
