import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ErrorCode,
  GamePhase,
  PlayerPrivateState,
  PublicRoomState,
} from '../../../shared';
import { AppProviders } from '../../AppProviders';
import { ERROR_MESSAGES } from '../../i18n/errors';
import { MockSocket } from '../../net/mock-socket';
import { readPlayerToken, savePlayerToken } from '../../net/session-storage';
import { routes } from '../../router';

let socket: MockSocket;
let router: ReturnType<typeof createMemoryRouter>;

const players = [
  {
    playerId: 'p1',
    nickname: '小明',
    avatarColor: '#e63946',
    avatarIndex: 0,
    eliminated: false,
    online: true,
  },
  {
    playerId: 'p2',
    nickname: '小華',
    avatarColor: '#457b9d',
    avatarIndex: 1,
    eliminated: false,
    online: true,
  },
];

function room(patch: Partial<PublicRoomState> = {}): PublicRoomState {
  return {
    roomId: 'r1',
    roomCode: 'ABCD',
    phase: 'lobby',
    roundNumber: 0,
    players,
    ...patch,
  };
}

function mine(patch: Partial<PlayerPrivateState> = {}): PlayerPrivateState {
  return {
    playerId: 'p1',
    phase: 'lobby',
    roundNumber: 0,
    secretWord: null,
    eliminated: false,
    ...patch,
  };
}

const playing = (patch: Partial<PlayerPrivateState> = {}) =>
  mine({ phase: 'playing', roundNumber: 1, secretWord: '蘋果', ...patch });

function renderAt(path = '/room/ABCD') {
  router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AppProviders socket={socket}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

// Opens the page as a returning player and answers player:auth.
function openAs(state: PublicRoomState, privateState: PlayerPrivateState) {
  savePlayerToken('ABCD', 'pt');
  const view = renderAt();
  socket.serverConnect();
  socket.answer('player:auth', {
    ok: true,
    data: { state, privateState },
  });
  return view;
}

function fail(code: ErrorCode) {
  return { ok: false as const, code, message: 'x' };
}

beforeEach(() => {
  localStorage.clear();
  socket = new MockSocket();
});

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('join form', () => {
  function openForm() {
    const view = renderAt();
    socket.serverConnect();
    return view;
  }

  function submit(nickname: string) {
    fireEvent.change(screen.getByLabelText('暱稱'), {
      target: { value: nickname },
    });
    fireEvent.click(screen.getByRole('button', { name: '加入' }));
  }

  it('shows the form when this browser has no token', () => {
    openForm();
    expect(screen.getByLabelText('暱稱')).toBeDefined();
    expect(screen.getByRole('button', { name: '加入' })).toBeDefined();
    expect(socket.requestsFor('player:auth')).toHaveLength(0);
  });

  it('sends the room code and nickname', () => {
    openForm();
    submit('小明');
    expect(socket.requestsFor('room:join')[0]?.payload).toStrictEqual({
      roomCode: 'ABCD',
      nickname: '小明',
    });
  });

  it('saves the token, authenticates, and shows the waiting screen on success', async () => {
    openForm();
    submit('小明');
    socket.answer('room:join', {
      ok: true,
      data: { playerId: 'p1', sessionToken: 'fresh' },
    });
    await screen.findByText('連線中…');
    expect(readPlayerToken('ABCD')).toBe('fresh');
    expect(socket.requestsFor('player:auth')[0]?.payload).toStrictEqual({
      sessionToken: 'fresh',
    });
    socket.answer('player:auth', {
      ok: true,
      data: { state: room(), privateState: mine() },
    });
    expect(await screen.findByText('等待主持人開始')).toBeDefined();
    expect(screen.queryByLabelText('暱稱')).toBeNull();
  });

  const cases: [ErrorCode][] = [
    ['NICKNAME_EMPTY'],
    ['NICKNAME_TAKEN'],
    ['ROOM_FULL'],
    ['GAME_IN_PROGRESS'],
    ['ROOM_NOT_FOUND'],
    ['NICKNAME_TOO_LONG'],
  ];
  it.each(cases)('shows the %s message under the field', async (code) => {
    openForm();
    submit('小明');
    socket.answer('room:join', fail(code));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(ERROR_MESSAGES[code]);
    expect(screen.getByLabelText('暱稱').getAttribute('aria-invalid')).toBe(
      'true',
    );
    // The player stays on the form and can try again.
    expect(screen.getByRole('button', { name: '加入' })).toBeDefined();
    expect(readPlayerToken('ABCD')).toBeNull();
  });

  it('clears the message when the player edits the nickname', async () => {
    openForm();
    submit('小明');
    socket.answer('room:join', fail('NICKNAME_TAKEN'));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('暱稱'), {
      target: { value: '小明2' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('blocks a second submit while the first is pending', () => {
    openForm();
    submit('小明');
    const button = screen.getByRole('button', { name: '加入' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(socket.requestsFor('room:join')).toHaveLength(1);
  });
});

describe('returning player', () => {
  it('restores identity from the saved token without showing the form', async () => {
    openAs(room(), mine());
    expect(await screen.findByText('等待主持人開始')).toBeDefined();
    expect(screen.queryByLabelText('暱稱')).toBeNull();
    expect(socket.requestsFor('player:auth')[0]?.payload).toStrictEqual({
      sessionToken: 'pt',
    });
  });

  it('shows 房間已失效 when the room is gone', async () => {
    savePlayerToken('ABCD', 'pt');
    renderAt();
    socket.serverConnect();
    socket.answer('player:auth', fail('ROOM_NOT_FOUND'));
    expect(
      await screen.findByRole('heading', { name: '房間已失效' }),
    ).toBeDefined();
  });
});

describe('waiting', () => {
  it('shows the game name, own avatar, head count and waiting text', () => {
    openAs(room(), mine());
    expect(
      screen.getByRole('heading', { level: 1, name: '誰跟我不一樣？' }),
    ).toBeDefined();
    expect(screen.getByText('小明')).toBeDefined();
    expect(screen.getByText('目前 2 人')).toBeDefined();
    expect(screen.getByText('等待主持人開始')).toBeDefined();
  });

  it('updates the head count when the room changes', () => {
    openAs(room(), mine());
    act(() =>
      socket.serverEmit(
        'room:state',
        room({
          players: [
            ...players,
            { ...players[1]!, playerId: 'p3', nickname: '小美' },
          ],
        }),
      ),
    );
    expect(screen.getByText('目前 3 人')).toBeDefined();
  });

  it('asks before leaving, and leaving clears the token and goes home', async () => {
    openAs(room(), mine());
    fireEvent.click(screen.getByRole('button', { name: '離開房間' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(socket.requestsFor('room:leave')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    expect(socket.requestsFor('room:leave')).toHaveLength(1);
    socket.answer('room:leave', { ok: true, data: null });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(readPlayerToken('ABCD')).toBeNull();
  });

  it('stays when the player cancels the confirmation', () => {
    openAs(room(), mine());
    fireEvent.click(screen.getByRole('button', { name: '離開房間' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(socket.requestsFor('room:leave')).toHaveLength(0);
  });

  it('stays and toasts when the server refuses to let the player leave', async () => {
    openAs(room(), mine());
    fireEvent.click(screen.getByRole('button', { name: '離開房間' }));
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    socket.answer('room:leave', fail('INVALID_PHASE'));
    expect(await screen.findByText(ERROR_MESSAGES.INVALID_PHASE)).toBeDefined();
    expect(router.state.location.pathname).toBe('/room/ABCD');
    expect(readPlayerToken('ABCD')).toBe('pt');
  });
});

describe('secret card', () => {
  const playingRoom = (phase: GamePhase = 'playing') =>
    room({ phase, roundNumber: 1 });

  it('shows the card with name, round and status', () => {
    openAs(playingRoom(), playing());
    expect(screen.getByText('小明')).toBeDefined();
    expect(screen.getByText('第 1 輪')).toBeDefined();
    expect(screen.getByText('存活')).toBeDefined();
  });

  it('hides the word by default and keeps it out of the DOM', () => {
    const { container } = openAs(playingRoom(), playing());
    expect(screen.getByText('點一下查看題目')).toBeDefined();
    expect(container.textContent).not.toContain('蘋果');
    expect(container.innerHTML).not.toContain('蘋果');
    expect(screen.getByRole('button', { name: '查看題目' })).toBeDefined();
  });

  it('reveals and hides the word on repeated taps', () => {
    const { container } = openAs(playingRoom(), playing());
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: '查看題目' }));
      expect(screen.getByText('蘋果')).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: '隱藏題目' }));
      expect(container.textContent).not.toContain('蘋果');
    }
  });

  it('shows the word again without asking the server', () => {
    openAs(playingRoom(), playing());
    const before = socket.sent.length;
    fireEvent.click(screen.getByRole('button', { name: '查看題目' }));
    fireEvent.click(screen.getByRole('button', { name: '隱藏題目' }));
    fireEvent.click(screen.getByRole('button', { name: '查看題目' }));
    expect(screen.getByText('蘋果')).toBeDefined();
    expect(socket.sent.length).toBe(before);
  });

  it.each(['visibilitychange', 'pagehide', 'blur'] as const)(
    'hides the word on %s',
    (kind) => {
      const { container } = openAs(playingRoom(), playing());
      fireEvent.click(screen.getByRole('button', { name: '查看題目' }));
      expect(screen.getByText('蘋果')).toBeDefined();
      act(() => {
        if (kind === 'visibilitychange') {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
          });
          document.dispatchEvent(new Event('visibilitychange'));
        } else {
          window.dispatchEvent(new Event(kind));
        }
      });
      expect(container.textContent).not.toContain('蘋果');
    },
  );

  it('blurs the card while the page is in the background', () => {
    const { container } = openAs(playingRoom(), playing());
    expect(container.querySelector('[data-backgrounded]')).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(container.querySelector('[data-backgrounded]')).not.toBeNull();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(container.querySelector('[data-backgrounded]')).toBeNull();
  });

  it('returns to hidden after the connection drops and comes back', async () => {
    const { container } = openAs(playingRoom(), playing());
    fireEvent.click(screen.getByRole('button', { name: '查看題目' }));
    act(() => socket.serverDisconnect());
    expect(container.textContent).not.toContain('蘋果');
    act(() => socket.serverConnect());
    socket.answer('player:auth', {
      ok: true,
      data: { state: playingRoom(), privateState: playing() },
    });
    expect(await screen.findByText('點一下查看題目')).toBeDefined();
    expect(container.textContent).not.toContain('蘋果');
  });

  it('keeps showing the card during reveal', () => {
    openAs(playingRoom('reveal'), playing({ phase: 'reveal' }));
    expect(screen.getByText('點一下查看題目')).toBeDefined();
  });

  it('shows the elimination mark and hint, and the eliminated player can still read the word', () => {
    const { container } = openAs(
      room({
        phase: 'reveal',
        roundNumber: 1,
        players: [{ ...players[0]!, eliminated: true }, players[1]!],
      }),
      playing({ phase: 'reveal', eliminated: true }),
    );
    expect(screen.getByText('你已淘汰，可以繼續觀戰')).toBeDefined();
    expect(container.querySelector('[data-tag="eliminated"]')).not.toBeNull();
    expect(screen.getByText('已淘汰', { selector: 'p' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '查看題目' }));
    expect(screen.getByText('蘋果')).toBeDefined();
  });

  it('does not show the player which side they are on', () => {
    const { container } = openAs(playingRoom(), playing());
    fireEvent.click(screen.getByRole('button', { name: '查看題目' }));
    expect(container.textContent).not.toMatch(/多數|少數|陣營/);
  });

  it('follows the next round', () => {
    openAs(playingRoom(), playing());
    act(() => {
      socket.serverEmit(
        'room:state',
        room({ phase: 'playing', roundNumber: 2 }),
      );
      socket.serverEmit('game:player-state', playing({ roundNumber: 2 }));
    });
    expect(screen.getByText('第 2 輪')).toBeDefined();
  });
});

describe('finished', () => {
  const result = {
    winner: 'majority' as const,
    majorityWord: '蘋果',
    minorityWord: '水梨',
    players: [
      { playerId: 'p1', role: 'minority' as const },
      { playerId: 'p2', role: 'majority' as const },
    ],
    eliminations: [],
  };

  function openFinished() {
    return openAs(
      room({ phase: 'finished', roundNumber: 2, result }),
      playing({ phase: 'finished', roundNumber: 2, secretWord: '水梨' }),
    );
  }

  it('shows the winner, both words, own side and the big-screen hint', () => {
    openFinished();
    expect(screen.getByText('多數方獲勝')).toBeDefined();
    expect(screen.getByText('蘋果')).toBeDefined();
    expect(screen.getByText('水梨')).toBeDefined();
    expect(screen.getByText('你是少數方')).toBeDefined();
    expect(screen.getByText('請看大螢幕')).toBeDefined();
  });

  it('goes back to waiting after the host resets', () => {
    openFinished();
    act(() => {
      socket.serverEmit('room:state', room());
      socket.serverEmit('game:player-state', mine());
    });
    expect(screen.getByText('等待主持人開始')).toBeDefined();
    expect(screen.queryByText('請看大螢幕')).toBeNull();
  });
});
