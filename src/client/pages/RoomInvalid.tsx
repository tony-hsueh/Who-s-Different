import { useNavigate } from 'react-router';
import { Button } from '../ui/Button';
import { FullscreenMessage } from '../ui/FullscreenMessage';

export function RoomInvalid() {
  const navigate = useNavigate();
  return (
    <FullscreenMessage
      title="房間已失效"
      message="這個房間已經關閉，或是從來沒有存在過。"
    >
      <Button size="lg" onClick={() => void navigate('/')}>
        回首頁
      </Button>
    </FullscreenMessage>
  );
}
