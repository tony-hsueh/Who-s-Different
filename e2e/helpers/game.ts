import { expect, type Browser } from '@playwright/test';
import { createHost, round, startButton, type Host } from './host.js';
import {
  findMinority,
  joinPlayers,
  readSecretWord,
  type Seat,
  type Split,
} from './players.js';

export interface Game extends Split {
  host: Host;
  seats: Seat[];
}

// A host and n real phones, started, with every player's word read through the card.
export async function startedGame(browser: Browser, n: number): Promise<Game> {
  const host = await createHost(browser);
  const players = await joinPlayers(browser, host.roomCode, n);
  await expect(host.page.getByText(`${n} / 15`)).toBeVisible();
  await startButton(host.page).click();
  await expect(round(host.page, 1)).toBeVisible();
  const seats: Seat[] = await Promise.all(
    players.map(async (player) => ({
      ...player,
      word: await readSecretWord(player.page),
    })),
  );
  return { host, seats, ...findMinority(seats) };
}
