import { createContext, useContext } from 'react';
import type { ConnectionStore } from './connection';

export const ConnectionContext = createContext<ConnectionStore | null>(null);

export function useConnectionStore(): ConnectionStore {
  const store = useContext(ConnectionContext);
  if (!store) {
    throw new Error('connection hooks need <ConnectionProvider> above them');
  }
  return store;
}
