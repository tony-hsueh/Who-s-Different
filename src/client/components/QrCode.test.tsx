import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QrCode } from './QrCode';

describe('QrCode', () => {
  it('renders an svg that records the exact text it encodes', () => {
    render(<QrCode value="http://192.168.1.5:3000/room/ABC234" label="掃碼" />);
    const svg = screen.getByRole('img', { name: '掃碼' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('data-value')).toBe(
      'http://192.168.1.5:3000/room/ABC234',
    );
  });

  it('draws dark modules', () => {
    const { container } = render(<QrCode value="hello" label="x" />);
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    expect(d.length).toBeGreaterThan(50);
  });

  it('encodes different text into a different drawing', () => {
    const a = render(<QrCode value="aaaa" label="a" />);
    const pathA = a.container.querySelector('path')?.getAttribute('d');
    a.unmount();
    const b = render(<QrCode value="bbbb" label="b" />);
    expect(b.container.querySelector('path')?.getAttribute('d')).not.toBe(
      pathA,
    );
  });
});
