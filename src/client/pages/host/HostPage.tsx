import { useParams } from 'react-router';
import { useHostSession, useRoomState } from '../../net/hooks';
import { FullscreenMessage } from '../../ui/FullscreenMessage';
import { RoomInvalid } from '../RoomInvalid';
import { HostLobby } from './HostLobby';
import { HostPlaying } from './HostPlaying';

// Placeholders until PR-12 builds the reveal and finished screens.
const PHASE_TITLES = {
  reveal: '淘汰揭曉',
  finished: '遊戲結束',
} as const;

export function HostPage() {
  const { roomId = '' } = useParams();
  const { status } = useHostSession(roomId);
  const state = useRoomState();

  // Without a valid host token this browser cannot run the room, so there is nothing to recover.
  if (status === 'invalid' || status === 'no-token') return <RoomInvalid />;
  if (!state) return <FullscreenMessage title="連線中…" />;
  if (state.phase === 'lobby') return <HostLobby state={state} />;
  if (state.phase === 'playing') return <HostPlaying state={state} />;
  return <FullscreenMessage title={PHASE_TITLES[state.phase]} />;
}
