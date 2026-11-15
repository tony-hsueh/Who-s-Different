import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useRequest } from '../net/hooks';
import { saveHostToken } from '../net/session-storage';
import { Cover } from '../components/Cover';
import { Button } from '../ui/Button';
import { FullscreenMessage } from '../ui/FullscreenMessage';

export function HomePage() {
  const request = useRequest();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function createRoom() {
    setCreating(true);
    const ack = await request('room:create', {});
    if (ack.ok) {
      saveHostToken(ack.data.roomId, ack.data.hostToken);
      await navigate(`/host/${ack.data.roomId}`);
    } else {
      setCreating(false);
    }
  }

  return (
    <FullscreenMessage
      art={<Cover />}
      title="誰跟我不一樣？"
      message="大家拿到的詞語幾乎一樣，找出那幾個拿到不同詞語的人。"
    >
      <Button size="lg" disabled={creating} onClick={() => void createRoom()}>
        建立房間
      </Button>
    </FullscreenMessage>
  );
}
