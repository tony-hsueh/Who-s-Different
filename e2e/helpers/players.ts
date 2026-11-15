import { devices, expect, type Browser, type Page } from '@playwright/test';
import { openContext } from './test.js';

export interface Player {
  nickname: string;
  page: Page;
}

export interface Seat extends Player {
  word: string;
}

export async function openPlayerPage(browser: Browser): Promise<Page> {
  const context = await openContext(browser, {
    ...devices['iPhone 13'],
    deviceScaleFactor: 1,
  });
  return context.newPage();
}

export async function submitJoin(
  page: Page,
  roomCode: string,
  nickname: string,
) {
  await page.goto(`/room/${roomCode}`);
  await page.getByLabel('暱稱').fill(nickname);
  await page.getByRole('button', { name: '加入' }).click();
}

export async function joinPlayer(
  browser: Browser,
  roomCode: string,
  nickname: string,
): Promise<Player> {
  const page = await openPlayerPage(browser);
  await submitJoin(page, roomCode, nickname);
  await expect(page.getByText('等待主持人開始')).toBeVisible();
  return { nickname, page };
}

// Players are named 玩家1 … 玩家n, in the order of the returned array.
export async function joinPlayers(
  browser: Browser,
  roomCode: string,
  n: number,
): Promise<Player[]> {
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      joinPlayer(browser, roomCode, `玩家${i + 1}`),
    ),
  );
}

export const secretWordLocator = (page: Page) =>
  page.locator('.wd-secret__word');

// Press view, read the word, press hide again, like a real player would.
export async function readSecretWord(page: Page): Promise<string> {
  await page.getByRole('button', { name: '查看題目' }).click();
  const word = secretWordLocator(page);
  await expect(word).toBeVisible();
  const text = (await word.innerText()).trim();
  await page.getByRole('button', { name: '隱藏題目' }).click();
  await expect(word).toHaveCount(0);
  return text;
}

export interface Split {
  minority: Seat[];
  majority: Seat[];
  minorityWord: string;
  majorityWord: string;
}

// Uses only what the players saw: the side with fewer players holding one word is the minority.
export function findMinority(seats: Seat[]): Split {
  const groups = new Map<string, Seat[]>();
  for (const seat of seats) {
    groups.set(seat.word, [...(groups.get(seat.word) ?? []), seat]);
  }
  if (groups.size !== 2) {
    throw new Error(`expected 2 distinct words, saw ${groups.size}`);
  }
  const [small, large] = [...groups.entries()].sort(
    (a, b) => a[1].length - b[1].length,
  );
  if (!small || !large || small[1].length === large[1].length) {
    throw new Error('the two word groups have the same size');
  }
  return {
    minorityWord: small[0],
    minority: small[1],
    majorityWord: large[0],
    majority: large[1],
  };
}
