import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../AppProviders';
import { UNREACHABLE_AFTER_MS } from '../net/hooks';
import { MockSocket } from '../net/mock-socket';
import { ServerButton } from './ServerButton';

let socket: MockSocket;

function setup(props: { disabled?: boolean; onClick?: () => void } = {}) {
  return render(
    <AppProviders socket={socket}>
      <ServerButton size="lg" {...props}>
        建立房間
      </ServerButton>
    </AppProviders>,
  );
}

const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => {
  socket = new MockSocket();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('ServerButton', () => {
  it('is visible but disabled and says 連線中… until the socket is connected', () => {
    setup();
    expect(button('連線中…').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '建立房間' })).toBeNull();
  });

  it('turns into the normal button, with its normal name, once connected', () => {
    const onClick = vi.fn();
    setup({ onClick });
    act(() => socket.serverConnect());
    const enabled = button('建立房間');
    expect(enabled.disabled).toBe(false);
    fireEvent.click(enabled);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps the caller’s own disabled state when connected', () => {
    setup({ disabled: true });
    act(() => socket.serverConnect());
    expect(button('建立房間').disabled).toBe(true);
  });

  it('goes back to 連線中… when the link drops', () => {
    setup();
    act(() => socket.serverConnect());
    act(() => socket.serverDisconnect());
    expect(button('連線中…').disabled).toBe(true);
  });

  it('shows 連不上伺服器 and a 重試 button after the wait, and retry reconnects', () => {
    setup();
    act(() => vi.advanceTimersByTime(UNREACHABLE_AFTER_MS - 1));
    expect(screen.queryByText('連不上伺服器')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('連不上伺服器')).toBeTruthy();
    const before = socket.connectCalls;
    fireEvent.click(button('重試'));
    expect(socket.connectCalls).toBe(before + 1);
    act(() => socket.serverConnect());
    expect(button('建立房間').disabled).toBe(false);
    expect(screen.queryByText('連不上伺服器')).toBeNull();
  });

  it('does not count the unreachable wait while connected', () => {
    setup();
    act(() => socket.serverConnect());
    act(() => vi.advanceTimersByTime(UNREACHABLE_AFTER_MS * 2));
    expect(screen.queryByText('連不上伺服器')).toBeNull();
  });
});
