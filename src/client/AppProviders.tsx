import type { ReactNode } from 'react';
import { ConnectionProvider } from './net/ConnectionProvider';
import type { SocketLike } from './net/socket';
import { ToastProvider } from './ui/Toast';
import './ui/tokens.css';

export function AppProviders({
  socket,
  children,
}: {
  socket?: SocketLike;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <ConnectionProvider socket={socket}>{children}</ConnectionProvider>
    </ToastProvider>
  );
}
