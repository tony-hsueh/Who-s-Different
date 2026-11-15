import type { PublicRoomState } from '../../../shared';
import { ROLE_LABEL } from '../../lib/role-labels';

export interface PlayerRevealProps {
  playerId: string;
  room: PublicRoomState;
}

// A short result above the secret card. Only the eliminated player's side is public.
export function PlayerReveal({ playerId, room }: PlayerRevealProps) {
  const out = room.lastElimination;
  if (!out) return null;
  const who = room.players.find((p) => p.playerId === out.playerId);
  return (
    <section className="wd-reveal" data-role={out.role} aria-live="polite">
      <p className="wd-reveal__result">
        {out.playerId === playerId
          ? '你被淘汰了'
          : `${who?.nickname ?? '有人'} 被淘汰了，是${ROLE_LABEL[out.role]}`}
      </p>
    </section>
  );
}
