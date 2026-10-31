import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const lifetime = 8 * 60 * 60;
const cookieName = '__Host-harness-access';
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function createPrivateAccess(config, now = () => Math.floor(Date.now() / 1000)) {
  const password = config.HARNESS_ACCESS_PASSWORD;
  const username = config.HARNESS_ACCESS_USERNAME || 'operator';
  const origin = config.HARNESS_PUBLIC_ORIGIN;
  if (typeof password !== 'string' || password.length < 32 || !origin) throw new Error('Private harness access configuration required');
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.username || parsed.password) throw new Error('HARNESS_PUBLIC_ORIGIN must be an HTTPS origin');
  const mac = value => createHmac('sha256', password).update('harness-access-v1:' + value).digest('base64url');
  function authorized(request) {
    const header = request.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Basic ')) {
      const encoded = header.slice(6);
      if (encoded.length < 2048 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        const credential = Buffer.from(encoded, 'base64').toString('utf8');
        if (equal(credential, username + ':' + password)) return true;
      }
    }
    const cookies = request.headers.cookie;
    if (typeof cookies !== 'string' || cookies.length > 8192) return false;
    const cookie = cookies.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='));
    if (!cookie) return false;
    const value = cookie.slice(cookieName.length + 1);
    const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
    if (!match) return false;
    const timestamp = Number(match[1]);
    return timestamp <= now() && now() - timestamp < lifetime && equal(match[2], mac(match[1]));
  }
  function allowedOrigin(request, websocket = false) {
    const supplied = request.headers.origin;
    if (websocket) return supplied === origin;
    return (!supplied || supplied === origin) && request.headers['sec-fetch-site'] !== 'cross-site';
  }
  return {
    http(request, response) {
      const path = (request.url || '/').split('?')[0];
      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/health') return true;
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Vary', 'Authorization, Cookie, Origin');
      if (!allowedOrigin(request)) { response.writeHead(403); response.end('Forbidden'); return false; }
      if (!authorized(request)) {
        response.setHeader('WWW-Authenticate', 'Basic realm="Private harness", charset="UTF-8"');
        response.writeHead(401); response.end('Authentication required'); return false;
      }
      const timestamp = String(now());
      response.setHeader('Set-Cookie', cookieName + '=' + timestamp + '.' + mac(timestamp) + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + lifetime);
      delete request.headers.authorization;
      return true;
    },
    upgrade(request, socket) {
      if (!allowedOrigin(request, true) || !authorized(request)) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n');
        return false;
      }
      delete request.headers.authorization;
      return true;
    },
  };
}
