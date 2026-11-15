import {
  adminStatus,
  eliminate,
  expect,
  fetchEvents,
  gameIdsOf,
  playerIdOf,
  round,
  startedGame,
  test,
} from './helpers/index.js';

test('scenario 21: every game can be looked up in the event log', async ({
  browser,
}) => {
  const game = await startedGame(browser, 4);
  const { page, roomId, frames } = game.host;
  const wrong = game.majority[0]!;
  const caught = game.minority[0]!;

  await eliminate(page, wrong.nickname);
  await page.getByRole('button', { name: '下一輪' }).click();
  await expect(round(page, 2)).toBeVisible();
  await page.getByRole('button', { name: '本輪無人淘汰' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認' }).click();
  await expect(round(page, 3)).toBeVisible();
  await eliminate(page, caught.nickname);
  await page.getByRole('button', { name: '看結果' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: '平民獲勝！' }),
  ).toBeVisible();

  // The room id is in the host URL, and the log names the game that ran in it.
  const [gameId, ...others] = await gameIdsOf(roomId);
  expect(others).toHaveLength(0);
  const events = await fetchEvents(gameId!);

  const types = events.map((e) => e.eventType);
  const expected = [
    'GAME_STARTED',
    'WORDS_ASSIGNED',
    'ROUND_STARTED',
    'ELIMINATION_CONFIRMED',
    'PLAYER_ELIMINATED',
    'ROUND_STARTED',
    'ROUND_SKIPPED',
    'ROUND_STARTED',
    'ELIMINATION_CONFIRMED',
    'PLAYER_ELIMINATED',
    'WIN_CONDITION_MET',
    'GAME_FINISHED',
  ];
  let at = 0;
  for (const type of types) if (type === expected[at]) at += 1;
  expect(types, 'the game events appear in play order').toEqual(
    expect.arrayContaining(expected),
  );
  expect(at, `events seen in order: ${types.join(', ')}`).toBe(expected.length);

  const stamps = events.map((e) => e.timestamp);
  expect(stamps).toStrictEqual([...stamps].sort());
  const eliminated = events
    .filter((e) => e.eventType === 'PLAYER_ELIMINATED')
    .map((e) => e.payload['eliminatedPlayerId']);
  expect(eliminated).toStrictEqual([
    playerIdOf(frames, wrong.nickname),
    playerIdOf(frames, caught.nickname),
  ]);
  expect(
    events.find((e) => e.eventType === 'GAME_FINISHED')?.payload,
  ).toMatchObject({ winner: 'majority' });

  // The log is not a leak: no word, no secret field, no token.
  const raw = JSON.stringify(events);
  expect(raw).not.toContain(game.majorityWord);
  expect(raw).not.toContain(game.minorityWord);
  expect(raw).not.toMatch(/secretWord|sessionToken|hostToken/);

  expect(await adminStatus(`/admin/games/${gameId}/events`, 'wrong')).toBe(401);
  expect(await adminStatus('/admin/games/no-such-game/events')).toBe(404);
});
