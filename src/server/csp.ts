import type { RequestHandler } from 'express';

// host[:port] only; anything else could smuggle directives into the header.
const SAFE_HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;

// 'self' alone does not cover WebSocket in every browser, so the origin is
// spelled out for ws/wss. Styles stay inline because avatar colors are set per element.
export const contentSecurityPolicy: RequestHandler = (req, res, next) => {
  const host = req.headers.host;
  const sockets =
    host && SAFE_HOST.test(host) ? ` ws://${host} wss://${host}` : '';
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      `connect-src 'self'${sockets}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  next();
};
