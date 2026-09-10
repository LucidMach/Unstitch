import { describe, it, expect, beforeEach, vi } from 'vitest';
import { limiter, getClientIp, checkRateLimit } from '../../src/lib/rateLimit.js';

describe('Sliding Window Rate Limiter', () => {
  beforeEach(() => {
    limiter.reset();
  });

  it('allows requests within limit and decrements remaining', () => {
    const ip = '192.168.1.1';
    const limit = 3;

    const res1 = limiter.check(ip, limit, 60000);
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = limiter.check(ip, limit, 60000);
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = limiter.check(ip, limit, 60000);
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);

    // 4th request exceeds limit
    const res4 = limiter.check(ip, limit, 60000);
    expect(res4.success).toBe(false);
    expect(res4.remaining).toBe(0);
  });

  it('isolates different IP identifiers', () => {
    const ipA = '10.0.0.1';
    const ipB = '10.0.0.2';
    const limit = 2;

    limiter.check(ipA, limit, 60000);
    limiter.check(ipA, limit, 60000);
    expect(limiter.check(ipA, limit, 60000).success).toBe(false);

    // ipB should still be allowed
    expect(limiter.check(ipB, limit, 60000).success).toBe(true);
  });

  it('resets window after time elapses', () => {
    vi.useFakeTimers();
    const ip = '172.16.0.1';
    const limit = 2;
    const windowMs = 5000;

    limiter.check(ip, limit, windowMs);
    limiter.check(ip, limit, windowMs);
    expect(limiter.check(ip, limit, windowMs).success).toBe(false);

    // Advance time past windowMs
    vi.advanceTimersByTime(5001);

    expect(limiter.check(ip, limit, windowMs).success).toBe(true);
    vi.useRealTimers();
  });

  describe('getClientIp helper', () => {
    it('extracts IP from x-forwarded-for header', () => {
      const req = { headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' } };
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('extracts IP from x-real-ip header', () => {
      const req = { headers: { 'x-real-ip': '198.51.100.4' } };
      expect(getClientIp(req)).toBe('198.51.100.4');
    });

    it('falls back to 127.0.0.1 if no IP available', () => {
      expect(getClientIp({})).toBe('127.0.0.1');
    });
  });

  describe('checkRateLimit integration helper', () => {
    it('applies prefix and throttles request', () => {
      const req = { headers: { 'x-real-ip': '1.2.3.4' } };
      for (let i = 0; i < 5; i++) {
        const res = checkRateLimit(req, { limit: 5, prefix: 'contact' });
        expect(res.success).toBe(true);
      }

      const blockRes = checkRateLimit(req, { limit: 5, prefix: 'contact' });
      expect(blockRes.success).toBe(false);
    });
  });
});
