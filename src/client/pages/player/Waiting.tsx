import { useState } from 'react';
import type { PublicPlayer } from '../../../shared';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

export interface WaitingProps {
  self: PublicPlayer;
  playerCount: number;
  onLeave: () => void;
}

export function Waiting({ self, playerCount, onLeave }: WaitingProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <main className="wd-player">
      <h1>誰跟我不一樣？</h1>
      <Avatar
        nickname={self.nickname}
        color={self.avatarColor}
        index={self.avatarIndex}
      />
      <p>目前 {playerCount} 人</p>
      <p className="wd-player__lead">等待主持人開始</p>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        離開房間
      </Button>
      <ConfirmDialog
        open={confirming}
        title="要離開房間嗎？"
        message="離開後要重新掃 QR Code 才能再加入。"
        danger
        onConfirm={() => {
          setConfirming(false);
          onLeave();
        }}
        onCancel={() => setConfirming(false)}
      />
    </main>
  );
}
