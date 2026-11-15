import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cover } from './Cover';

describe('Cover', () => {
  it('is decorative: the page heading already carries the title', () => {
    const { container } = render(<Cover />);
    const image = container.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('');
    expect(image?.getAttribute('src')).toBeTruthy();
  });

  it('has a small variant for the lobby and the join screen', () => {
    const { container } = render(<Cover size="sm" />);
    expect(container.firstElementChild?.getAttribute('data-size')).toBe('sm');
  });
});
