import type { CSSProperties, ReactNode } from 'react';
import './Avatar.css';

// Each pattern is drawn on a 24x24 grid so players can tell avatars apart without relying on color.
const PATTERNS: readonly ReactNode[] = [
  <circle key="circle" cx="12" cy="12" r="6" />,
  <rect key="square" x="6" y="6" width="12" height="12" rx="2" />,
  <path key="triangle" d="M12 5 20 19H4Z" />,
  <path key="diamond" d="M12 4 20 12 12 20 4 12Z" />,
  <path
    key="star"
    d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5l-5.4 3 1.2-6L3.3 9.3l6.1-.7Z"
  />,
  <path
    key="heart"
    d="M12 20S4 14.5 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5.5-8 11-8 11Z"
  />,
  <path key="plus" d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6Z" />,
  <path key="cross" d="m6 9 3-3 3 3 3-3 3 3-3 3 3 3-3 3-3-3-3 3-3-3 3-3Z" />,
  <path
    key="ring"
    fillRule="evenodd"
    d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
  />,
  <path key="moon" d="M15 4a8 8 0 1 0 5 12A7 7 0 0 1 15 4Z" />,
  <path key="bolt" d="M13 3 5 13h6l-1 8 9-11h-6Z" />,
  <path key="hexagon" d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8Z" />,
  <path key="drop" d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />,
  <g key="flower">
    <circle cx="12" cy="7.5" r="3.5" />
    <circle cx="12" cy="16.5" r="3.5" />
    <circle cx="7.5" cy="12" r="3.5" />
    <circle cx="16.5" cy="12" r="3.5" />
  </g>,
  <g key="stripes">
    <rect x="4" y="5" width="16" height="3" rx="1.5" />
    <rect x="4" y="10.5" width="16" height="3" rx="1.5" />
    <rect x="4" y="16" width="16" height="3" rx="1.5" />
  </g>,
];

export const AVATAR_PATTERN_COUNT = PATTERNS.length;

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
  const pattern =
    ((index % PATTERNS.length) + PATTERNS.length) % PATTERNS.length;
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
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {PATTERNS[pattern]}
        </svg>
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
