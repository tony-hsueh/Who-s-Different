import { createHost, expect, openContext, test } from './helpers/index.js';

const noAccess = { name: '這個瀏覽器沒有這個房間的主持權限' };

test('another browser on the host URL is told it has no host permission', async ({
  browser,
}) => {
  const host = await createHost(browser);
  const other = await openContext(browser, {
    viewport: { width: 1920, height: 1080 },
  });
  const page = await other.newPage();

  await page.goto(`/host/${host.roomId}`);
  await expect(page.getByRole('heading', noAccess)).toBeVisible();
  await expect(page.getByText(/房間可能還在/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '房間已失效' })).toHaveCount(
    0,
  );

  // The room is still running for its real host.
  await expect(host.page.getByText(host.roomCode)).toBeVisible();

  await page.getByRole('button', { name: '回首頁' }).click();
  await expect(page).toHaveURL('/');
});

test('a saved host token for a room that does not exist shows 房間已失效', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('wd:host:does-not-exist', 'stale-token'),
  );
  await page.goto('/host/does-not-exist');
  await expect(page.getByRole('heading', { name: '房間已失效' })).toBeVisible();
  await expect(page.getByRole('heading', noAccess)).toHaveCount(0);
});
