import { describe, it, expect } from 'vitest';
import { SubscribeSchema } from '../../src/lib/schemas/subscribe.js';

describe('SubscribeSchema validation', () => {
  it('validates and normalizes valid subscriber payload', () => {
    const payload = {
      name: '  Sam Wilson  ',
      email: '  SAM@Example.COM  ',
      source: 'shop-signup',
      _gotcha: '',
    };

    const result = SubscribeSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('sam@example.com');
      expect(result.data.name).toBe('Sam Wilson');
      expect(result.data.source).toBe('shop-signup');
    }
  });

  it('defaults source to newsletter if omitted', () => {
    const payload = {
      email: 'user@test.org',
    };

    const result = SubscribeSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('newsletter');
      expect(result.data.name).toBeNull();
    }
  });

  it('rejects invalid email formats', () => {
    const bad = ['', 'plainaddress', '#@%^%#$@#$@#.com', '@example.com'];
    for (const email of bad) {
      const res = SubscribeSchema.safeParse({ email });
      expect(res.success).toBe(false);
    }
  });

  it('rejects bot submission when _gotcha is non-empty', () => {
    const res = SubscribeSchema.safeParse({
      email: 'bot@spam.com',
      _gotcha: 'automated-submission',
    });
    expect(res.success).toBe(false);
  });
});
