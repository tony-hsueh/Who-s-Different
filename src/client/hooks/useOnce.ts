import { useRef, useState } from 'react';

// Runs `action` at most once at a time. A second click in the same tick still finds the ref
// set, which state would not manage. A failed action unlocks it; a successful one stays locked
// because the screen is about to be replaced by the next room:state.
export function useOnce(action: () => Promise<{ ok: boolean }>) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const ack = await action();
    if (!ack.ok) {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, run: () => void run() };
}
