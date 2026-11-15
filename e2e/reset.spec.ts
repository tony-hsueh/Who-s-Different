import {
  eliminate,
  expect,
  findMinority,
  gameIdsOf,
  readSecretWord,
  round,
  startedGame,
  startButton,
  test,
  type Seat,
} from './helpers/index.js';

test('scenario 20: play again sends everyone back to the lobby and deals a new question', async ({
  browser,
}) => {
  const first = await startedGame(browser, 4);
  const { page, roomId } = first.host;
  await eliminate(page, first.minority[0]!.nickname);
  await page.getByRole('button', { name: '看結果' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: '平民獲勝！' }),
  ).toBeVisible();

  await page.getByRole('button', { name: '再玩一場' }).click();
  await expect(startButton(page)).toBeEnabled();
  await expect(page.getByText('4 / 15')).toBeVisible();
  for (const seat of first.seats) {
    await expect(seat.page.getByText('等待主持人開始')).toBeVisible();
    await expect(
      seat.page.getByRole('button', { name: '查看題目' }),
    ).toHaveCount(0);
  }

  await startButton(page).click();
  await expect(round(page, 1)).toBeVisible();
  const second: Seat[] = await Promise.all(
    first.seats.map(async (seat) => ({
      ...seat,
      word: await readSecretWord(seat.page),
    })),
  );
  const split = findMinority(second);
  expect(split.minority).toHaveLength(1);
  // The question id never reaches a phone, so the pair of words stands in for it.
  expect([split.majorityWord, split.minorityWord].sort()).not.toStrictEqual(
    [first.majorityWord, first.minorityWord].sort(),
  );
  for (const seat of second) {
    await expect(seat.page.getByText('第 1 輪')).toBeVisible();
    await expect(seat.page.getByText('存活')).toBeVisible();
  }

  const games = await gameIdsOf(roomId);
  expect(games).toHaveLength(2);
  expect(new Set(games).size).toBe(2);
});
