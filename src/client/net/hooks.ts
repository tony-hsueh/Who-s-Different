import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type {
  Ack,
  PlayerPrivateState,
  PublicRoomState,
  Requests,
} from '../../shared';
import { errorMessage } from '../i18n/errors';
import { useToast } from '../ui/Toast';
import type { ConnectionSnapshot, ConnectionStatus } from './connection';
import { useConnectionStore } from './context';

function useSnapshot<T>(select: (snapshot: ConnectionSnapshot) => T): T {
  const store = useConnectionStore();
  return useSyncExternalStore(store.subscribe, () =>
    select(store.getSnapshot()),
  );
}

export const useConnected = () => useSnapshot((s) => s.connected);

export const useRoomState = (): PublicRoomState | null =>
  useSnapshot((s) => s.roomState);

export const usePlayerState = (): PlayerPrivateState | null =>
  useSnapshot((s) => s.playerState);

function useSession(
  kind: 'host' | 'player',
  id: string,
): { status: ConnectionStatus; reauth: () => void } {
  const store = useConnectionStore();
  useEffect(() => {
    store.setIdentity(
      kind === 'host' ? { kind, roomId: id } : { kind, roomCode: id },
    );
    return () => store.setIdentity(null);
  }, [store, kind, id]);
  const status = useSnapshot((s) => s.status);
  return { status, reauth: store.reauth };
}

// Binds this page to a room as its host and keeps host:auth fresh across reconnects.
export const useHostSession = (roomId: string) => useSession('host', roomId);

// Binds this page to a room as a player. After a successful room:join, save the
// token and call `reauth()` to receive the first private state.
export const usePlayerSession = (roomCode: string) =>
  useSession('player', roomCode);

type Request = <E extends keyof Requests>(
  event: E,
  payload: Requests[E]['payload'],
  options?: { silent?: boolean },
) => Promise<Ack<Requests[E]['data']>>;

// Sends a request and shows a Chinese toast when it fails (pass `silent` to handle it yourself).
export function useRequest(): Request {
  const store = useConnectionStore();
  const toast = useToast();
  return useCallback<Request>(
    async (event, payload, options) => {
      const ack = await store.request(event, payload);
      if (!ack.ok && !options?.silent) toast.show(errorMessage(ack.code));
      return ack;
    },
    [store, toast],
  );
}
