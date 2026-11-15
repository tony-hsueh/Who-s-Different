import { useEffect, useRef, useState } from 'react';

// Calls `onHide` whenever the page is likely to be seen by someone else: the tab goes to
// the background, the page is being left, or the window loses focus. `backgrounded` stays
// true until the page is visible and focused again, so the caller can blur what is on screen.
export function useAutoHide(onHide: () => void): { backgrounded: boolean } {
  const [backgrounded, setBackgrounded] = useState(
    () => document.visibilityState === 'hidden',
  );
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  });

  useEffect(() => {
    const cover = () => {
      setBackgrounded(true);
      onHideRef.current();
    };
    const uncover = () => {
      if (document.visibilityState === 'visible') setBackgrounded(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cover();
      else uncover();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', cover);
    window.addEventListener('blur', cover);
    window.addEventListener('focus', uncover);
    window.addEventListener('pageshow', uncover);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', cover);
      window.removeEventListener('blur', cover);
      window.removeEventListener('focus', uncover);
      window.removeEventListener('pageshow', uncover);
    };
  }, []);

  return { backgrounded };
}
