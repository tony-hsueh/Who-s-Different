import {
  createHost,
  expect,
  joinPlayers,
  openPlayerPage,
  startButton,
  submitJoin,
  test,
} from './helpers/index.js';

test('the 16th player cannot join a full room', async ({ browser }) => {
  const host = await createHost(browser);
  await joinPlayers(browser, host.roomCode, 15);
  await expect(host.page.getByText('15 / 15')).toBeVisible();

  const late = await openPlayerPage(browser);
  await submitJoin(late, host.roomCode, '第十六人');
  await expect(late.getByRole('alert')).toHaveText('房間已經滿了');
  await expect(late.getByText('等待主持人開始')).toHaveCount(0);

  await expect(host.page.getByText('15 / 15')).toBeVisible();
  await expect(host.page.getByText('第十六人')).toHaveCount(0);
  await expect(startButton(host.page)).toBeEnabled();
});
