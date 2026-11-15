import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '../AppProviders';
import { MockSocket } from '../net/mock-socket';
import { routes } from '../router';

let socket: MockSocket;

beforeEach(() => {
  localStorage.clear();
  socket = new MockSocket();
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  render(
    <AppProviders socket={socket}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
});

describe('HomePage before the socket is connected (QA-09)', () => {
  it('shows a disabled 連線中… button and sends nothing', () => {
    const button = screen.getByRole('button', {
      name: '連線中…',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(socket.requestsFor('room:create')).toHaveLength(0);
  });

  it('enables 建立房間 once connected and creates exactly one room', () => {
    act(() => socket.serverConnect());
    const button = screen.getByRole('button', {
      name: '建立房間',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(socket.requestsFor('room:create')).toHaveLength(1);
  });
});
