import type { CSSProperties } from 'react';
import type { PublicPlayer, Role } from '../../../shared';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import './reveal.css';

const COPY: Record<Role, { title: string; subtitle: string; outcome: string }> =
  {
    majority: {
      title: '淘汰的是平民！',
      subtitle: '糟糕！你們抓錯人了！',
      outcome: 'wrong',
    },
    minority: {
      title: '成功抓到臥底！',
      subtitle: '漂亮！成功找出一位臥底！',
      outcome: 'caught',
    },
  };

const CONFETTI_PIECES = 18;

export interface HostRevealProps {
  player: PublicPlayer;
  role: Role;
  actionLabel: string;
  actionBusy?: boolean;
  onAction: () => void;
}

// Shows one side only: the one that was just voted out. Words and the living stay off this screen.
export function HostReveal({
  player,
  role,
  actionLabel,
  actionBusy = false,
  onAction,
}: HostRevealProps) {
  const { title, subtitle, outcome } = COPY[role];
  return (
    <main className="host-reveal" data-outcome={outcome}>
      {outcome === 'caught' && (
        <div className="host-reveal__confetti" aria-hidden="true">
          {Array.from({ length: CONFETTI_PIECES }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
      <svg
        className="host-reveal__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="11" />
        {outcome === 'wrong' ? (
          <path d="m8 8 8 8m0-8-8 8" />
        ) : (
          <path d="m7 12.5 3.3 3.3L17 9" />
        )}
      </svg>
      <h1 className="host-reveal__title">{title}</h1>
      <p className="host-reveal__subtitle">{subtitle}</p>
      <div className="host-reveal__who">
        <Avatar
          nickname={player.nickname}
          color={player.avatarColor}
          index={player.avatarIndex}
        />
      </div>
      <Button size="lg" disabled={actionBusy} onClick={onAction}>
        {actionLabel}
      </Button>
    </main>
  );
}
