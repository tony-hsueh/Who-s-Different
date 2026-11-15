import { useState, type ReactNode } from 'react';
import type { PublicPlayer } from '../../../shared';
import { useAutoHide } from '../../hooks/useAutoHide';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';

export interface SecretCardProps {
  self: PublicPlayer;
  roundNumber: number;
  eliminated: boolean;
  word: string;
  // Shown under the title, e.g. the result of a reveal.
  notice?: ReactNode;
}

// The word is rendered only while revealed, so a hidden card leaves nothing in the DOM to
// read, copy or capture. It stays in memory, so showing it again needs no request.
export function SecretCard({
  self,
  roundNumber,
  eliminated,
  word,
  notice,
}: SecretCardProps) {
  const [revealed, setRevealed] = useState(false);
  const { backgrounded } = useAutoHide(() => setRevealed(false));
  const toggle = () => setRevealed((value) => !value);

  return (
    <main
      className="wd-player wd-secret"
      data-backgrounded={backgrounded || undefined}
    >
      <h1>誰跟我不一樣？</h1>
      {notice}
      <Avatar
        nickname={self.nickname}
        color={self.avatarColor}
        index={self.avatarIndex}
        eliminated={eliminated}
      />
      <p>第 {roundNumber} 輪</p>
      <p
        className="wd-secret__status"
        data-eliminated={eliminated || undefined}
      >
        {eliminated ? '已淘汰' : '存活'}
      </p>
      {eliminated && <p>你已淘汰，可以繼續觀戰</p>}
      <div className="wd-secret__panel" onClick={toggle}>
        {revealed ? (
          <p className="wd-secret__word">{word}</p>
        ) : (
          <p className="wd-secret__hint">點一下查看題目</p>
        )}
      </div>
      <Button size="lg" aria-pressed={revealed} onClick={toggle}>
        {revealed ? '隱藏題目' : '查看題目'}
      </Button>
      <div className="wd-secret__shield" aria-hidden="true" />
    </main>
  );
}
