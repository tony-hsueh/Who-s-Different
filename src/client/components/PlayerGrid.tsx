import type { PublicPlayer } from '../../shared';
import { Avatar } from '../ui/Avatar';
import './PlayerGrid.css';

export interface PlayerGridProps {
  players: readonly PublicPlayer[];
  // Makes every player a button; leave it out for a display-only grid.
  onSelect?: (player: PublicPlayer) => void;
  isDisabled?: (player: PublicPlayer) => boolean;
  // `sm` leaves room for a full table of 15 next to other content.
  size?: 'md' | 'sm';
}

export function PlayerGrid({
  players,
  onSelect,
  isDisabled,
  size = 'md',
}: PlayerGridProps) {
  return (
    <ul className="wd-player-grid" data-size={size}>
      {players.map((player) => {
        const avatar = (
          <Avatar
            nickname={player.nickname}
            color={player.avatarColor}
            index={player.avatarIndex}
            offline={!player.online}
            eliminated={player.eliminated}
          />
        );
        return (
          <li key={player.playerId} className="wd-player-grid__item">
            {onSelect ? (
              <button
                type="button"
                className="wd-player-grid__button"
                disabled={isDisabled?.(player) ?? false}
                onClick={() => onSelect(player)}
              >
                {avatar}
              </button>
            ) : (
              avatar
            )}
          </li>
        );
      })}
    </ul>
  );
}
