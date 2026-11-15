// Returns the origin (plus optional path prefix) the QR code and room link are built from.
export function parsePublicBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`PUBLIC_BASE_URL is not a valid URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`PUBLIC_BASE_URL must be http or https: ${value}`);
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new Error(
      `PUBLIC_BASE_URL must not carry a query, hash or credentials: ${value}`,
    );
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}
