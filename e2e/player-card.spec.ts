import {
  expect,
  readSecretWord,
  secretWordLocator,
  startedGame as startedRealGame,
  test,
} from './helpers/index.js';
import { devices, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import type { Ack, Requests } from '../src/shared/protocol.js';

const iphone = devices['iPhone 13'];
test.use({
  viewport: iphone.viewport,
  userAgent: iphone.userAgent,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

// A bare Socket.IO client that plays the host or another player from the test.
class Client {
  private constructor(readonly socket: Socket) {}

  static async connect(baseURL: string) {
    const socket = io(baseURL, { forceNew: true });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return new Client(socket);
  }

  async call<E extends keyof Requests>(
    event: E,
    payload: Requests[E]['payload'],
  ): Promise<Requests[E]['data']> {
    const ack = (await this.socket.emitWithAck(event, payload)) as Ack<
      Requests[E]['data']
    >;
    if (!ack.ok) throw new Error(`${event} failed: ${ack.code}`);
    return ack.data;
  }

  close() {
    this.socket.close();
  }
}

interface Seat {
  playerId: string;
  token: string;
}

class Room {
  readonly clients: Client[] = [];
  readonly bots: Seat[] = [];
  host!: Client;
  roomCode!: string;

  constructor(private readonly baseURL: string) {}

  static async open(baseURL: string) {
    const room = new Room(baseURL);
    room.host = await room.client();
    const created = await room.host.call('room:create', {});
    await room.host.call('host:auth', { hostToken: created.hostToken });
    room.roomCode = created.roomCode;
    return room;
  }

  async client() {
    const client = await Client.connect(this.baseURL);
    this.clients.push(client);
    return client;
  }

  async addBots(count: number) {
    for (let i = 0; i < count; i++) {
      const client = await this.client();
      const joined = await client.call('room:join', {
        roomCode: this.roomCode,
        nickname: `機器人${this.bots.length + 1}`,
      });
      this.bots.push({
        playerId: joined.playerId,
        token: joined.sessionToken,
      });
    }
  }

  // The server's own view of a seat, read through a fresh connection.
  async privateState(token: string) {
    const client = await this.client();
    return (await client.call('player:auth', { sessionToken: token }))
      .privateState;
  }

  async botWords() {
    return Promise.all(
      this.bots.map(
        async (bot) => (await this.privateState(bot.token)).secretWord,
      ),
    );
  }

  close() {
    for (const client of this.clients) client.close();
  }
}

function need(baseURL: string | undefined) {
  if (!baseURL) throw new Error('baseURL is not configured');
  return baseURL;
}

async function shot(page: Page, name: string) {
  const dir = process.env.EVIDENCE_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

async function joinAs(page: Page, roomCode: string, nickname: string) {
  await page.goto(`/room/${roomCode}`);
  await page.getByLabel('暱稱').fill(nickname);
  await page.getByRole('button', { name: '加入' }).click();
}

async function myToken(page: Page, roomCode: string) {
  const token = await page.evaluate(
    (key) => localStorage.getItem(key),
    `wd:player:${roomCode}`,
  );
  if (!token) throw new Error('no token saved');
  return token;
}

async function setVisibility(page: Page, state: 'visible' | 'hidden') {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => value,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function fire(page: Page, type: 'blur' | 'focus' | 'pagehide') {
  await page.evaluate((name) => window.dispatchEvent(new Event(name)), type);
}

const reveal = (page: Page) =>
  page.getByRole('button', { name: '查看題目' }).click();
const hide = (page: Page) =>
  page.getByRole('button', { name: '隱藏題目' }).click();
const word = (page: Page) => page.locator('.wd-secret__word');

async function startedGame(baseURL: string, page: Page, players = 4) {
  const room = await Room.open(need(baseURL));
  await room.addBots(players - 1);
  await joinAs(page, room.roomCode, '小明');
  await expect(page.getByText('等待主持人開始')).toBeVisible();
  await room.host.call('game:start', {});
  await expect(page.getByRole('button', { name: '查看題目' })).toBeVisible();
  return room;
}

test('the join form shows a Chinese message under the field for each failure', async ({
  page,
  baseURL,
}) => {
  const room = await Room.open(need(baseURL));
  await room.addBots(1);
  const field = page.getByLabel('暱稱');
  const error = page.getByRole('alert');

  await page.goto(`/room/${room.roomCode}`);
  await expect(page.getByRole('heading', { name: '加入遊戲' })).toBeVisible();
  await shot(page, 'join-form');

  await page.getByRole('button', { name: '加入' }).click();
  await expect(error).toHaveText('請輸入暱稱');
  await shot(page, 'join-error-empty');

  await field.fill('機器人1');
  await page.getByRole('button', { name: '加入' }).click();
  await expect(error).toHaveText('這個暱稱已經有人用了，換一個吧');

  await field.fill('一二三四五六七八九十一二三');
  await page.getByRole('button', { name: '加入' }).click();
  await expect(error).toHaveText('暱稱太長了，最多 12 個字');

  await page.goto('/room/ZZZZ');
  await page.getByLabel('暱稱').fill('小明');
  await page.getByRole('button', { name: '加入' }).click();
  await expect(error).toHaveText('找不到這個房間，請確認房間代碼');
  await shot(page, 'join-error-not-found');

  await room.addBots(3);
  await room.host.call('game:start', {});
  await page.goto(`/room/${room.roomCode}`);
  await page.getByLabel('暱稱').fill('遲到的人');
  await page.getByRole('button', { name: '加入' }).click();
  await expect(error).toHaveText('遊戲已經開始，現在不能加入');
  room.close();
});

test('a joined player waits in the lobby and can leave after confirming', async ({
  page,
  baseURL,
}) => {
  const room = await Room.open(need(baseURL));
  await room.addBots(2);
  await joinAs(page, room.roomCode, '小明');
  await expect(page.getByText('等待主持人開始')).toBeVisible();
  await expect(page.getByText('目前 3 人')).toBeVisible();
  await expect(page.getByText('小明')).toBeVisible();
  await shot(page, 'waiting');

  await page.getByRole('button', { name: '離開房間' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, 'leave-confirm');
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByText('等待主持人開始')).toBeVisible();

  await page.getByRole('button', { name: '離開房間' }).click();
  await page.getByRole('button', { name: '確定' }).click();
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  room.close();
});

test('the card is hidden by default and toggles repeatedly', async ({
  page,
  baseURL,
}) => {
  const room = await startedGame(need(baseURL), page);
  const mine = await room.privateState(await myToken(page, room.roomCode));
  const secret = mine.secretWord ?? '';
  expect(secret).not.toBe('');

  await expect(page.getByText('點一下查看題目')).toBeVisible();
  await expect(word(page)).toHaveCount(0);
  expect(await page.content()).not.toContain(secret);
  await expect(page.getByText('第 1 輪')).toBeVisible();
  await expect(page.getByText('存活')).toBeVisible();
  await shot(page, 'card-hidden');

  for (let i = 0; i < 3; i++) {
    await reveal(page);
    await expect(word(page)).toHaveText(secret);
    if (i === 0) await shot(page, 'card-revealed');
    await hide(page);
    await expect(word(page)).toHaveCount(0);
    expect(await page.content()).not.toContain(secret);
  }

  // The word is not selectable, and the card never says which side the player is on.
  await reveal(page);
  expect(
    await word(page).evaluate(
      (el) => getComputedStyle(el.parentElement!).userSelect,
    ),
  ).toBe('none');
  expect(await page.locator('body').innerText()).not.toMatch(/多數|少數|陣營/);
  room.close();
});

test('every control is at least 44px tall and nothing scrolls sideways', async ({
  page,
  baseURL,
}) => {
  const room = await startedGame(need(baseURL), page);
  for (const name of ['查看題目']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  const lobby = await Room.open(need(baseURL));
  await joinAs(page, lobby.roomCode, '小華');
  await expect(page.getByText('等待主持人開始')).toBeVisible();
  const leave = await page
    .getByRole('button', { name: '離開房間' })
    .boundingBox();
  expect(leave?.height).toBeGreaterThanOrEqual(44);
  lobby.close();
  room.close();
});

test('the word hides itself when the page is backgrounded', async ({
  page,
  baseURL,
}) => {
  const room = await startedGame(need(baseURL), page);

  await reveal(page);
  await expect(word(page)).toBeVisible();
  await setVisibility(page, 'hidden');
  await expect(word(page)).toHaveCount(0);
  await shot(page, 'card-backgrounded');
  await setVisibility(page, 'visible');
  await expect(page.locator('[data-backgrounded]')).toHaveCount(0);
  await expect(word(page)).toHaveCount(0);

  await reveal(page);
  await expect(word(page)).toBeVisible();
  await fire(page, 'pagehide');
  await expect(word(page)).toHaveCount(0);

  await fire(page, 'focus');
  await reveal(page);
  await expect(word(page)).toBeVisible();
  await fire(page, 'blur');
  await expect(word(page)).toHaveCount(0);
  await expect(page.locator('[data-backgrounded]')).toHaveCount(1);
  await fire(page, 'focus');
  await expect(page.locator('[data-backgrounded]')).toHaveCount(0);
  room.close();
});

test('a reload restores the seat, hidden, with the same word', async ({
  page,
  baseURL,
}) => {
  const room = await startedGame(need(baseURL), page);
  await reveal(page);
  const before = (await word(page).textContent()) ?? '';
  expect(before).not.toBe('');

  await page.reload();
  await expect(page.getByText('點一下查看題目')).toBeVisible();
  await expect(word(page)).toHaveCount(0);
  expect(await page.content()).not.toContain(before);
  await expect(page.getByLabel('暱稱')).toHaveCount(0);
  await reveal(page);
  await expect(word(page)).toHaveText(before);

  const server = await room.privateState(await myToken(page, room.roomCode));
  expect(server.secretWord).toBe(before);
  room.close();
});

test("the page never holds another player's word", async ({
  page,
  baseURL,
}) => {
  const room = await startedGame(need(baseURL), page);
  await reveal(page);
  const mine = (await word(page).textContent()) ?? '';
  const others = (await room.botWords()).filter(
    (w): w is string => w !== null && w !== mine,
  );
  // One seat holds the other word, so the other side's word exists.
  expect(others.length).toBeGreaterThan(0);
  const everything =
    (await page.content()) + (await page.locator('body').innerText());
  for (const other of others) expect(everything).not.toContain(other);
  room.close();
});

test('an eliminated player keeps the card, sees the mark, and can still read the word', async ({
  page,
  baseURL,
}) => {
  const room = await startedGame(need(baseURL), page, 7);
  const mine = await room.privateState(await myToken(page, room.roomCode));
  await room.host.call('game:eliminate', {
    roundNumber: 1,
    playerId: mine.playerId,
  });

  await expect(page.getByText('你已淘汰，可以繼續觀戰')).toBeVisible();
  await expect(page.locator('[data-tag="eliminated"]')).toBeVisible();
  await expect(word(page)).toHaveCount(0);
  await reveal(page);
  await expect(word(page)).toHaveText(mine.secretWord ?? '');
  await shot(page, 'card-eliminated');

  await page.reload();
  await expect(page.getByText('你已淘汰，可以繼續觀戰')).toBeVisible();
  room.close();
});

test('the finished screen shows the result, then a reset returns to waiting', async ({
  page,
  baseURL,
}) => {
  const room = await startedGame(need(baseURL), page);
  const mine = await room.privateState(await myToken(page, room.roomCode));
  const seats = [
    { playerId: mine.playerId, word: mine.secretWord },
    ...(await Promise.all(
      room.bots.map(async (bot) => ({
        playerId: bot.playerId,
        word: (await room.privateState(bot.token)).secretWord,
      })),
    )),
  ];
  // With four players exactly one holds the minority word, and out-voting it ends the game.
  const minority = seats.find(
    (seat) => seats.filter((s) => s.word === seat.word).length === 1,
  );
  if (!minority) throw new Error('no minority seat');
  const majorityWord = seats.find((s) => s.word !== minority.word)?.word ?? '';
  await room.host.call('game:eliminate', {
    roundNumber: 1,
    playerId: minority.playerId,
  });

  await expect(page.getByText('請看大螢幕')).toBeVisible();
  const words = page.locator('.wd-words');
  await expect(words).toContainText(majorityWord);
  await expect(words).toContainText(minority.word ?? '');
  await shot(page, 'finished');

  await room.host.call('game:reset', {});
  await expect(page.getByText('等待主持人開始')).toBeVisible();
  await expect(page.getByText('請看大螢幕')).toHaveCount(0);
  room.close();
});

// Scenarios 7 and 8 with a real host and four real phones.
test('scenario 7: every player gets one of the two words, and only their own', async ({
  browser,
}) => {
  const game = await startedRealGame(browser, 4);
  expect(new Set(game.seats.map((s) => s.word))).toStrictEqual(
    new Set([game.majorityWord, game.minorityWord]),
  );
  expect(game.minority).toHaveLength(1);

  for (const seat of game.seats) {
    const other =
      seat.word === game.majorityWord ? game.minorityWord : game.majorityWord;
    await seat.page.getByRole('button', { name: '查看題目' }).click();
    await expect(secretWordLocator(seat.page)).toHaveText(seat.word);
    const everything =
      (await seat.page.content()) +
      (await seat.page.locator('body').innerText());
    expect(everything, `${seat.nickname} must not hold ${other}`).not.toContain(
      other,
    );
    expect(await seat.page.locator('body').innerText()).not.toMatch(
      /多數|少數|陣營/,
    );
  }
});

test('scenario 8: the word can be hidden and viewed again, and hides itself in the background', async ({
  browser,
}) => {
  const game = await startedRealGame(browser, 4);
  const seat = game.seats[0]!;
  const { page } = seat;

  await expect(page.getByText('點一下查看題目')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    expect(await readSecretWord(page)).toBe(seat.word);
    expect(await page.content()).not.toContain(seat.word);
  }

  await page.getByRole('button', { name: '查看題目' }).click();
  await expect(secretWordLocator(page)).toBeVisible();
  await setVisibility(page, 'hidden');
  await expect(secretWordLocator(page)).toHaveCount(0);
  expect(await page.content()).not.toContain(seat.word);
  await setVisibility(page, 'visible');
  await expect(secretWordLocator(page)).toHaveCount(0);
  expect(await readSecretWord(page)).toBe(seat.word);
});
