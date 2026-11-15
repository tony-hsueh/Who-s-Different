import { useParams } from 'react-router';
import type { GamePhase } from '../../../shared';
import { useHostSession, useRoomState } from '../../net/hooks';
import { FullscreenMessage } from '../../ui/FullscreenMessage';
import { RoomInvalid } from '../RoomInvalid';
import { HostLobby } from './HostLobby';

// Placeholders until the in-game screens exist.
const PHASE_TITLES: Record<Exclude<GamePhase, 'lobby'>, string> = {
  playing: '遊戲進行中',
  reveal: '淘汰揭曉',
  finished: '遊戲結束',
};

export function HostPage() {
  const { roomId = '' } = useParams();
  const { status } = useHostSession(roomId);
  const state = useRoomState();

  // Without a valid host token this browser cannot run the room, so there is nothing to recover.
  if (status === 'invalid' || status === 'no-token') return <RoomInvalid />;
  if (!state) return <FullscreenMessage title="連線中…" />;
  if (state.phase === 'lobby') return <HostLobby state={state} />;
  return <FullscreenMessage title={PHASE_TITLES[state.phase]} />;
}
