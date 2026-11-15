import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '../../AppProviders';
import { MockSocket } from '../../net/mock-socket';
import { routes } from '../../router';

let socket: MockSocket;

beforeEach(() => {
  localStorage.clear();
  socket = new MockSocket();
  const router = createMemoryRouter(routes, {
    initialEntries: ['/room/ABCD'],
  });
  render(
    <AppProviders socket={socket}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  act(() => socket.serverConnect());
});

describe('JoinForm when the link drops (QA-09)', () => {
  it('keeps 加入 enabled while connected', () => {
    const button = screen.getByRole('button', {
      name: '加入',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('disables the button with 連線中… until the socket is back, keeping the typed nickname', () => {
    const input = screen.getByLabelText('暱稱') as HTMLInputElement;
    act(() => socket.serverDisconnect());
    const button = screen.getByRole('button', {
      name: '連線中…',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // A disabled submit button is what stops Enter from submitting the form.
    expect(button.type).toBe('submit');
    act(() => socket.serverConnect());
    expect(
      (screen.getByRole('button', { name: '加入' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.getByLabelText('暱稱')).toBe(input);
  });
});
