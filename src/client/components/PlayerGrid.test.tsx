import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicPlayer } from '../../shared';
import { PlayerGrid } from './PlayerGrid';

const player = (n: number, over: Partial<PublicPlayer> = {}): PublicPlayer => ({
  playerId: `p${n}`,
  nickname: `玩家${n}`,
  avatarColor: '#ff5a5f',
  avatarIndex: n,
  eliminated: false,
  online: true,
  ...over,
});

describe('PlayerGrid', () => {
  it('shows every player with a nickname', () => {
    render(<PlayerGrid players={[player(1), player(2), player(3)]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('玩家2')).toBeDefined();
  });

  it('marks offline and eliminated players', () => {
    render(
      <PlayerGrid
        players={[
          player(1, { online: false }),
          player(2, { eliminated: true }),
        ]}
      />,
    );
    expect(screen.getByText('離線')).toBeDefined();
    expect(screen.getByText('已淘汰')).toBeDefined();
  });

  it('is not interactive without onSelect', () => {
    render(<PlayerGrid players={[player(1)]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onSelect with the player when clicked', () => {
    const onSelect = vi.fn();
    render(<PlayerGrid players={[player(1), player(2)]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /玩家2/ }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p2' }),
    );
  });

  it('disables the players the caller rules out', () => {
    const onSelect = vi.fn();
    render(
      <PlayerGrid
        players={[player(1), player(2, { eliminated: true })]}
        onSelect={onSelect}
        isDisabled={(p) => p.eliminated}
      />,
    );
    const button = screen.getByRole('button', { name: /玩家2/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('passes the size to the grid', () => {
    const { container } = render(
      <PlayerGrid players={[player(1)]} size="sm" />,
    );
    expect(container.querySelector('[data-size="sm"]')).not.toBeNull();
  });
});
