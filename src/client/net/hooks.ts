import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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

export const UNREACHABLE_AFTER_MS = 5_000;

export type ServerStatus = 'ready' | 'connecting' | 'unreachable';

// What a button that needs the server should show: usable, still waiting, or given up waiting.
export function useServerStatus(): {
  status: ServerStatus;
  retry: () => void;
} {
  const store = useConnectionStore();
  const connected = useConnected();
  const [gaveUp, setGaveUp] = useState(false);
  // Each retry restarts the wait, so the button says 連線中… again while it tries.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (connected) return;
    const timer = setTimeout(() => setGaveUp(true), UNREACHABLE_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setGaveUp(false);
    };
  }, [connected, attempt]);
  const retry = useCallback(() => {
    store.reconnect();
    setAttempt((n) => n + 1);
  }, [store]);
  const status = connected ? 'ready' : gaveUp ? 'unreachable' : 'connecting';
  return { status, retry };
}

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
  options?: { silent?: boolean; roomMayBeMissing?: boolean },
) => Promise<Ack<Requests[E]['data']>>;

// Sends a request and shows a Chinese toast when it fails (pass `silent` to handle it yourself).
export function useRequest(): Request {
  const store = useConnectionStore();
  const toast = useToast();
  return useCallback<Request>(
    async (event, payload, options) => {
      const ack = await store.request(event, payload, options);
      if (!ack.ok && !options?.silent) toast.show(errorMessage(ack.code));
      return ack;
    },
    [store, toast],
  );
}
