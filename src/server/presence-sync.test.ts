import { describe, expect, it } from 'vitest';
import type { AppServer } from './broadcast.js';
import type { LogEvent } from './log/noop-logger.js';
import { createPresence } from './presence-sync.js';
import { RoomStore } from './rooms/room-store.js';
import { questionBank } from './questions/bank.js';

function setup() {
  const events: LogEvent[] = [];
  const io = {
    to: () => ({ emit: () => true }),
  } as unknown as AppServer;
  const store = new RoomStore({ bank: questionBank });
  const presence = createPresence({
    io,
    store,
    logger: { logEvent: (e) => void events.push(e) },
    now: Date.now,
    debounceMs: 5,
  });
  return { presence, events };
}

const host = { kind: 'host', roomId: 'r1' } as const;
const socket = (id: string) => ({ id, data: { binding: host } });

describe('createPresence', () => {
  it('logs a host reconnect only after a logged disconnect', async () => {
    const { presence, events } = setup();
    const first = socket('a');
    presence.connect(first, host);
    presence.disconnect(first);
    await new Promise((resolve) => setTimeout(resolve, 30));
    presence.connect(socket('b'), host);

    expect(events.map((e) => e.type)).toStrictEqual([
      'HOST_DISCONNECTED',
      'HOST_RECONNECTED',
    ]);
  });

  it('treats a host as new again once its room was forgotten', async () => {
    const { presence, events } = setup();
    const first = socket('a');
    presence.connect(first, host);
    presence.disconnect(first);
    await new Promise((resolve) => setTimeout(resolve, 30));

    presence.forgetRoom('r1');
    presence.connect(socket('b'), host);

    expect(events.map((e) => e.type)).toStrictEqual(['HOST_DISCONNECTED']);
  });
});
