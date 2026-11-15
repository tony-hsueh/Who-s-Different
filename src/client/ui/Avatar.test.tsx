import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, AVATAR_PATTERN_COUNT } from './Avatar';

const base = { nickname: '小明', color: '#e63946', index: 3 };

function rootOf(container: HTMLElement) {
  return container.firstElementChild as HTMLElement;
}

describe('Avatar', () => {
  it('online: shows nickname, color and pattern with no overlay', () => {
    const { container } = render(<Avatar {...base} />);
    expect(screen.getByText('小明')).toBeDefined();
    expect(screen.getByRole('img', { name: '小明' })).toBeDefined();
    const root = rootOf(container);
    expect(root.dataset.offline).toBeUndefined();
    expect(root.dataset.eliminated).toBeUndefined();
    expect(root.dataset.pattern).toBe('3');
    expect(root.style.getPropertyValue('--avatar-color')).toBe('#e63946');
    expect(screen.queryByText('離線')).toBeNull();
    expect(screen.queryByText('已淘汰')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('offline: marks the avatar and says so in text', () => {
    const { container } = render(<Avatar {...base} offline />);
    expect(rootOf(container).dataset.offline).toBe('true');
    expect(screen.getByText('離線')).toBeDefined();
    expect(screen.getByRole('img', { name: '小明，離線' })).toBeDefined();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('eliminated: marks the avatar and says so in text', () => {
    const { container } = render(<Avatar {...base} eliminated />);
    expect(rootOf(container).dataset.eliminated).toBe('true');
    expect(screen.getByText('已淘汰')).toBeDefined();
    expect(screen.getByRole('img', { name: '小明，已淘汰' })).toBeDefined();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('eliminated and offline: shows both overlays', () => {
    const { container } = render(<Avatar {...base} offline eliminated />);
    const root = rootOf(container);
    expect(root.dataset.offline).toBe('true');
    expect(root.dataset.eliminated).toBe('true');
    expect(
      screen.getByRole('img', { name: '小明，已淘汰，離線' }),
    ).toBeDefined();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('wraps the pattern index so any avatarIndex draws something', () => {
    const { container } = render(
      <Avatar {...base} index={AVATAR_PATTERN_COUNT + 2} />,
    );
    expect(rootOf(container).dataset.pattern).toBe('2');
  });
});
