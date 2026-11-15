import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer, PublicRoomState, Role } from '../../../shared';
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

const base = (over: Partial<PublicRoomState> = {}): PublicRoomState => ({
  roomId: 'r1',
  roomCode: 'ABC234',
  phase: 'playing',
  roundNumber: 1,
  players: Array.from({ length: 5 }, (_, i) => player(i)),
  ...over,
});

const revealState = (role: Role, round = 1): PublicRoomState =>
  base({
    phase: 'reveal',
    roundNumber: round,
    players: Array.from({ length: 5 }, (_, i) =>
      player(i, { eliminated: i === 2 }),
    ),
    lastElimination: { roundNumber: round, playerId: 'p2', role },
  });

const finishedState = (winner: Role = 'majority'): PublicRoomState => ({
  ...base({
    phase: 'finished',
    roundNumber: 3,
    players: Array.from({ length: 5 }, (_, i) =>
      player(i, { eliminated: i === 1 || i === 4 }),
    ),
    lastElimination: { roundNumber: 3, playerId: 'p4', role: 'minority' },
  }),
  result: {
    winner,
    majorityWord: '蘋果',
    minorityWord: '水梨',
    players: [
      { playerId: 'p0', role: 'majority' },
      { playerId: 'p1', role: 'majority' },
      { playerId: 'p2', role: 'majority' },
      { playerId: 'p3', role: 'majority' },
      { playerId: 'p4', role: 'minority' },
    ],
    eliminations: [
      { roundNumber: 1, playerId: 'p1', role: 'majority' },
      { roundNumber: 2, playerId: null },
      { roundNumber: 3, playerId: 'p4', role: 'minority' },
    ],
  },
});

async function openHost(initial: PublicRoomState) {
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

beforeEach(() => {
  localStorage.clear();
  socket = new MockSocket();
});
afterEach(() => vi.unstubAllGlobals());

describe('HostReveal screen', () => {
  it('shows the red wrong-catch copy when a majority player is out', async () => {
    await openHost(revealState('majority'));
    const title = screen.getByRole('heading', {
      level: 1,
      name: '淘汰的是平民！',
    });
    expect(screen.getByText('糟糕！你們抓錯人了！')).toBeDefined();
    expect(title.closest('.host-reveal')?.getAttribute('data-outcome')).toBe(
      'wrong',
    );
  });

  it('shows the green success copy when a minority player is out', async () => {
    await openHost(revealState('minority'));
    const title = screen.getByRole('heading', {
      level: 1,
      name: '成功抓到臥底！',
    });
    expect(screen.getByText('漂亮！成功找出一位臥底！')).toBeDefined();
    expect(title.closest('.host-reveal')?.getAttribute('data-outcome')).toBe(
      'caught',
    );
  });

  it('shows the eliminated avatar and nickname', async () => {
    await openHost(revealState('majority'));
    expect(screen.getByRole('img', { name: /玩家2/ })).toBeDefined();
    expect(screen.getByText('玩家2')).toBeDefined();
  });

  it('shows no word, no role of the living and no remaining counts', async () => {
    const { container } = await openHost(revealState('majority'));
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/詞|多數|少數|剩|存活/);
    expect(text).not.toMatch(/\d+\s*[/／]\s*\d+/);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('sends game:next-round only once on a double click', async () => {
    await openHost(revealState('majority'));
    const next = screen.getByRole('button', { name: '下一輪' });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(socket.requestsFor('game:next-round')).toHaveLength(1);
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets the host try again when next-round is rejected', async () => {
    await openHost(revealState('majority'));
    fireEvent.click(screen.getByRole('button', { name: '下一輪' }));
    await act(async () =>
      socket.answer('game:next-round', {
        ok: false,
        code: 'INVALID_PHASE',
        message: 'nope',
      }),
    );
    const next = screen.getByRole('button', {
      name: '下一輪',
    }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(socket.requestsFor('game:next-round')).toHaveLength(2);
  });

  it('returns to the playing screen on the next round', async () => {
    await openHost(revealState('majority'));
    await pushState(base({ roundNumber: 2 }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Round 2' }),
    ).toBeDefined();
  });
});

describe('HostFinished screen', () => {
  it('plays the reveal first when the last elimination ends the game', async () => {
    await openHost(base({ roundNumber: 3 }));
    await pushState(finishedState());
    expect(
      screen.getByRole('heading', { level: 1, name: '成功抓到臥底！' }),
    ).toBeDefined();
    expect(screen.queryByText('蘋果')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '看結果' }));
    expect(screen.getByText('蘋果')).toBeDefined();
  });

  it('uses the wrong-catch copy when the final elimination was a majority player', async () => {
    await openHost(base({ roundNumber: 3 }));
    const state = finishedState('minority');
    state.lastElimination = {
      roundNumber: 3,
      playerId: 'p4',
      role: 'majority',
    };
    await pushState(state);
    expect(
      screen.getByRole('heading', { level: 1, name: '淘汰的是平民！' }),
    ).toBeDefined();
  });

  it('goes straight to the results when the page opens on a finished game', async () => {
    await openHost(finishedState());
    expect(screen.getByText('蘋果')).toBeDefined();
    expect(screen.queryByRole('button', { name: '看結果' })).toBeNull();
  });

  it('shows the winner, both words, every role and the elimination log', async () => {
    const { container } = await openHost(finishedState());
    expect(
      screen.getByRole('heading', { level: 1, name: '平民獲勝！' }),
    ).toBeDefined();
    expect(screen.getByText('蘋果')).toBeDefined();
    expect(screen.getByText('水梨')).toBeDefined();
    const roster = container.querySelector('.host-finished__roster');
    expect(roster?.querySelectorAll('li')).toHaveLength(5);
    expect(roster?.textContent).toMatch(/玩家4[\s\S]*臥底/);
    expect(screen.getByText('第 1 輪：玩家1（平民）')).toBeDefined();
    expect(screen.getByText('第 2 輪：無人淘汰')).toBeDefined();
    expect(screen.getByText('第 3 輪：玩家4（臥底）')).toBeDefined();
  });

  it('names the minority as the winner when they win', async () => {
    await openHost(finishedState('minority'));
    expect(
      screen.getByRole('heading', { level: 1, name: '臥底獲勝！' }),
    ).toBeDefined();
  });

  it('sends game:reset only once and follows the room back to the lobby', async () => {
    await openHost(finishedState());
    const again = screen.getByRole('button', { name: '再玩一場' });
    fireEvent.click(again);
    fireEvent.click(again);
    expect(socket.requestsFor('game:reset')).toHaveLength(1);
    await pushState(base({ phase: 'lobby', roundNumber: 0 }));
    expect(screen.queryByText('蘋果')).toBeNull();
  });

  it('shows the reveal again for a later game that also ends by elimination', async () => {
    await openHost(base({ roundNumber: 3 }));
    await pushState(finishedState());
    fireEvent.click(screen.getByRole('button', { name: '看結果' }));
    await pushState(base({ phase: 'lobby', roundNumber: 0 }));
    await pushState(base({ roundNumber: 1 }));
    await pushState(finishedState());
    expect(screen.getByRole('button', { name: '看結果' })).toBeDefined();
  });
});
