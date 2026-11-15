import {
  createHost,
  expect,
  joinPlayer,
  joinPlayers,
  round,
  startButton,
  startedGame,
  test,
} from './helpers/index.js';

// PRD rule: 4–6 players get 1 minority seat, 7–10 get 2, 11–15 get 3.
const cases = [
  { players: 4, minority: 1 },
  { players: 8, minority: 2 },
  { players: 10, minority: 2 },
  { players: 15, minority: 3 },
];

for (const { players, minority } of cases) {
  test(`${players} players start a game and each phone gets a word`, async ({
    browser,
  }) => {
    const game = await startedGame(browser, players);
    const { page } = game.host;

    await expect(page.getByRole('listitem')).toHaveCount(players);
    expect(game.seats).toHaveLength(players);
    expect(game.minority).toHaveLength(minority);
    expect(game.majority).toHaveLength(players - minority);
    for (const seat of game.seats) {
      await expect(seat.page.getByText('第 1 輪')).toBeVisible();
      await expect(
        seat.page.getByRole('button', { name: '查看題目' }),
      ).toBeVisible();
    }
  });
}

test('3 players cannot start, the 4th unlocks the button', async ({
  browser,
}) => {
  const host = await createHost(browser);
  await expect(startButton(host.page)).toBeDisabled();
  await joinPlayers(browser, host.roomCode, 3);
  await expect(host.page.getByText('3 / 15')).toBeVisible();
  await expect(startButton(host.page)).toBeDisabled();

  await joinPlayer(browser, host.roomCode, '玩家4');
  await expect(host.page.getByText('4 / 15')).toBeVisible();
  await expect(startButton(host.page)).toBeEnabled();
  await startButton(host.page).click();
  await expect(round(host.page, 1)).toBeVisible();
});
