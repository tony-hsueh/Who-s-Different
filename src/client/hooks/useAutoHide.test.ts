import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoHide } from './useAutoHide';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useAutoHide', () => {
  it('hides when the page becomes hidden', () => {
    const onHide = vi.fn();
    renderHook(() => useAutoHide(onHide));
    setVisibility('hidden');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('does not hide when the page becomes visible again', () => {
    const onHide = vi.fn();
    renderHook(() => useAutoHide(onHide));
    setVisibility('visible');
    expect(onHide).not.toHaveBeenCalled();
  });

  it('hides on pagehide', () => {
    const onHide = vi.fn();
    renderHook(() => useAutoHide(onHide));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('hides on blur and reports the page as backgrounded until focus returns', () => {
    const onHide = vi.fn();
    const { result } = renderHook(() => useAutoHide(onHide));
    expect(result.current.backgrounded).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(result.current.backgrounded).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.backgrounded).toBe(false);
  });

  it('stays backgrounded on focus while the page is still hidden', () => {
    const { result } = renderHook(() => useAutoHide(vi.fn()));
    setVisibility('hidden');
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.backgrounded).toBe(true);
    setVisibility('visible');
    expect(result.current.backgrounded).toBe(false);
  });

  it('calls the latest callback without resubscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useAutoHide(cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', () => {
    const onHide = vi.fn();
    const { unmount } = renderHook(() => useAutoHide(onHide));
    unmount();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('pagehide'));
    expect(onHide).not.toHaveBeenCalled();
  });
});
