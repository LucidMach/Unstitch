// src/server/admin/broadcast.js (newsletter + per-drop waitlist sends) had
// zero test coverage before this file -- not even the baseline "forgot
// requireAdmin()" check admin-authz.test.ts guards every other admin
// endpoint with. Covers GET stats, both POST modes' preview/send/validation
// paths, and the notifiedAt-batching fixed in this pass.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import broadcastHandler from '../../src/server/admin/broadcast.js';
import { buildAdminSessionCookie } from '../../src/lib/adminAuth.js';
import { limiter } from '../../src/lib/rateLimit.js';

const mockSend = vi.fn().mockResolvedValue({ id: 'mock-email-id' });
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: (...args: any[]) => mockSend(...args),
    };
  },
}));

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

function adminCookieHeader() {
  return buildAdminSessionCookie().split(';')[0];
}

const PRODUCT_ID = 'a0000000-0000-4000-8000-000000000001';

function subscriber(overrides: Record<string, any> = {}) {
  return { id: 's1', name: 'Alex', email: 'alex@example.com', ...overrides };
}

describe('admin/broadcast API handler', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
    mockSend.mockClear();
    process.env.SESSION_SECRET = 'test-secret-for-admin-broadcast';
    process.env.RESEND_API_KEY = 'test-resend-key';
  });

  it('returns 401 without a valid admin session', async () => {
    const req = { method: 'GET', headers: {} };
    const res = createMockRes();
    await broadcastHandler(req as any, res);
    expect(res.statusCode).toBe(401);
  });

  describe('GET (stats)', () => {
    it('returns the general subscriber count and per-product waitlist stats', async () => {
      vi.spyOn(prisma.subscriber, 'count').mockResolvedValue(42);
      vi.spyOn(prisma.subscriber, 'groupBy').mockResolvedValue([
        { productId: PRODUCT_ID, _count: { _all: 7 } },
      ] as any);
      vi.spyOn(prisma.product, 'findMany').mockResolvedValue([{ id: PRODUCT_ID, name: 'Slow Bloom' }] as any);

      const req = { method: 'GET', headers: { cookie: adminCookieHeader() } };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.generalCount).toBe(42);
      expect(res.body.waitlists).toEqual([{ productId: PRODUCT_ID, productName: 'Slow Bloom', pendingCount: 7 }]);
    });
  });

  describe('POST mode: general', () => {
    it('previews against a sample subscriber without sending', async () => {
      vi.spyOn(prisma.subscriber, 'findFirst').mockResolvedValue(subscriber() as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'general', subject: 'Hi {name}', message: 'Thanks for subscribing, {name}!', preview: true },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.preview).toBe(true);
      expect(res.body.html).toContain('Alex');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends to every non-unsubscribed subscriber and returns a count', async () => {
      vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([subscriber(), subscriber({ id: 's2', email: 'bo@example.com' })] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'general', subject: 'Update', message: 'New drop soon.' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.sent).toBe(2);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend.mock.calls[0][0].from).toContain('hello@unstitchx.com');
    });

    it('returns 400 when there are no subscribers to send to', async () => {
      vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'general', subject: 'Update', message: 'New drop soon.' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('rejects an empty subject/message before touching the database', async () => {
      const findManySpy = vi.spyOn(prisma.subscriber, 'findMany');
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'general', subject: '', message: '' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(400);
      expect(findManySpy).not.toHaveBeenCalled();
    });
  });

  describe('POST mode: waitlist', () => {
    it('previews against a sample waitlist subscriber for the given product', async () => {
      vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ id: PRODUCT_ID, name: 'Slow Bloom' } as any);
      vi.spyOn(prisma.subscriber, 'findFirst').mockResolvedValue(subscriber() as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'It is live', message: 'Hi {name}, it is here.', preview: true },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.preview).toBe(true);
      expect(res.body.productName).toBe('Slow Bloom');
    });

    it('returns 404 for an unknown product', async () => {
      vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'x', message: 'y' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when nobody is waiting on this product', async () => {
      vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ id: PRODUCT_ID, name: 'Slow Bloom' } as any);
      vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'x', message: 'y' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);
      expect(res.statusCode).toBe(400);
    });

    it('sends to the waitlist and marks every successful recipient notified in one batched updateMany', async () => {
      vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ id: PRODUCT_ID, name: 'Slow Bloom' } as any);
      vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([
        subscriber({ id: 's1' }),
        subscriber({ id: 's2', email: 'bo@example.com' }),
      ] as any);
      const updateSpy = vi.spyOn(prisma.subscriber, 'update');
      const updateManySpy = vi.spyOn(prisma.subscriber, 'updateMany').mockResolvedValue({ count: 2 } as any);

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'It is live', message: 'Hi {name}.' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.sent).toBe(2);
      expect(mockSend.mock.calls[0][0].from).toContain('hello@unstitchx.com');
      // The fix in this pass: one updateMany for the whole batch, never a
      // per-recipient update() call.
      expect(updateSpy).not.toHaveBeenCalled();
      expect(updateManySpy).toHaveBeenCalledTimes(1);
      expect(updateManySpy).toHaveBeenCalledWith({
        where: { id: { in: ['s1', 's2'] } },
        data: { notifiedAt: expect.any(Date) },
      });
    });

    it('does not mark anyone notified when every send fails, and never calls updateMany with an empty list', async () => {
      vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ id: PRODUCT_ID, name: 'Slow Bloom' } as any);
      vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([subscriber()] as any);
      mockSend.mockResolvedValueOnce({ error: { message: 'Resend rejected it' } });
      const updateManySpy = vi.spyOn(prisma.subscriber, 'updateMany');

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'It is live', message: 'Hi.' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.sent).toBe(0);
      expect(res.body.failed).toHaveLength(1);
      expect(updateManySpy).not.toHaveBeenCalled();
    });

    it("only notifies subscribers for this product who haven't already been notified or unsubscribed", async () => {
      vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ id: PRODUCT_ID, name: 'Slow Bloom' } as any);
      const findManySpy = vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([subscriber()] as any);
      vi.spyOn(prisma.subscriber, 'updateMany').mockResolvedValue({ count: 1 } as any);

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'It is live', message: 'Hi.' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(findManySpy).toHaveBeenCalledWith({
        where: { productId: PRODUCT_ID, notifiedAt: null, unsubscribedAt: null },
        select: { id: true, name: true, email: true },
      });
    });
  });

  it('returns 429 after exceeding the broadcast rate limit', async () => {
    vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([] as any);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { mode: 'general', subject: 'x', message: 'y' },
    };
    for (let i = 0; i < 10; i++) {
      await broadcastHandler(req as any, createMockRes());
    }
    const res = createMockRes();
    await broadcastHandler(req as any, res);
    expect(res.statusCode).toBe(429);
  });

  it('returns 400 for an unknown mode', async () => {
    const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { mode: 'not-a-real-mode' } };
    const res = createMockRes();
    await broadcastHandler(req as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 405 for an unsupported method', async () => {
    const req = { method: 'DELETE', headers: { cookie: adminCookieHeader() } };
    const res = createMockRes();
    await broadcastHandler(req as any, res);
    expect(res.statusCode).toBe(405);
  });
});
