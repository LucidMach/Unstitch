import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_SECRET = process.env.SESSION_SECRET;

describe('signedToken (sign/verify)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_SECRET = 'test-secret-for-signed-token-tests';
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = ORIGINAL_SECRET;
    }
  });

  it('round-trips a signed payload with verify', async () => {
    const { sign, verify } = await import('../../src/lib/signedToken.js');
    const token = sign({ kind: 'order-lookup', orderId: 42 }, 60);
    const payload = verify(token);
    expect(payload).not.toBeNull();
    expect(payload!.kind).toBe('order-lookup');
    expect(payload!.orderId).toBe(42);
    expect(typeof payload!.exp).toBe('number');
  });

  it('rejects a token whose signature has been tampered with', async () => {
    const { sign, verify } = await import('../../src/lib/signedToken.js');
    const token = sign({ kind: 'order-lookup', orderId: 42 }, 60);
    const [payloadB64, signature] = token.split('.');
    // Flip one character in the signature
    const flippedChar = signature[0] === 'a' ? 'b' : 'a';
    const tampered = `${payloadB64}.${flippedChar}${signature.slice(1)}`;
    expect(verify(tampered)).toBeNull();
  });

  it('rejects a token whose payload has been tampered with', async () => {
    const { sign, verify } = await import('../../src/lib/signedToken.js');
    const token = sign({ kind: 'order-lookup', orderId: 42 }, 60);
    const [payloadB64, signature] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ kind: 'order-lookup', orderId: 999, exp: Math.floor(Date.now() / 1000) + 60 }),
      'utf8'
    ).toString('base64url');
    const tampered = `${tamperedPayload}.${signature}`;
    expect(verify(tampered)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { sign, verify } = await import('../../src/lib/signedToken.js');
    const token = sign({ kind: 'order-lookup', orderId: 42 }, -10); // already expired
    expect(verify(token)).toBeNull();
  });

  it('returns null for a malformed token with no "." separator', async () => {
    const { verify } = await import('../../src/lib/signedToken.js');
    expect(verify('not-a-valid-token-at-all')).toBeNull();
  });

  it('returns null for garbage base64 payload', async () => {
    const { verify } = await import('../../src/lib/signedToken.js');
    expect(verify('!!!not-base64!!!.somesignature')).toBeNull();
  });

  it('returns null for undefined/null/empty token input', async () => {
    const { verify } = await import('../../src/lib/signedToken.js');
    expect(verify(undefined)).toBeNull();
    expect(verify(null)).toBeNull();
    expect(verify('')).toBeNull();
  });

  it('does not throw when SESSION_SECRET is missing, sign throws and verify returns null', async () => {
    delete process.env.SESSION_SECRET;
    const { sign, verify } = await import('../../src/lib/signedToken.js');

    expect(() => sign({ kind: 'order-lookup' }, 60)).toThrow(/SESSION_SECRET/);
    expect(verify('anything.at-all')).toBeNull();
  });
});
