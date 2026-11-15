import { useState } from 'react';
import { useParams } from 'react-router';
import type { PublicRoomState } from '../../../shared';
import { useOnce } from '../../hooks/useOnce';
import { useHostSession, useRequest, useRoomState } from '../../net/hooks';
import { FullscreenMessage } from '../../ui/FullscreenMessage';
import { RoomInvalid } from '../RoomInvalid';
import { HostFinished } from './HostFinished';
import { HostLobby } from './HostLobby';
import { HostNoAccess } from './HostNoAccess';
import { HostPlaying } from './HostPlaying';
import { HostReveal } from './HostReveal';

// The server goes from playing straight to finished when the last elimination decides the
// game, so no reveal phase ever arrives. The page notices that jump itself and plays the
// reveal for the final elimination before the results. Opening the page on a finished game
// (a reload) goes straight to the results.
function useRevealBeforeFinish(state: PublicRoomState | null) {
  const [phase, setPhase] = useState(state?.phase);
  const [pending, setPending] = useState(false);
  if (state && state.phase !== phase) {
    setPhase(state.phase);
    setPending(
      phase === 'playing' &&
        state.phase === 'finished' &&
        state.lastElimination !== undefined,
    );
  }
  return { pending, done: () => setPending(false) };
}

function RevealScreen({ state }: { state: PublicRoomState }) {
  const request = useRequest();
  const next = useOnce(() => request('game:next-round', {}));
  const last = state.lastElimination;
  const player = state.players.find((p) => p.playerId === last?.playerId);
  if (!last || !player) return null;
  return (
    <HostReveal
      player={player}
      role={last.role}
      actionLabel="下一輪"
      actionBusy={next.busy}
      onAction={next.run}
    />
  );
}

export function HostPage() {
  const { roomId = '' } = useParams();
  const { status } = useHostSession(roomId);
  const state = useRoomState();
  const finishing = useRevealBeforeFinish(state);

  // Only a server answer (room not found, or closed) proves the room is gone. With no usable
  // token the room may well be running, this browser just cannot run it.
  if (status === 'invalid') return <RoomInvalid />;
  if (status === 'no-token') return <HostNoAccess />;
  if (!state) return <FullscreenMessage title="連線中…" />;
  if (state.phase === 'lobby') return <HostLobby state={state} />;
  if (state.phase === 'playing') return <HostPlaying state={state} />;
  if (state.phase === 'reveal') return <RevealScreen state={state} />;

  const last = state.lastElimination;
  const player = state.players.find((p) => p.playerId === last?.playerId);
  if (finishing.pending && last && player) {
    return (
      <HostReveal
        player={player}
        role={last.role}
        actionLabel="看結果"
        onAction={finishing.done}
      />
    );
  }
  return <HostFinished state={state} />;
}
