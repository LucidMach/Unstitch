// api/admin/login.js
// Single shared admin password (see src/lib/adminAuth.js for why), rate
// limited, constant-time compared, issuing a signed httpOnly session
// cookie on success.

import crypto from 'node:crypto';
import { checkRateLimit } from '../../src/lib/rateLimit.js';
import { sendJson, parseRequestBody } from '../../src/lib/apiHelper.js';
import { buildAdminSessionCookie } from '../../src/lib/adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Deliberately tight — this is the one endpoint an attacker would try to
  // brute-force a single shared password against.
  const rateResult = checkRateLimit(req, { limit: 8, windowMs: 60000, prefix: 'admin-login' });
  if (!rateResult.success) {
    res.setHeader('Retry-After', Math.ceil((rateResult.resetTime - Date.now()) / 1000).toString());
    return sendJson(res, 429, { error: 'Too many attempts. Please wait a moment.' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('[admin/login] ADMIN_PASSWORD is not configured.');
    return sendJson(res, 503, { error: 'Admin login is not configured yet.' });
  }

  const { password } = parseRequestBody(req);
  if (typeof password !== 'string' || password.length === 0) {
    return sendJson(res, 400, { error: 'Password required.' });
  }

  const suppliedBuf = Buffer.from(password, 'utf8');
  const expectedBuf = Buffer.from(adminPassword, 'utf8');
  const valid =
    suppliedBuf.length === expectedBuf.length && crypto.timingSafeEqual(suppliedBuf, expectedBuf);

  if (!valid) {
    return sendJson(res, 401, { error: 'Incorrect password.' });
  }

  res.setHeader('Set-Cookie', buildAdminSessionCookie());
  return sendJson(res, 200, { ok: true });
}
