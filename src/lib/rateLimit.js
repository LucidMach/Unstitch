// src/lib/rateLimit.js

/**
 * In-memory sliding window rate limiter for serverless execution & development.
 * Maps IP/identifier to an array of timestamps.
 */
class MemoryRateLimiter {
  constructor() {
    /** @type {Map<string, number[]>} */
    this.hits = new Map();
    this.cleanupInterval = 60 * 1000; // 1 minute
    this.lastCleanup = Date.now();
  }

  /**
   * Periodically clean up entries with all timestamps older than max window
   */
  _cleanup(windowMs) {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;
    this.lastCleanup = now;

    for (const [key, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }

  /**
   * Check and record a hit for an identifier
   * @param {string} identifier - e.g. IP address or email
   * @param {number} limit - maximum requests allowed in window
   * @param {number} windowMs - time window in milliseconds
   * @returns {{ success: boolean, limit: number, remaining: number, resetTime: number }}
   */
  check(identifier, limit = 10, windowMs = 60000) {
    const now = Date.now();
    this._cleanup(windowMs);

    const timestamps = (this.hits.get(identifier) || []).filter((t) => now - t < windowMs);
    const resetTime = timestamps.length > 0 ? timestamps[0] + windowMs : now + windowMs;

    if (timestamps.length >= limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        resetTime,
      };
    }

    timestamps.push(now);
    this.hits.set(identifier, timestamps);

    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - timestamps.length),
      resetTime,
    };
  }

  /**
   * Reset all rate limit records (useful for testing)
   */
  reset() {
    this.hits.clear();
    this.lastCleanup = Date.now();
  }
}

// Global singleton to persist across warm serverless invocations
const globalForLimiter = globalThis;
if (!globalForLimiter.__rateLimiter) {
  globalForLimiter.__rateLimiter = new MemoryRateLimiter();
}
export const limiter = globalForLimiter.__rateLimiter;

/**
 * Extract client IP address from incoming request headers
 * @param {any} req
 * @returns {string}
 */
export function getClientIp(req) {
  if (!req) return '127.0.0.1';

  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientIp = ips.split(',')[0].trim();
    if (clientIp) return clientIp;
  }

  const realIp = req.headers?.['x-real-ip'] || req.headers?.['cf-connecting-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

/**
 * Convenient helper to rate limit a request by IP
 * @param {any} req
 * @param {{ limit?: number, windowMs?: number, prefix?: string }} [options]
 */
export function checkRateLimit(req, { limit = 5, windowMs = 60000, prefix = 'general' } = {}) {
  const ip = getClientIp(req);
  const identifier = `${prefix}:${ip}`;
  return limiter.check(identifier, limit, windowMs);
}
