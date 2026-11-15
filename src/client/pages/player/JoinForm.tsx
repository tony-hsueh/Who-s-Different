import { useId, useState, type FormEvent } from 'react';
import { errorMessage } from '../../i18n/errors';
import { useRequest } from '../../net/hooks';
import { savePlayerToken } from '../../net/session-storage';
import { Cover } from '../../components/Cover';
import { ServerButton } from '../../ui/ServerButton';

export interface JoinFormProps {
  roomCode: string;
  // Called after the token is saved, so the page can fetch its first private state.
  onJoined: () => void;
}

export function JoinForm({ roomCode, onJoined }: JoinFormProps) {
  const request = useRequest();
  const inputId = useId();
  const errorId = useId();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    // The server judges the nickname; this form only shows its answer.
    const ack = await request(
      'room:join',
      { roomCode, nickname },
      { silent: true, roomMayBeMissing: true },
    );
    setPending(false);
    if (!ack.ok) {
      setError(errorMessage(ack.code));
      return;
    }
    savePlayerToken(roomCode, ack.data.sessionToken);
    onJoined();
  }

  return (
    <main className="wd-player">
      <Cover size="sm" />
      <h1>加入遊戲</h1>
      <p className="wd-player__room">房間代碼：{roomCode.toUpperCase()}</p>
      <form className="wd-join" onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor={inputId}>暱稱</label>
        <input
          id={inputId}
          className="wd-join__input"
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setError(null);
          }}
          placeholder="最多 12 個字"
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className="wd-join__error" role="alert">
            {error}
          </p>
        )}
        <ServerButton type="submit" size="lg" disabled={pending}>
          加入
        </ServerButton>
      </form>
    </main>
  );
}
