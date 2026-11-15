import { useServerStatus } from '../net/hooks';
import { Button, type ButtonProps } from './Button';
import './ServerButton.css';

// A Button for anything that sends a request. It stays visible, but disabled, until the
// socket is connected, because the connection layer refuses requests made before that.
export function ServerButton({ children, disabled, ...rest }: ButtonProps) {
  const { status, retry } = useServerStatus();
  if (status === 'ready') {
    return (
      <Button {...rest} disabled={disabled}>
        {children}
      </Button>
    );
  }
  return (
    // The type stays as given: a disabled submit button also blocks Enter in the form.
    <span className="wd-server-button">
      <Button {...rest} disabled onClick={undefined}>
        {status === 'connecting' ? '連線中…' : '連不上伺服器'}
      </Button>
      {status === 'unreachable' && (
        <Button variant="secondary" size={rest.size} onClick={retry}>
          重試
        </Button>
      )}
    </span>
  );
}
