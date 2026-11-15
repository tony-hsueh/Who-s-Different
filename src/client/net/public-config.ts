import { useEffect, useState } from 'react';

// PUBLIC_BASE_URL lives on the server, so ask it. Without one (or without an answer)
// the address this page was opened from is the best guess.
async function loadPublicBaseUrl(): Promise<string> {
  const body: unknown = await fetch('/config')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  const configured =
    typeof body === 'object' && body !== null && 'publicBaseUrl' in body
      ? body.publicBaseUrl
      : null;
  return typeof configured === 'string' && configured
    ? configured
    : window.location.origin;
}

// Null until the answer is in, so a QR code is never drawn for a guess that then changes.
export function usePublicBaseUrl(): string | null {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void loadPublicBaseUrl().then((url) => {
      if (current) setBaseUrl(url);
    });
    return () => {
      current = false;
    };
  }, []);
  return baseUrl;
}
