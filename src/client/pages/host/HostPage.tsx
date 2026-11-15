import { useParams } from 'react-router';
import { useConnected, useHostSession, useRoomState } from '../../net/hooks';
import { RoomInvalid } from '../RoomInvalid';

// Placeholder: PR-09 to PR-12 build the real host screens here.
export function HostPage() {
  const { roomId = '' } = useParams();
  const { status } = useHostSession(roomId);
  const connected = useConnected();
  const state = useRoomState();

  // Without a valid host token this browser cannot run the room, so there is nothing to recover.
  if (status === 'invalid' || status === 'no-token') return <RoomInvalid />;

  return (
    <main>
      <h1>主持人畫面</h1>
      {state && <p>房間代碼：{state.roomCode}</p>}
      {!connected && <p>連線中…</p>}
    </main>
  );
}
