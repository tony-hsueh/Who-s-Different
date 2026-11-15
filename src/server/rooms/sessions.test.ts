import { describe, expect, it } from 'vitest';
import { SESSION_TTL_MS, SessionRegistry } from './sessions.js';

function setup() {
  let t = 1_000_000;
  const registry = new SessionRegistry({ now: () => t });
  return {
    registry,
    advance: (ms: number) => {
      t += ms;
    },
    now: () => t,
  };
}

describe('SessionRegistry', () => {
  it('has a 12 hour lifetime', () => {
    expect(SESSION_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });

  it('verifies a registered player token', () => {
    const { registry } = setup();
    registry.registerPlayer('tok-p', 'room-1', 'player-1');
    expect(registry.verifyPlayer('tok-p')).toEqual({
      ok: true,
      roomId: 'room-1',
      playerId: 'player-1',
    });
  });

  it('verifies a registered host token', () => {
    const { registry } = setup();
    registry.registerHost('tok-h', 'room-1');
    expect(registry.verifyHost('tok-h')).toEqual({
      ok: true,
      roomId: 'room-1',
    });
  });

  it('rejects a wrong token with INVALID_TOKEN', () => {
    const { registry } = setup();
    registry.registerPlayer('tok-p', 'room-1', 'player-1');
    registry.registerHost('tok-h', 'room-1');
    for (const bad of ['nope', '', 'tok-p ', 'TOK-P']) {
      expect(registry.verifyPlayer(bad)).toMatchObject({
        ok: false,
        code: 'INVALID_TOKEN',
      });
      expect(registry.verifyHost(bad)).toMatchObject({
        ok: false,
        code: 'INVALID_TOKEN',
      });
    }
  });

  it('does not accept a host token as a player token or the reverse', () => {
    const { registry } = setup();
    registry.registerPlayer('tok-p', 'room-1', 'player-1');
    registry.registerHost('tok-h', 'room-1');
    expect(registry.verifyPlayer('tok-h')).toMatchObject({ ok: false });
    expect(registry.verifyHost('tok-p')).toMatchObject({ ok: false });
  });

  it('rejects an expired token with TOKEN_EXPIRED', () => {
    const { registry, advance } = setup();
    registry.registerPlayer('tok-p', 'room-1', 'player-1');
    registry.registerHost('tok-h', 'room-1');
    advance(SESSION_TTL_MS - 1);
    expect(registry.verifyPlayer('tok-p')).toMatchObject({ ok: true });
    advance(1);
    expect(registry.verifyPlayer('tok-p')).toMatchObject({
      ok: false,
      code: 'TOKEN_EXPIRED',
    });
    expect(registry.verifyHost('tok-h')).toMatchObject({
      ok: false,
      code: 'TOKEN_EXPIRED',
    });
  });

  it('sweepExpired drops expired tokens and keeps live ones', () => {
    const { registry, advance, now } = setup();
    registry.registerPlayer('old', 'room-1', 'player-1');
    advance(SESSION_TTL_MS / 2);
    registry.registerPlayer('young', 'room-1', 'player-2');
    registry.registerHost('old-host', 'room-1');
    advance(SESSION_TTL_MS / 2);

    expect(registry.sweepExpired(now())).toBe(1);
    expect(registry.verifyPlayer('old')).toMatchObject({
      ok: false,
      code: 'INVALID_TOKEN',
    });
    expect(registry.verifyPlayer('young')).toMatchObject({ ok: true });
  });

  it('sweepExpired also drops expired host tokens', () => {
    const { registry, advance, now } = setup();
    registry.registerHost('tok-h', 'room-1');
    advance(SESSION_TTL_MS);
    expect(registry.sweepExpired(now())).toBe(1);
    expect(registry.verifyHost('tok-h')).toMatchObject({
      ok: false,
      code: 'INVALID_TOKEN',
    });
  });

  it('removePlayer invalidates only that player', () => {
    const { registry } = setup();
    registry.registerPlayer('a', 'room-1', 'player-1');
    registry.registerPlayer('b', 'room-1', 'player-2');
    registry.removePlayer('player-1');
    expect(registry.verifyPlayer('a')).toMatchObject({ ok: false });
    expect(registry.verifyPlayer('b')).toMatchObject({ ok: true });
  });

  it('removeRoom invalidates every token of that room', () => {
    const { registry } = setup();
    registry.registerPlayer('a', 'room-1', 'player-1');
    registry.registerHost('h1', 'room-1');
    registry.registerPlayer('b', 'room-2', 'player-2');
    registry.removeRoom('room-1');
    expect(registry.verifyPlayer('a')).toMatchObject({ ok: false });
    expect(registry.verifyHost('h1')).toMatchObject({ ok: false });
    expect(registry.verifyPlayer('b')).toMatchObject({ ok: true });
  });
});
