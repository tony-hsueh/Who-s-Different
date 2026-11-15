import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from './AppProviders';
import { MockSocket } from './net/mock-socket';
import {
  readHostToken,
  saveHostToken,
  savePlayerToken,
} from './net/session-storage';
import { routes } from './router';

let socket: MockSocket;

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <AppProviders socket={socket}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router };
}

beforeEach(() => {
  localStorage.clear();
  socket = new MockSocket();
});
afterEach(() => vi.restoreAllMocks());

const roomState = {
  roomId: 'r1',
  roomCode: 'ABCD',
  phase: 'lobby' as const,
  roundNumber: 0,
  players: [],
};

describe('routes', () => {
  it('/ shows the home page with a create-room button', () => {
    renderAt('/');
    expect(
      screen.getByRole('heading', { level: 1, name: '誰跟我不一樣？' }),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: '建立房間' })).toBeDefined();
  });

  it('creating a room saves the host token and opens the host page', async () => {
    const { router } = renderAt('/');
    socket.serverConnect();
    fireEvent.click(screen.getByRole('button', { name: '建立房間' }));
    socket.answer('room:create', {
      ok: true,
      data: { roomId: 'r9', roomCode: 'WXYZ', hostToken: 'ht' },
    });
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/host/r9'),
    );
    expect(readHostToken('r9')).toBe('ht');
  });

  it('/host/:roomId shows the host page in projector mode', async () => {
    saveHostToken('r1', 'ht');
    const { container } = renderAt('/host/r1');
    socket.serverConnect();
    socket.answer('host:auth', { ok: true, data: { state: roomState } });
    expect(
      await screen.findByRole('heading', { name: '誰跟我不一樣？' }),
    ).toBeDefined();
    expect(container.querySelector('[data-mode="projector"]')).not.toBeNull();
  });

  it('/room/:roomCode shows the player page in phone mode', () => {
    savePlayerToken('ABCD', 'pt');
    const { container } = renderAt('/room/ABCD');
    expect(screen.getByRole('heading', { name: /玩家/ })).toBeDefined();
    expect(container.querySelector('[data-mode="phone"]')).not.toBeNull();
  });

  it('shows 404 for an unknown path', () => {
    renderAt('/nope/nothing');
    expect(
      screen.getByRole('heading', { level: 1, name: '找不到這個頁面' }),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: '回首頁' })).toBeDefined();
  });
});

describe('invalid room', () => {
  it('shows 房間已失效 with a way home when the room does not exist', async () => {
    saveHostToken('gone', 'ht');
    const { router } = renderAt('/host/gone');
    socket.serverConnect();
    socket.answer('host:auth', {
      ok: false,
      code: 'ROOM_NOT_FOUND',
      message: 'x',
    });
    expect(
      await screen.findByRole('heading', { name: '房間已失效' }),
    ).toBeDefined();
    expect(readHostToken('gone')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '回首頁' }));
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows 房間已失效 when the room is closed while playing', async () => {
    savePlayerToken('ABCD', 'pt');
    renderAt('/room/ABCD');
    socket.serverConnect();
    socket.answer('player:auth', {
      ok: true,
      data: {
        state: roomState,
        privateState: {
          playerId: 'p1',
          phase: 'lobby',
          roundNumber: 0,
          secretWord: null,
          eliminated: false,
        },
      },
    });
    socket.serverEmit('room:closed', { roomId: 'r1' });
    expect(
      await screen.findByRole('heading', { name: '房間已失效' }),
    ).toBeDefined();
  });
});

describe('with localStorage disabled', () => {
  it('still renders every page', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const home = renderAt('/');
    expect(screen.getByRole('button', { name: '建立房間' })).toBeDefined();
    home.unmount();
    const player = renderAt('/room/ABCD');
    socket.serverConnect();
    expect(screen.getByRole('heading', { name: /玩家/ })).toBeDefined();
    player.unmount();
  });
});

describe('reconnect', () => {
  it('authenticates again after the connection drops and returns', () => {
    saveHostToken('r1', 'ht');
    renderAt('/host/r1');
    socket.serverConnect();
    socket.answer('host:auth', { ok: true, data: { state: roomState } });
    socket.serverDisconnect();
    socket.serverConnect();
    expect(socket.requestsFor('host:auth')).toHaveLength(2);
  });
});
