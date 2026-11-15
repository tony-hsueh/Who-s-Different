import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage } from '../i18n/errors';
import { useToast } from '../ui/Toast';
import { ConnectionStore } from './connection';
import { ConnectionContext } from './context';
import { createSocket, type SocketLike } from './socket';

export interface ConnectionProviderProps {
  // Tests pass a fake; the app creates the one real Socket.IO client.
  socket?: SocketLike;
  children: ReactNode;
}

export function ConnectionProvider({
  socket,
  children,
}: ConnectionProviderProps) {
  const toast = useToast();
  const [store] = useState(
    () =>
      new ConnectionStore({
        socket: socket ?? createSocket(),
        onError: (code) => toast.show(errorMessage(code)),
      }),
  );

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  return (
    <ConnectionContext.Provider value={store}>
      {children}
    </ConnectionContext.Provider>
  );
}
