import {
  devices,
  expect,
  test,
  type Browser,
  type Page,
} from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { PlayerPrivateState } from '../src/shared/index.js';

// The host runs through the real host UI. Other players are node socket clients, plus one
// real phone page where the player reveal is checked.
interface Bot {
  nickname: string;
  playerId: string;
  socket: Socket;
  privates: PlayerPrivateState[];
}

const sockets: Socket[] = [];

test.afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

async function shot(page: Page, name: string) {
  const dir = process.env.EVIDENCE_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '建立房間' }).click();
  await expect(page).toHaveURL(/\/host\/.+/);
  return page.locator('.host-lobby__code').innerText();
}

async function addBot(
  baseURL: string,
  roomCode: string,
  nickname: string,
): Promise<Bot> {
  const socket = io(baseURL, { transports: ['websocket'] });
  sockets.push(socket);
  const bot: Bot = { nickname, playerId: '', socket, privates: [] };
  socket.on('game:player-state', (s: PlayerPrivateState) =>
    bot.privates.push(s),
  );
  const joined = await socket.emitWithAck('room:join', { roomCode, nickname });
  expect(joined.ok, `${nickname} joins`).toBe(true);
  bot.playerId = joined.data.playerId;
  const auth = await socket.emitWithAck('player:auth', {
    sessionToken: joined.data.sessionToken,
  });
  expect(auth.ok, `${nickname} auths`).toBe(true);
  bot.privates.push(auth.data.privateState);
  return bot;
}

async function openPhone(browser: Browser, roomCode: string, nickname: string) {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    deviceScaleFactor: 1,
  });
  const phone = await context.newPage();
  await phone.goto(`/room/${roomCode}`);
  await phone.getByLabel('暱稱').fill(nickname);
  await phone.getByRole('button', { name: '加入' }).click();
  await expect(phone.getByText('等待主持人開始')).toBeVisible();
  return { context, phone };
}

// The real phone's own seat, read through a fresh connection with its saved token.
async function phoneSeat(phone: Page, baseURL: string, roomCode: string) {
  const token = await phone.evaluate(
    (key) => localStorage.getItem(key),
    `wd:player:${roomCode}`,
  );
  expect(token).toBeTruthy();
  const socket = io(baseURL, { transports: ['websocket'] });
  sockets.push(socket);
  const auth = await socket.emitWithAck('player:auth', {
    sessionToken: token,
  });
  expect(auth.ok).toBe(true);
  return {
    playerId: auth.data.privateState.playerId as string,
    word: auth.data.privateState.secretWord as string,
  };
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

const lastWord = (bot: Bot) => bot.privates.at(-1)?.secretWord ?? '';

// Counts game:next-round frames the host page sends.
function countSent(page: Page, event: string) {
  const sent: string[] = [];
  page.on('websocket', (ws) =>
    ws.on('framesent', (frame) => {
      if (String(frame.payload).includes(event))
        sent.push(String(frame.payload));
    }),
  );
  return sent;
}

test('a full game: wrong catch, next round, skipped round, caught, finish, play again', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const nextRoundFrames = countSent(page, 'game:next-round');
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
  await expect(phone.getByRole('button', { name: '查看題目' })).toBeVisible();
  await expect.poll(() => bots.every((b) => lastWord(b) !== '')).toBe(true);

  // Four players mean three majority and one minority, so the minority word is the odd one out.
  const me = await phoneSeat(phone, baseURL!, roomCode);
  const words = [me.word, ...bots.map(lastWord)];
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const minorityWord = [...counts].find(([, n]) => n === 1)![0];
  const majorityWord = [...counts].find(([, n]) => n === 3)![0];
  const majorityBots = bots.filter((b) => lastWord(b) === majorityWord);
  const minorityNick =
    me.word === minorityWord
      ? '小明'
      : bots.find((b) => lastWord(b) === minorityWord)!.nickname;

  // Round 1: a majority player is voted out, which is the wrong catch.
  const wrong = majorityBots[0]!;
  await eliminate(page, wrong.nickname);
  const reveal = page.locator('.host-reveal');
  await expect(reveal).toHaveAttribute('data-outcome', 'wrong');
  await expect(
    page.getByRole('heading', { level: 1, name: '淘汰的是平民！' }),
  ).toBeVisible();
  await expect(page.getByText('糟糕！你們抓錯人了！')).toBeVisible();
  await expect(reveal.getByText(wrong.nickname)).toBeVisible();
  const color = await page
    .locator('.host-reveal__title')
    .evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(214, 40, 57)');
  const revealHtml = await page.content();
  for (const w of [majorityWord, minorityWord])
    expect(revealHtml).not.toContain(w);
  await expect(page.locator('.host-reveal')).not.toContainText(
    /詞|多數|少數|剩|存活/,
  );
  await page.waitForTimeout(1700);
  await shot(page, 'reveal-wrong');

  // The phone gets a short result and still has the secret card.
  await expect(
    phone.getByText(`${wrong.nickname} 被淘汰了，是平民`),
  ).toBeVisible();
  await shot(phone, 'phone-reveal');
  await phone.getByRole('button', { name: '查看題目' }).click();
  await expect(phone.locator('.wd-secret__word')).toHaveText(me.word);
  await phone.getByRole('button', { name: '隱藏題目' }).click();

  // A double click on 下一輪 moves one round, and the words stay the same.
  await page.getByRole('button', { name: '下一輪' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  expect(nextRoundFrames).toHaveLength(1);
  expect((await phoneSeat(phone, baseURL!, roomCode)).word).toBe(me.word);
  expect(bots.map(lastWord)).toStrictEqual(words.slice(1));
  await expect(phone.getByText(/被淘汰了/)).toHaveCount(0);

  // Round 2 is skipped, round 3 catches the minority and ends the game.
  await page.getByRole('button', { name: '本輪無人淘汰' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認' }).click();
  await expect(page.getByRole('heading', { name: 'Round 3' })).toBeVisible();
  await eliminate(page, minorityNick);
  await expect(reveal).toHaveAttribute('data-outcome', 'caught');
  await expect(
    page.getByRole('heading', { level: 1, name: '成功抓到臥底！' }),
  ).toBeVisible();
  await expect(page.getByText('漂亮！成功找出一位臥底！')).toBeVisible();
  expect(
    await page
      .locator('.host-reveal__title')
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe('rgb(29, 138, 74)');
  const revealHtml2 = await page.content();
  for (const w of [majorityWord, minorityWord])
    expect(revealHtml2).not.toContain(w);
  await page.waitForTimeout(1700);
  await shot(page, 'reveal-caught');

  await page.getByRole('button', { name: '看結果' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: '平民獲勝！' }),
  ).toBeVisible();
  const finished = page.locator('.host-finished');
  await expect(finished.getByText(majorityWord, { exact: true })).toBeVisible();
  await expect(finished.getByText(minorityWord, { exact: true })).toBeVisible();
  const roster = page.locator('.host-finished__roster li');
  await expect(roster).toHaveCount(4);
  await expect(
    page.locator('.host-finished__roster li[data-role="minority"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.host-finished__roster li[data-role="minority"]'),
  ).toContainText(minorityNick);
  await expect(
    page.getByText(`第 1 輪：${wrong.nickname}（平民）`),
  ).toBeVisible();
  await expect(page.getByText('第 2 輪：無人淘汰')).toBeVisible();
  await expect(
    page.getByText(`第 3 輪：${minorityNick}（臥底）`),
  ).toBeVisible();
  await shot(page, 'finished');
  await expect(phone.getByText('請看大螢幕')).toBeVisible();
  await shot(phone, 'phone-finished');

  // Play again: back to the lobby with the same players, and a different question.
  await page.getByRole('button', { name: '再玩一場' }).dblclick();
  await expect(page.getByRole('button', { name: '開始遊戲' })).toBeVisible();
  await expect(page.getByText('4 / 15')).toBeVisible();
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
  await expect
    .poll(() => bots.every((b) => b.privates.at(-1)?.phase === 'playing'))
    .toBe(true);
  // The question id is not sent to clients, so the pair of words stands in for it.
  const next = await phoneSeat(phone, baseURL!, roomCode);
  const nextWords = new Set([next.word, ...bots.map(lastWord)]);
  expect(nextWords.size).toBe(2);
  expect([...nextWords].sort()).not.toStrictEqual(
    [majorityWord, minorityWord].sort(),
  );
  await context.close();
});

test('the eliminated phone is told so and still reaches the secret card', async ({
  page,
  browser,
  baseURL,
}) => {
  const roomCode = await createRoom(page);
  for (const n of [1, 2, 3, 4, 5, 6])
    await addBot(baseURL!, roomCode, `機器人${n}`);
  const { context, phone } = await openPhone(browser, roomCode, '小明');
  await expect(page.getByText('7 / 15')).toBeVisible();
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
  await expect(phone.getByRole('button', { name: '查看題目' })).toBeVisible();

  await eliminate(page, '小明');
  await expect(page.locator('.host-reveal')).toBeVisible();
  await expect(phone.getByText('你被淘汰了')).toBeVisible();
  await shot(phone, 'phone-reveal-eliminated');
  await phone.getByRole('button', { name: '查看題目' }).click();
  await expect(phone.locator('.wd-secret__word')).toBeVisible();
  await context.close();
});

test('reduced motion swaps the shake and confetti for a fade', async ({
  page,
  baseURL,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const roomCode = await createRoom(page);
  for (const n of [1, 2, 3, 4, 5, 6])
    await addBot(baseURL!, roomCode, `機器人${n}`);
  await expect(page.getByText('6 / 15')).toBeVisible();
  await page.getByRole('button', { name: '開始遊戲' }).click();
  await eliminate(page, '機器人1');
  await expect(page.locator('.host-reveal')).toBeVisible();
  const animation = await page
    .locator('.host-reveal__title')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('host-reveal-fade');
  const confetti = page.locator('.host-reveal__confetti');
  if (await confetti.count()) await expect(confetti).toBeHidden();
});
