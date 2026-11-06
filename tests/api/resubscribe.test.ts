// src/server/resubscribe.js -- the only code path allowed to clear
// Subscriber.unsubscribedAt. Mirrors tests/api/unsubscribe.test.ts.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import resubscribeHandler from '../../src/server/resubscribe.js';
import { sign } from '../../src/lib/signedToken.js';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key: string, val: string) {
      res.headers[key.toLowerCase()] = val;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
    end(data?: any) {
      if (data) {
        try {
          res.body = JSON.parse(data);
        } catch {
          res.body = data;
        }
      }
      return res;
    },
  };
  return res;
}

function mintToken(overrides: Record<string, any> = {}, ttlSeconds = 3600) {
  return sign({ kind: 'unsubscribe', subscriberId: 's1', ...overrides }, ttlSeconds);
}

describe('/api/resubscribe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-resubscribe';
  });

  it('rejects non-GET methods with 405', async () => {
    const req = { method: 'POST', url: '/api/resubscribe' };
    const res = createMockRes();
    await resubscribeHandler(req as any, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when the token is missing', async () => {
    const req = { method: 'GET', url: '/api/resubscribe' };
    const res = createMockRes();
    await resubscribeHandler(req as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('clears unsubscribedAt on a valid token', async () => {
    const updateSpy = vi.spyOn(prisma.subscriber, 'update').mockResolvedValue({} as any);
    const token = mintToken();
    const req = { method: 'GET', url: `/api/resubscribe?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await resubscribeHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { unsubscribedAt: null },
    });
  });

  it('rejects an expired token', async () => {
    const token = mintToken({}, -10);
    const req = { method: 'GET', url: `/api/resubscribe?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await resubscribeHandler(req as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const token = mintToken();
    const [payloadB64, signature] = token.split('.');
    const flippedChar = signature[0] === 'a' ? 'b' : 'a';
    const tampered = `${payloadB64}.${flippedChar}${signature.slice(1)}`;
    const req = { method: 'GET', url: `/api/resubscribe?token=${encodeURIComponent(tampered)}` };
    const res = createMockRes();
    await resubscribeHandler(req as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token with the wrong kind -- e.g. an admin session token', async () => {
    const token = sign({ kind: 'admin', role: 'admin' }, 3600);
    const req = { method: 'GET', url: `/api/resubscribe?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await resubscribeHandler(req as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when the subscriber row no longer exists -- unlike unsubscribe, there is nothing to undo', async () => {
    const err: any = new Error('Record not found');
    err.code = 'P2025';
    vi.spyOn(prisma.subscriber, 'update').mockRejectedValue(err);
    const token = mintToken();
    const req = { method: 'GET', url: `/api/resubscribe?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await resubscribeHandler(req as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on an unexpected database error', async () => {
    vi.spyOn(prisma.subscriber, 'update').mockRejectedValue(new Error('Connection timeout'));
    const token = mintToken();
    const req = { method: 'GET', url: `/api/resubscribe?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await resubscribeHandler(req as any, res);
    expect(res.statusCode).toBe(500);
  });
});
