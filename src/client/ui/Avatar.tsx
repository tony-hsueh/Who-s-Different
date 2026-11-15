import type { CSSProperties } from 'react';
import './Avatar.css';

// One hand-drawn character per pattern. Each has its own silhouette and face, so players
// can be told apart without relying on the badge color. Files sort by their 01-… prefix.
const ARTWORK: readonly string[] = Object.entries(
  import.meta.glob<string>('../assets/avatars/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

export const AVATAR_PATTERN_COUNT = ARTWORK.length;

export interface AvatarProps {
  nickname: string;
  color: string;
  index: number;
  offline?: boolean;
  eliminated?: boolean;
}

export function Avatar({
  nickname,
  color,
  index,
  offline = false,
  eliminated = false,
}: AvatarProps) {
  const pattern = ((index % ARTWORK.length) + ARTWORK.length) % ARTWORK.length;
  const label = [nickname, eliminated && '已淘汰', offline && '離線']
    .filter(Boolean)
    .join('，');
  return (
    <div
      className="wd-avatar"
      data-pattern={pattern}
      data-offline={offline || undefined}
      data-eliminated={eliminated || undefined}
      style={{ '--avatar-color': color } as CSSProperties}
    >
      <div className="wd-avatar__badge" role="img" aria-label={label}>
        <img src={ARTWORK[pattern]} alt="" draggable={false} />
      </div>
      <span className="wd-avatar__name">{nickname}</span>
      {eliminated && (
        <span className="wd-avatar__tag" data-tag="eliminated">
          已淘汰
        </span>
      )}
      {offline && <span className="wd-avatar__tag">離線</span>}
    </div>
  );
}
