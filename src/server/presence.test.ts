import { describe, expect, it } from 'vitest';
import { PresenceTracker } from './presence.js';

function tracker() {
  let t = 100;
  return {
    presence: new PresenceTracker(() => t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('PresenceTracker', () => {
  it('stays online when the old socket disconnects after the new one connected', () => {
    const { presence } = tracker();
    presence.connect('p1', 'old');
    presence.connect('p1', 'new');

    presence.disconnect('p1', 'old');

    expect(presence.isOnline('p1')).toBe(true);
    expect(presence.get('p1')?.socketIds).toStrictEqual(new Set(['new']));
  });

  it('goes offline once every socket has disconnected', () => {
    const { presence } = tracker();
    presence.connect('p1', 'a');
    presence.connect('p1', 'b');

    presence.disconnect('p1', 'a');
    expect(presence.isOnline('p1')).toBe(true);
    presence.disconnect('p1', 'b');

    expect(presence.isOnline('p1')).toBe(false);
    expect(presence.get('p1')?.online).toBe(false);
  });

  it('tolerates the same socket disconnecting twice', () => {
    const { presence } = tracker();
    presence.connect('p1', 'a');
    presence.connect('p1', 'b');

    presence.disconnect('p1', 'a');
    expect(() => presence.disconnect('p1', 'a')).not.toThrow();

    expect(presence.isOnline('p1')).toBe(true);
  });

  it('ignores a disconnect for a key it never saw', () => {
    const { presence } = tracker();
    expect(() => presence.disconnect('ghost', 'a')).not.toThrow();
    expect(presence.isOnline('ghost')).toBe(false);
    expect(presence.get('ghost')).toBeUndefined();
  });

  it('does not duplicate a socket that connects twice', () => {
    const { presence } = tracker();
    presence.connect('p1', 'a');
    presence.connect('p1', 'a');
    presence.disconnect('p1', 'a');
    expect(presence.isOnline('p1')).toBe(false);
  });

  it('records when the key was last seen', () => {
    const { presence, advance } = tracker();
    presence.connect('p1', 'a');
    advance(50);
    presence.disconnect('p1', 'a');
    expect(presence.get('p1')?.lastSeenAt).toBe(150);
  });

  it('keeps keys independent and can forget one', () => {
    const { presence } = tracker();
    presence.connect('p1', 'a');
    presence.connect('p2', 'a');
    presence.disconnect('p1', 'a');
    expect(presence.isOnline('p2')).toBe(true);
    presence.forget('p2');
    expect(presence.get('p2')).toBeUndefined();
  });
});
