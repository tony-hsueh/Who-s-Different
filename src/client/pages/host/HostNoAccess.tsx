import { useNavigate } from 'react-router';
import { Button } from '../../ui/Button';
import { FullscreenMessage } from '../../ui/FullscreenMessage';

// Shown when this browser holds no (or no valid) host token. The room may still be running,
// so this must not say it is gone.
export function HostNoAccess() {
  const navigate = useNavigate();
  return (
    <FullscreenMessage
      title="這個瀏覽器沒有這個房間的主持權限"
      message="房間可能還在進行。主持人要用建立房間的那個瀏覽器打開這個網址；換了瀏覽器或清除過網站資料，就無法接手。"
    >
      <Button size="lg" onClick={() => void navigate('/')}>
        回首頁
      </Button>
    </FullscreenMessage>
  );
}
