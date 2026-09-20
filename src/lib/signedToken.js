/**
 * Small stateless signed-token helper — HMAC-SHA256 over a base64url JSON
 * payload, with an expiry baked in. No database/session store needed.
 *
 * Used for two unrelated things that both just need "a tamper-proof,
 * expiring bearer token, no server-side state":
 *   - the admin panel's session cookie (src/lib/adminAuth.js)
 *   - customer order magic-links (api/order-lookup*.js)
 *
 * NOT a JWT implementation (no alg negotiation, no standard claims) —
 * deliberately minimal for what this site actually needs.
 */
import crypto from 'node:crypto';

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured — set it in .env');
  }
  return secret;
}

function hmac(secret, payloadB64) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * @param {Record<string, any>} payload
 * @param {number} ttlSeconds
 * @returns {string}
 */
export function sign(payload, ttlSeconds) {
  const secret = getSecret();
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadB64 = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  return `${payloadB64}.${hmac(secret, payloadB64)}`;
}

/**
 * Returns the decoded payload if the token is well-formed, correctly
 * signed, and not expired — otherwise null. Never throws on bad input.
 * @param {string | undefined | null} token
 * @returns {Record<string, any> | null}
 */
export function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  let secret;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const payloadB64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  const expected = hmac(secret, payloadB64);

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
