import { expect, test } from '@playwright/test';

const gameName = '誰跟我不一樣？';

test('home page shows the game name', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(gameName);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(gameName);
});

test('an unknown client route still loads the app', async ({ page }) => {
  await page.goto('/some/route');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '找不到這個頁面',
  );
});

test('GET /healthz answers {ok:true}', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.status()).toBe(200);
  expect(await res.json()).toStrictEqual({ ok: true });
});

test('Socket.IO answers on the same origin', async ({ request }) => {
  const res = await request.get('/socket.io/?EIO=4&transport=polling');
  expect(res.status()).toBe(200);
});

test.describe('on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('home page fits the screen without horizontal scroll', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(gameName);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
