import {
  avatar,
  dialog,
  eliminate,
  expect,
  packetJson,
  roleKeyPaths,
  round,
  startedGame,
  test,
} from './helpers/index.js';

test('scenario 9: the host screen and its frames never carry a living player’s word or side', async ({
  browser,
}) => {
  const game = await startedGame(browser, 7);
  const { page, frames } = game.host;
  const words = [game.majorityWord, game.minorityWord];
  // A recorder that sees nothing would pass every check below.
  await expect
    .poll(() => frames.all.some((f) => f.includes('"phase":"playing"')))
    .toBe(true);

  const check = async (label: string) => {
    const dom = await page.content();
    const text = await page.locator('body').innerText();
    const traffic = frames.all.join('\n');
    for (const word of words) {
      expect(dom, `${label}: DOM has ${word}`).not.toContain(word);
      expect(text, `${label}: text has ${word}`).not.toContain(word);
      expect(traffic, `${label}: frames have ${word}`).not.toContain(word);
    }
    expect(traffic, `${label}: a secret field was sent`).not.toContain(
      'secretWord',
    );
    // The reveal headline names the eliminated player's side, which is public, and nothing else may.
    const withoutRevealCopy = dom.replace(
      /<(?:h1|p) class="host-reveal__(?:title|subtitle)">[^<]*<[/](?:h1|p)>/g,
      '',
    );
    expect(withoutRevealCopy, `${label}: DOM names a side`).not.toMatch(
      /陣營|臥底|平民/,
    );
    const livingRoles = frames.all.flatMap((frame) => {
      const json = packetJson(frame);
      return json
        ? roleKeyPaths(json).filter((p) => !p.endsWith('.lastElimination.role'))
        : [];
    });
    expect(livingRoles, `${label}: frames carry a role`).toStrictEqual([]);
  };

  await check('playing');
  await avatar(page, game.majority[0]!.nickname).click();
  await check('confirm dialog open');
  await dialog(page).getByRole('button', { name: '取消' }).click();

  await eliminate(page, game.majority[0]!.nickname);
  await expect(page.locator('.host-reveal')).toBeVisible();
  await check('reveal');
  await page.getByRole('button', { name: '下一輪' }).click();
  await expect(round(page, 2)).toBeVisible();
  await check('next round');
});
