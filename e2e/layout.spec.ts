import { devices, expect, test, type Page } from '@playwright/test';

const iphone = devices['iPhone 13'];
const viewports = [
  {
    name: 'iPhone 13',
    use: {
      viewport: iphone.viewport,
      userAgent: iphone.userAgent,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: '1920x1080',
    use: { viewport: { width: 1920, height: 1080 } },
  },
];

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

for (const { name, use } of viewports) {
  test.describe(name, () => {
    test.use(use);

    for (const [label, path] of [
      ['home', '/'],
      ['host placeholder', '/host/nope'],
      ['player placeholder', '/room/ABCD'],
      ['404', '/nope/nothing'],
    ] as const) {
      test(`${label} has no horizontal scroll`, async ({ page }, info) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        const dir = process.env.EVIDENCE_DIR;
        if (dir) {
          const slug = `${label}-${name}`.replace(/[^a-z0-9]+/gi, '-');
          await page.screenshot({ path: `${dir}/${slug}.png` });
        }
        expect(info.errors).toHaveLength(0);
      });
    }
  });
}

test('a created room opens the host page and survives a reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '建立房間' }).click();
  await expect(page).toHaveURL(/\/host\/.+/);
  await expect(
    page.getByRole('heading', { name: '誰跟我不一樣？' }),
  ).toBeVisible();
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(
    page.getByRole('heading', { name: '誰跟我不一樣？' }),
  ).toBeVisible();
  await expect(page.getByText(/房間代碼/)).toBeVisible();
});

test('the CSP does not block the app', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('Content Security Policy')) {
      violations.push(msg.text());
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: '建立房間' }).click();
  await expect(page.getByText(/房間代碼/)).toBeVisible();
  expect(violations).toStrictEqual([]);
});
