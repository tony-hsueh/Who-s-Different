import coverUrl from '../assets/cover.svg';
import './Cover.css';

export interface CoverProps {
  size?: 'lg' | 'sm';
}

// Decorative: the page's own heading carries the title, so a screen reader skips the picture.
export function Cover({ size = 'lg' }: CoverProps) {
  return (
    <div className="wd-cover" data-size={size}>
      <img src={coverUrl} alt="" width="800" height="380" draggable={false} />
    </div>
  );
}
