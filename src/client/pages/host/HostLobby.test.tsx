import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer, PublicRoomState } from '../../../shared';
import { AppProviders } from '../../AppProviders';
import { MockSocket } from '../../net/mock-socket';
import { saveHostToken } from '../../net/session-storage';
import { routes } from '../../router';

let socket: MockSocket;

const player = (n: number, over: Partial<PublicPlayer> = {}): PublicPlayer => ({
  playerId: `p${n}`,
  nickname: `玩家${n}`,
  avatarColor: '#ff5a5f',
  avatarIndex: n,
  eliminated: false,
  online: true,
  ...over,
});

const state = (
  count: number,
  over: Partial<PublicRoomState> = {},
): PublicRoomState => ({
  roomId: 'r1',
  roomCode: 'ABC234',
  phase: 'lobby',
  roundNumber: 0,
  players: Array.from({ length: count }, (_, i) => player(i)),
  ...over,
});

function stubConfig(publicBaseUrl: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json({ publicBaseUrl }))),
  );
}

async function openLobby(initial: PublicRoomState) {
  saveHostToken('r1', 'secret-host-token');
  const router = createMemoryRouter(routes, { initialEntries: ['/host/r1'] });
  const view = render(
    <AppProviders socket={socket}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  socket.serverConnect();
  socket.answer('host:auth', { ok: true, data: { state: initial } });
  await screen.findByRole('heading', { level: 1 });
  return view;
}

const pushState = (next: PublicRoomState) =>
  act(() => socket.serverEmit('room:state', next));

const startButton = () =>
  screen.getByRole('button', { name: '開始遊戲' }) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  socket = new MockSocket();
  stubConfig('http://192.168.1.5:3000');
});
afterEach(() => vi.unstubAllGlobals());

describe('HostLobby', () => {
  it('shows the game name, the 6-char code and the join link', async () => {
    await openLobby(state(0));
    expect(
      screen.getByRole('heading', { level: 1, name: '誰跟我不一樣？' }),
    ).toBeDefined();
    expect(screen.getByText('ABC234')).toBeDefined();
    expect(
      await screen.findByText('http://192.168.1.5:3000/room/ABC234'),
    ).toBeDefined();
  });

  it('encodes the configured base url and the room code, and no token', async () => {
    await openLobby(state(0));
    const qr = await screen.findByRole('img', { name: /QR/ });
    const encoded = qr.getAttribute('data-value') ?? '';
    expect(encoded).toBe('http://192.168.1.5:3000/room/ABC234');
    expect(encoded).not.toContain('secret-host-token');
    expect(encoded).not.toContain('r1');
    expect(new URL(encoded).search).toBe('');
  });

  it('falls back to this page origin when the server has no public url', async () => {
    stubConfig(null);
    await openLobby(state(0));
    const qr = await screen.findByRole('img', { name: /QR/ });
    expect(qr.getAttribute('data-value')).toBe(
      `${window.location.origin}/room/ABC234`,
    );
  });

  it('falls back to this page origin when the config request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await openLobby(state(0));
    const qr = await screen.findByRole('img', { name: /QR/ });
    expect(qr.getAttribute('data-value')).toBe(
      `${window.location.origin}/room/ABC234`,
    );
  });

  it('lists players live with the count and the minimum hint', async () => {
    await openLobby(state(2));
    expect(screen.getByText('2 / 15')).toBeDefined();
    expect(screen.getByText(/至少 4 人才能開始/)).toBeDefined();
    pushState(state(6));
    expect(await screen.findByText('玩家5')).toBeDefined();
    expect(screen.getByText('6 / 15')).toBeDefined();
  });

  it('says the laptop is not a player', async () => {
    await openLobby(state(0));
    expect(
      screen.getByText(/主持人若要一起玩，請用手機掃碼加入/),
    ).toBeDefined();
  });

  it('marks offline players in the lobby', async () => {
    await openLobby(
      state(2, { players: [player(0), player(1, { online: false })] }),
    );
    expect(screen.getByText('離線')).toBeDefined();
  });

  it('keeps start disabled with 3 players and enables it at 4', async () => {
    await openLobby(state(3));
    expect(startButton().disabled).toBe(true);
    pushState(state(4));
    await vi.waitFor(() => expect(startButton().disabled).toBe(false));
  });

  it('keeps start enabled at 15 players', async () => {
    await openLobby(state(15));
    expect(startButton().disabled).toBe(false);
  });

  it('sends game:start once and ignores extra clicks while it is pending', async () => {
    await openLobby(state(4));
    const start = startButton();
    fireEvent.click(start);
    fireEvent.click(start);
    fireEvent.click(start);
    expect(socket.requestsFor('game:start')).toHaveLength(1);
    expect(start.disabled).toBe(true);
  });

  it('enables start again when the server rejects it', async () => {
    await openLobby(state(4));
    fireEvent.click(startButton());
    await act(async () =>
      socket.answer('game:start', {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        message: 'x',
      }),
    );
    await vi.waitFor(() => expect(startButton().disabled).toBe(false));
  });

  it('shows a reconnecting notice while the socket is down', async () => {
    await openLobby(state(4));
    act(() => socket.serverDisconnect());
    expect(await screen.findByText(/連線中斷/)).toBeDefined();
  });

  it('moves to the playing screen when the game starts', async () => {
    await openLobby(state(4));
    pushState(state(4, { phase: 'playing', roundNumber: 1 }));
    expect(
      await screen.findByRole('heading', { name: 'Round 1' }),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: '開始遊戲' })).toBeNull();
  });

  it('returns to the same lobby with players kept after a reset', async () => {
    await openLobby(state(4, { phase: 'playing', roundNumber: 1 }));
    pushState(state(4));
    expect(
      await screen.findByRole('button', { name: '開始遊戲' }),
    ).toBeDefined();
    expect(screen.getByText('玩家3')).toBeDefined();
  });
});
