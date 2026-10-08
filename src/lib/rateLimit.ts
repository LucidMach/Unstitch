// src/lib/rateLimit.ts

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
}

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  prefix?: string;
}

/**
 * In-memory sliding window rate limiter for serverless execution & development.
 * Maps IP/identifier to an array of timestamps.
 */
class MemoryRateLimiter {
  hits: Map<string, number[]>;
  cleanupInterval: number;
  lastCleanup: number;

  constructor() {
    this.hits = new Map();
    this.cleanupInterval = 60 * 1000; // 1 minute
    this.lastCleanup = Date.now();
  }

  /**
   * Periodically clean up entries with all timestamps older than max window
   */
  _cleanup(windowMs: number): void {
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
   */
  check(identifier: string, limit: number = 10, windowMs: number = 60000): RateLimitResult {
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
  reset(): void {
    this.hits.clear();
    this.lastCleanup = Date.now();
  }
}

// Global singleton to persist across warm serverless invocations
const globalForLimiter = globalThis as unknown as { __rateLimiter?: MemoryRateLimiter };
if (!globalForLimiter.__rateLimiter) {
  globalForLimiter.__rateLimiter = new MemoryRateLimiter();
}
export const limiter = globalForLimiter.__rateLimiter;

/**
 * Extract client IP address from incoming request headers
 */
export function getClientIp(req: any): string {
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
 */
export function checkRateLimit(
  req: any,
  { limit = 5, windowMs = 60000, prefix = 'general' }: RateLimitOptions = {}
): RateLimitResult {
  const ip = getClientIp(req);
  const identifier = `${prefix}:${ip}`;
  return limiter.check(identifier, limit, windowMs);
}

