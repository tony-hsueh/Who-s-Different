import { useParams } from 'react-router';
import { useConnected, usePlayerSession, useRoomState } from '../../net/hooks';
import { RoomInvalid } from '../RoomInvalid';

// Placeholder: PR-10 to PR-12 build the join form, waiting room and cards here.
export function PlayerPage() {
  const { roomCode = '' } = useParams();
  const { status } = usePlayerSession(roomCode);
  const connected = useConnected();
  const state = useRoomState();

  if (status === 'invalid') return <RoomInvalid />;

  return (
    <main>
      <h1>玩家畫面</h1>
      <p>房間代碼：{state?.roomCode ?? roomCode.toUpperCase()}</p>
      {!connected && <p>連線中…</p>}
    </main>
  );
}
