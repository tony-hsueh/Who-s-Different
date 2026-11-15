import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Browser, Page } from '@playwright/test';
import {
  BASE_URL,
  createHost,
  eliminate,
  expect,
  joinPlayers,
  openContext,
  openPlayerPage,
  startButton,
  test,
} from './helpers/index.js';

const connecting = (page: Page) =>
  page.getByRole('button', { name: '連線中…' });
const errorToast = (page: Page) =>
  page.getByText('連線或伺服器出了問題，請稍後再試');

// A TCP relay in front of the real server. `silence()` makes every connection that
// exists right now stop passing bytes in both directions without closing it, which is
// what a phone sees after switching from Wi-Fi to mobile data. New connections work.
async function startRelay() {
  const target = new URL(BASE_URL);
  let generation = 0;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const gen = generation;
    const upstream = net.connect(Number(target.port), target.hostname);
    sockets.add(client).add(upstream);
    const live = () => gen === generation;
    client.on('data', (d) => live() && upstream.write(d));
    upstream.on('data', (d) => live() && client.write(d));
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    silence: () => {
      generation++;
    },
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('QA-09: 建立房間 is disabled with 連線中… until the handshake finishes, then works with no error toast', async ({
  browser,
}) => {
  const context = await openContext(browser, {
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/socket.io/**', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');

  await expect(connecting(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: '建立房間' })).toHaveCount(0);
  release();

  const create = page.getByRole('button', { name: '建立房間' });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/\/host\/.+/);
  await expect(errorToast(page)).toHaveCount(0);
});

test('QA-09: an unreachable server shows 連不上伺服器 and 重試 reconnects once it is back', async ({
  browser,
}) => {
  const context = await openContext(browser, {
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.goto('/');

  await expect(page.getByText('連不上伺服器')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: '建立房間' })).toHaveCount(0);

  await page.unroute('**/socket.io/**');
  await page.getByRole('button', { name: '重試' }).click();
  await expect(page.getByRole('button', { name: '建立房間' })).toBeEnabled();
  await expect(page.getByText('連不上伺服器')).toHaveCount(0);
});

test('QA-09: the player 加入 button is disabled while offline and works again when the network is back', async ({
  browser,
}) => {
  const host = await createHost(browser);
  const page = await openPlayerPage(browser);
  await page.goto(`/room/${host.roomCode}`);
  await page.getByLabel('暱稱').fill('斷網的人');
  await expect(page.getByRole('button', { name: '加入' })).toBeEnabled();

  await page.context().setOffline(true);
  await expect(connecting(page)).toBeDisabled({ timeout: 15_000 });
  await expect(page.getByLabel('暱稱')).toHaveValue('斷網的人');

  await page.context().setOffline(false);
  await page.getByRole('button', { name: '加入' }).click();
  await expect(page.getByText('等待主持人開始')).toBeVisible({
    timeout: 15_000,
  });
  await expect(errorToast(page)).toHaveCount(0);
});

test.describe('QA-01: a silent network switch', () => {
  test.setTimeout(90_000);

  async function startedWithVictim(browser: Browser, relayUrl: string) {
    const host = await createHost(browser);
    await joinPlayers(browser, host.roomCode, 3);
    const context = await openContext(browser, {
      viewport: { width: 390, height: 844 },
      baseURL: relayUrl,
    });
    const victim = await context.newPage();
    await victim.goto(`/room/${host.roomCode}`);
    await victim.getByLabel('暱稱').fill('切網路的人');
    await victim.getByRole('button', { name: '加入' }).click();
    await expect(victim.getByText('等待主持人開始')).toBeVisible();
    await startButton(host.page).click();
    await expect(
      victim.getByRole('button', { name: '查看題目' }),
    ).toBeVisible();
    return { host, victim };
  }

  test('the phone notices within 25 s (the default heartbeat took 45 s) and shows the elimination made meanwhile', async ({
    browser,
  }) => {
    const relay = await startRelay();
    try {
      const { host, victim } = await startedWithVictim(browser, relay.url);
      relay.silence();
      const silencedAt = Date.now();
      await eliminate(host.page, '切網路的人');

      await expect(victim.getByText('連線中…')).toBeVisible({
        timeout: 25_000,
      });
      const noticed = (Date.now() - silencedAt) / 1000;
      await expect(victim.getByText('你被淘汰了')).toBeVisible({
        timeout: 15_000,
      });
      const recovered = (Date.now() - silencedAt) / 1000;
      test.info().annotations.push({
        type: 'silent-switch seconds',
        description: `noticed=${noticed.toFixed(1)} recovered=${recovered.toFixed(1)}`,
      });
    } finally {
      await relay.close();
    }
  });

  test('the browser online event brings the phone back within 5 s, without waiting for the heartbeat', async ({
    browser,
  }) => {
    const relay = await startRelay();
    try {
      const { host, victim } = await startedWithVictim(browser, relay.url);
      relay.silence();
      await eliminate(host.page, '切網路的人');
      const firedAt = Date.now();
      await victim.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(victim.getByText('你被淘汰了')).toBeVisible({
        timeout: 5_000,
      });
      test.info().annotations.push({
        type: 'online-event recovery seconds',
        description: ((Date.now() - firedAt) / 1000).toFixed(1),
      });
    } finally {
      await relay.close();
    }
  });
});
