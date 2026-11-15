import { Link } from 'react-router';
import { FullscreenMessage } from '../ui/FullscreenMessage';

export function NotFound() {
  return (
    <FullscreenMessage title="找不到這個頁面">
      <Link to="/" className="wd-btn" data-variant="primary" data-size="lg">
        回首頁
      </Link>
    </FullscreenMessage>
  );
}
