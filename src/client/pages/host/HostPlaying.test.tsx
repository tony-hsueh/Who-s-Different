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
  over: Partial<PublicRoomState> = {},
  count = 6,
): PublicRoomState => ({
  roomId: 'r1',
  roomCode: 'ABC234',
  phase: 'playing',
  roundNumber: 1,
  players: Array.from({ length: count }, (_, i) => player(i)),
  ...over,
});

async function openPlaying(initial: PublicRoomState) {
  saveHostToken('r1', 'secret-host-token');
  const router = createMemoryRouter(routes, { initialEntries: ['/host/r1'] });
  render(
    <AppProviders socket={socket}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  socket.serverConnect();
  socket.answer('host:auth', { ok: true, data: { state: initial } });
  await screen.findByRole('heading', { level: 1 });
}

const pushState = (next: PublicRoomState) =>
  act(() => socket.serverEmit('room:state', next));

const avatarButton = (n: number) =>
  screen.getAllByRole('listitem')[n]!.querySelector('button')!;

const dialog = () => screen.queryByRole('dialog');
const confirmButton = () =>
  screen.getByRole('button', { name: '確認淘汰' }) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  socket = new MockSocket();
});
afterEach(() => vi.unstubAllGlobals());

describe('HostPlaying screen', () => {
  it('shows the round in the heading, the hint and every player', async () => {
    await openPlaying(state({ roundNumber: 3 }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Round 3' }),
    ).toBeDefined();
    expect(
      screen.getByText('請大家輪流描述自己的詞語，描述完後現場投票'),
    ).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByText('玩家5')).toBeDefined();
  });

  it('marks eliminated players and keeps them out of reach', async () => {
    await openPlaying(
      state({ players: [player(0), player(1, { eliminated: true })] }),
    );
    expect(screen.getByText('已淘汰')).toBeDefined();
    const eliminated = avatarButton(1);
    expect(eliminated.disabled).toBe(true);
    eliminated.focus();
    expect(document.activeElement).not.toBe(eliminated);
    fireEvent.click(eliminated);
    expect(dialog()).toBeNull();
    expect(avatarButton(0).disabled).toBe(false);
  });

  it('keeps offline living players selectable and shows a quiet offline tag', async () => {
    await openPlaying(
      state({ players: [player(0), player(1, { online: false })] }),
    );
    expect(screen.getByText('離線')).toBeDefined();
    expect(avatarButton(1).disabled).toBe(false);
  });

  it('does not eliminate on click, it asks first without any role info', async () => {
    await openPlaying(state());
    fireEvent.click(avatarButton(2));
    expect(
      screen.getByRole('heading', { name: '確定要淘汰玩家 玩家2 嗎？' }),
    ).toBeDefined();
    expect(socket.requestsFor('game:eliminate')).toHaveLength(0);
    expect(dialog()?.textContent).not.toMatch(/陣營|臥底|平民|詞語|role/);
  });

  it('leaves everything unchanged after cancel', async () => {
    await openPlaying(state());
    const before = document.body.innerHTML;
    fireEvent.click(avatarButton(2));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(dialog()).toBeNull();
    expect(socket.requestsFor('game:eliminate')).toHaveLength(0);
    expect(document.body.innerHTML).toBe(before);
  });

  it('cancels with Escape', async () => {
    await openPlaying(state());
    fireEvent.click(avatarButton(2));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).toBeNull();
    expect(socket.requestsFor('game:eliminate')).toHaveLength(0);
  });

  it('confirms with Enter, even while focus sits on the cancel button', async () => {
    await openPlaying(state({ roundNumber: 2 }));
    fireEvent.click(avatarButton(2));
    fireEvent.keyDown(screen.getByRole('button', { name: '取消' }), {
      key: 'Enter',
    });
    expect(socket.requestsFor('game:eliminate')).toHaveLength(1);
  });

  it('ignores a held-down Enter so the opening keypress cannot confirm', async () => {
    await openPlaying(state());
    fireEvent.click(avatarButton(2));
    fireEvent.keyDown(document, { key: 'Enter', repeat: true });
    expect(socket.requestsFor('game:eliminate')).toHaveLength(0);
  });

  it('sends game:eliminate with the round and player, and only once on a double click', async () => {
    await openPlaying(state({ roundNumber: 2 }));
    fireEvent.click(avatarButton(3));
    const confirm = confirmButton();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.keyDown(document, { key: 'Enter' });
    const sent = socket.requestsFor('game:eliminate');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toStrictEqual({ roundNumber: 2, playerId: 'p3' });
    expect(confirmButton().disabled).toBe(true);
  });

  it('closes the dialog when the server accepts', async () => {
    await openPlaying(state());
    fireEvent.click(avatarButton(3));
    fireEvent.click(confirmButton());
    await act(async () =>
      socket.answer('game:eliminate', { ok: true, data: null }),
    );
    expect(dialog()).toBeNull();
  });

  it('closes the dialog and toasts when the server rejects, keeping the room state', async () => {
    await openPlaying(state({ roundNumber: 2 }));
    fireEvent.click(avatarButton(3));
    fireEvent.click(confirmButton());
    await act(async () =>
      socket.answer('game:eliminate', {
        ok: false,
        code: 'ROUND_MISMATCH',
        message: 'x',
      }),
    );
    expect(dialog()).toBeNull();
    expect(await screen.findByText('畫面不是最新的，請稍後再試')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Round 2' })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });

  it('can eliminate again after a rejection', async () => {
    await openPlaying(state());
    fireEvent.click(avatarButton(3));
    fireEvent.click(confirmButton());
    await act(async () =>
      socket.answer('game:eliminate', {
        ok: false,
        code: 'INVALID_PHASE',
        message: 'x',
      }),
    );
    fireEvent.click(avatarButton(4));
    fireEvent.click(confirmButton());
    expect(socket.requestsFor('game:eliminate')).toHaveLength(2);
  });

  it('drops the dialog when the round moves on underneath it', async () => {
    await openPlaying(state());
    fireEvent.click(avatarButton(3));
    pushState(state({ roundNumber: 2 }));
    expect(dialog()).toBeNull();
  });

  it('drops the dialog when the chosen player is already out', async () => {
    await openPlaying(state());
    fireEvent.click(avatarButton(3));
    pushState(
      state({
        players: Array.from({ length: 6 }, (_, i) =>
          player(i, { eliminated: i === 3 }),
        ),
      }),
    );
    expect(dialog()).toBeNull();
  });
});

describe('skip round', () => {
  const skipButton = () => screen.getByRole('button', { name: '本輪無人淘汰' });

  it('asks before skipping and sends nothing until confirmed', async () => {
    await openPlaying(state());
    fireEvent.click(skipButton());
    expect(
      screen.getByRole('heading', {
        name: '本輪不淘汰任何人，直接進入下一輪？',
      }),
    ).toBeDefined();
    expect(socket.requestsFor('game:skip-round')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(dialog()).toBeNull();
    expect(socket.requestsFor('game:skip-round')).toHaveLength(0);
  });

  it('sends game:skip-round once with the round, via button or Enter', async () => {
    await openPlaying(state({ roundNumber: 4 }));
    fireEvent.click(skipButton());
    const confirm = screen.getByRole('button', { name: '確認' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.keyDown(document, { key: 'Enter' });
    const sent = socket.requestsFor('game:skip-round');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toStrictEqual({ roundNumber: 4 });
  });

  it('cancels with Escape', async () => {
    await openPlaying(state());
    fireEvent.click(skipButton());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).toBeNull();
    expect(socket.requestsFor('game:skip-round')).toHaveLength(0);
  });

  it('shows the next round once the server broadcasts it', async () => {
    await openPlaying(state({ roundNumber: 1 }));
    fireEvent.click(skipButton());
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await act(async () =>
      socket.answer('game:skip-round', { ok: true, data: null }),
    );
    pushState(state({ roundNumber: 2 }));
    expect(screen.getByRole('heading', { name: 'Round 2' })).toBeDefined();
    expect(dialog()).toBeNull();
  });

  it('toasts and closes when the round was already over', async () => {
    await openPlaying(state());
    fireEvent.click(skipButton());
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await act(async () =>
      socket.answer('game:skip-round', {
        ok: false,
        code: 'ROUND_MISMATCH',
        message: 'x',
      }),
    );
    expect(dialog()).toBeNull();
    expect(await screen.findByText('畫面不是最新的，請稍後再試')).toBeDefined();
  });
});
