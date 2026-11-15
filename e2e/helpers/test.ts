import {
  test as base,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from '@playwright/test';
import { BASE_URL } from './env.js';
import { fetchRoomEvents } from './events.js';

export { expect } from '@playwright/test';

interface Session {
  contexts: BrowserContext[];
  roomIds: string[];
}

// Tests inside one worker run one at a time, so a module-level slot is safe.
let current: Session | undefined;

function session(): Session {
  if (!current) {
    throw new Error('import `test` from e2e/helpers so the session exists');
  }
  return current;
}

// Contexts made with browser.newContext() ignore the config's `use` block, so the
// baseURL is applied here. Playwright still traces them when the config asks for a trace.
export async function openContext(
  browser: Browser,
  options: BrowserContextOptions,
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL, ...options });
  session().contexts.push(context);
  return context;
}

export function trackRoom(roomId: string): void {
  session().roomIds.push(roomId);
}

export const test = base.extend<{ session: void }>({
  session: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      const s: Session = { contexts: [], roomIds: [] };
      current = s;
      await use();
      current = undefined;

      // A failed test keeps a screenshot of every open page and the event log of
      // every room it created, so the report shows what each phone and the server saw.
      if (testInfo.status !== testInfo.expectedStatus) {
        for (const [i, context] of s.contexts.entries()) {
          for (const [j, page] of context.pages().entries()) {
            await page
              .screenshot()
              .then((body) =>
                testInfo.attach(`context-${i}-page-${j}.png`, {
                  body,
                  contentType: 'image/png',
                }),
              )
              .catch(() => undefined);
          }
        }
        for (const roomId of s.roomIds) {
          await fetchRoomEvents(roomId)
            .then((events) =>
              testInfo.attach(`event-log-${roomId}.json`, {
                body: JSON.stringify(events, null, 2),
                contentType: 'application/json',
              }),
            )
            .catch(() => undefined);
        }
      }
      for (const context of s.contexts) {
        await context.close().catch(() => undefined);
      }
    },
    { auto: true },
  ],
});
