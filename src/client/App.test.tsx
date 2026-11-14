import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('shows the game name as the page heading', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { level: 1, name: '誰跟我不一樣？' }),
  ).toBeDefined();
});
