import { useNavigate, useParams } from 'react-router';
import type { PublicPlayer } from '../../../shared';
import {
  useConnected,
  usePlayerSession,
  usePlayerState,
  useRequest,
  useRoomState,
} from '../../net/hooks';
import { clearPlayerToken } from '../../net/session-storage';
import { FullscreenMessage } from '../../ui/FullscreenMessage';
import { RoomInvalid } from '../RoomInvalid';
import { JoinForm } from './JoinForm';
import { PlayerFinished } from './PlayerFinished';
import { PlayerReveal } from './PlayerReveal';
import { SecretCard } from './SecretCard';
import { Waiting } from './Waiting';
import './player.css';

export function PlayerPage() {
  const { roomCode = '' } = useParams();
  const { status, reauth } = usePlayerSession(roomCode);
  const connected = useConnected();
  const room = useRoomState();
  const mine = usePlayerState();
  const request = useRequest();
  const navigate = useNavigate();

  if (status === 'invalid') return <RoomInvalid />;
  if (status === 'no-token') {
    return <JoinForm roomCode={roomCode} onJoined={reauth} />;
  }
  // While the link is down the card is not drawn, so it is hidden again once it is back.
  if (status !== 'ready' || !connected || !room || !mine) {
    return <FullscreenMessage title="連線中…" />;
  }

  const self: PublicPlayer = room.players.find(
    (p) => p.playerId === mine.playerId,
  ) ?? {
    playerId: mine.playerId,
    nickname: '我',
    avatarColor: '#5b3df5',
    avatarIndex: 0,
    eliminated: mine.eliminated,
    online: true,
  };

  async function leave() {
    const ack = await request('room:leave', {});
    if (!ack.ok) return;
    clearPlayerToken(roomCode);
    void navigate('/', { replace: true });
  }

  switch (mine.phase) {
    case 'lobby':
      return (
        <Waiting
          self={self}
          playerCount={room.players.length}
          onLeave={() => void leave()}
        />
      );
    case 'finished':
      return <PlayerFinished playerId={mine.playerId} result={room.result} />;
    case 'playing':
    case 'reveal':
      // Both phases render the same card element, so a word being read survives the round change.
      return mine.secretWord === null ? (
        <FullscreenMessage title="連線中…" />
      ) : (
        <SecretCard
          self={self}
          roundNumber={mine.roundNumber}
          eliminated={mine.eliminated}
          word={mine.secretWord}
          notice={
            mine.phase === 'reveal' && (
              <PlayerReveal playerId={mine.playerId} room={room} />
            )
          }
        />
      );
  }
}
