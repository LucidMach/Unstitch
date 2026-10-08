/**
 * Admin panel access control — a single shared password (ADMIN_PASSWORD),
 * not a per-user login. Deliberately simple: the schema's `AdminUser` model
 * only tracks identity/role, not credentials, and building real per-admin
 * auth wasn't worth the extra time/security-surface for a solo-owner site
 * right before launch. Revisit if/when there's more than one person who
 * needs their own login.
 *
 * Session = a signed, expiring token (src/lib/signedToken.js) stored in an
 * httpOnly cookie. No server-side session store.
 */
import { sendJson } from './apiHelper.js';
import { sign, verify } from './signedToken.js';

const COOKIE_NAME = 'unstitch_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export function parseCookies(req: any): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers?.cookie;
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export function isAdminAuthenticated(req: any): boolean {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;
  const payload = verify(token) as { role?: string } | null;
  return !!(payload && payload.role === 'admin');
}

/** @returns a Set-Cookie header value */
export function buildAdminSessionCookie(): string {
  const token = sign({ role: 'admin' }, SESSION_TTL_SECONDS);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/** @returns a Set-Cookie header value that clears the session */
export function buildAdminLogoutCookie(): string {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/**
 * Call at the top of any admin API handler. Sends a 401 and returns false
 * if the request isn't authenticated — the caller should just `return`.
 */
export function requireAdmin(req: any, res: any): boolean {
  if (!isAdminAuthenticated(req)) {
    sendJson(res, 401, { error: 'Not authenticated' });
    return false;
  }
  return true;
}
