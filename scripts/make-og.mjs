// Renders public/og.png (1200x630) from src/client/assets/cover.svg plus the title.
// Run: node scripts/make-og.mjs   (needs Chromium: npx playwright install chromium)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const cover = readFileSync(new URL('src/client/assets/cover.svg', root));
const coverUrl = `data:image/svg+xml;base64,${cover.toString('base64')}`;

const html = `<!doctype html>
<html lang="zh-Hant"><body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:#5b3df5;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif">
<img src="${coverUrl}" width="760" height="361" style="border-radius:28px;box-shadow:0 8px 0 rgba(31,27,58,.35)">
<div style="color:#fff;font-size:88px;font-weight:900;line-height:1">誰跟我不一樣？</div>
<div style="color:#ffe9a3;font-size:34px;font-weight:700">拿到不同詞語的人，就是臥底</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
  });
  await page.setContent(html);
  await page.screenshot({
    path: fileURLToPath(new URL('public/og.png', root)),
  });
} finally {
  await browser.close();
}
