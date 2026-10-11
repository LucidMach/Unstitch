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

    it('includes the active product list (for the kit block picker) and saved drafts (for the composer to restore)', async () => {
      vi.spyOn(prisma.subscriber, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.subscriber, 'groupBy').mockResolvedValue([] as any);
      const product = { id: PRODUCT_ID, name: 'Slow Bloom', tagline: 't', imageUrl: 'x', basePriceCents: 1000, currency: 'aud', kitContents: [] };
      vi.spyOn(prisma.product, 'findMany').mockResolvedValue([product] as any);
      vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null);

      const req = { method: 'GET', headers: { cookie: adminCookieHeader() } };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.products).toEqual([product]);
      expect(res.body.drafts).toEqual({ general: null, waitlist: {} });
    });

    it('hands back a previously saved general draft and per-product waitlist drafts', async () => {
      vi.spyOn(prisma.subscriber, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.subscriber, 'groupBy').mockResolvedValue([] as any);
      vi.spyOn(prisma.product, 'findMany').mockResolvedValue([] as any);
      const generalDraft = { subject: 'Draft subject', blocks: [{ type: 'text', heading: 'h' }], savedAt: '2026-01-01T00:00:00.000Z' };
      const waitlistDraftMap = { [PRODUCT_ID]: { subject: 'WL draft', blocks: [], savedAt: '2026-01-02T00:00:00.000Z' } };
      vi.spyOn(prisma.setting, 'findUnique').mockImplementation(async ({ where }: any) => {
        if (where.key === 'broadcast_draft_general') return { key: where.key, value: JSON.stringify(generalDraft) } as any;
        if (where.key === 'broadcast_draft_waitlist') return { key: where.key, value: JSON.stringify(waitlistDraftMap) } as any;
        return null;
      });

      const req = { method: 'GET', headers: { cookie: adminCookieHeader() } };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.drafts.general).toEqual(generalDraft);
      expect(res.body.drafts.waitlist).toEqual(waitlistDraftMap);
    });
  });

  describe('POST mode: general', () => {
    it('previews against a sample subscriber without sending', async () => {
      vi.spyOn(prisma.subscriber, 'findFirst').mockResolvedValue(subscriber() as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'general', subject: 'Hi {name}', blocks: [{ type: 'text', body: 'Thanks for subscribing, {name}!' }], preview: true },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.preview).toBe(true);
      expect(res.body.html).toContain('Alex');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('mixes a text block, a kit announcement, and a cta block in one send', async () => {
      vi.spyOn(prisma.subscriber, 'findFirst').mockResolvedValue(subscriber() as any);
      vi.spyOn(prisma.product, 'findMany').mockResolvedValue([
        { id: PRODUCT_ID, name: 'Slow Bloom Kit', tagline: 't', imageUrl: 'https://unstitchx.com/slow-bloom-hero.jpg', basePriceCents: 4999, currency: 'aud', kitContents: [] },
      ] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: {
          mode: 'general',
          subject: 'Big update',
          preview: true,
          blocks: [
            { type: 'text', heading: 'Behind the scenes', body: 'Some **bold** news.' },
            { type: 'kit', productId: PRODUCT_ID, buttonLabel: 'Add to bag', buttonUrl: '/shop' },
            { type: 'cta', heading: 'School enquiries', body: 'Teachers, reach out!', buttonLabel: 'Email us', buttonUrl: 'https://unstitchx.com/contact' },
          ],
        },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.html).toContain('<strong>bold</strong>');
      expect(res.body.html).toContain('New drop: Slow Bloom Kit');
      expect(res.body.html).toContain('Add to bag');
      expect(res.body.html).toContain('School enquiries');
    });

    it('sends to every non-unsubscribed subscriber and returns a count', async () => {
      vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([subscriber(), subscriber({ id: 's2', email: 'bo@example.com' })] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'general', subject: 'Update', blocks: [{ type: 'text', body: 'New drop soon.' }] },
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
        body: { mode: 'general', subject: 'Update', blocks: [{ type: 'text', body: 'New drop soon.' }] },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('rejects an empty subject/empty block list before touching the database', async () => {
      const findManySpy = vi.spyOn(prisma.subscriber, 'findMany');
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'general', subject: '', blocks: [] },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(400);
      expect(findManySpy).not.toHaveBeenCalled();
    });

    it('rejects a kit block whose product no longer exists', async () => {
      vi.spyOn(prisma.product, 'findMany').mockResolvedValue([] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'general', subject: 'Update', blocks: [{ type: 'kit', productId: PRODUCT_ID }] },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('POST mode: waitlist', () => {
    it('previews against a sample waitlist subscriber for the given product', async () => {
      vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ id: PRODUCT_ID, name: 'Slow Bloom' } as any);
      vi.spyOn(prisma.subscriber, 'findFirst').mockResolvedValue(subscriber() as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'It is live', blocks: [{ type: 'text', body: 'Hi {name}, it is here.' }], preview: true },
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
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'x', blocks: [{ type: 'text', body: 'y' }] },
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
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'x', blocks: [{ type: 'text', body: 'y' }] },
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
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'It is live', blocks: [{ type: 'text', body: 'Hi {name}.' }] },
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
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'It is live', blocks: [{ type: 'text', body: 'Hi.' }] },
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
        body: { mode: 'waitlist', productId: PRODUCT_ID, subject: 'It is live', blocks: [{ type: 'text', body: 'Hi.' }] },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(findManySpy).toHaveBeenCalledWith({
        where: { productId: PRODUCT_ID, notifiedAt: null, unsubscribedAt: null },
        select: { id: true, name: true, email: true },
      });
    });
  });

  describe('POST mode: save-draft / clear-draft', () => {
    it('saves a general draft to the Setting table and returns a savedAt timestamp', async () => {
      const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'save-draft', kind: 'general', subject: 'Draft subject', blocks: [{ type: 'text', heading: 'h' }] },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.savedAt).toBe('string');
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      const call = upsertSpy.mock.calls[0][0] as any;
      expect(call.where).toEqual({ key: 'broadcast_draft_general' });
      const saved = JSON.parse(call.update.value);
      expect(saved.subject).toBe('Draft subject');
      expect(saved.blocks).toEqual([{ type: 'text', heading: 'h' }]);
    });

    it('does not require RESEND_API_KEY to save a draft', async () => {
      delete process.env.RESEND_API_KEY;
      vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'save-draft', kind: 'general', subject: 's', blocks: [] },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);
      expect(res.statusCode).toBe(200);
    });

    it('requires a productId for a waitlist draft', async () => {
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'save-draft', kind: 'waitlist', subject: 's', blocks: [] },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);
      expect(res.statusCode).toBe(400);
    });

    it('saves a waitlist draft under its productId without clobbering another product\'s saved draft', async () => {
      const existing = { other: { subject: 'Other draft', blocks: [], savedAt: '2026-01-01T00:00:00.000Z' } };
      vi.spyOn(prisma.setting, 'findUnique').mockImplementation(async ({ where }: any) =>
        where.key === 'broadcast_draft_waitlist' ? ({ key: where.key, value: JSON.stringify(existing) } as any) : null,
      );
      const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'save-draft', kind: 'waitlist', productId: PRODUCT_ID, subject: 'New draft', blocks: [{ type: 'text', heading: 'h' }] },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      const call = upsertSpy.mock.calls[0][0] as any;
      const savedMap = JSON.parse(call.update.value);
      expect(Object.keys(savedMap)).toEqual(expect.arrayContaining(['other', PRODUCT_ID]));
      expect(savedMap[PRODUCT_ID].subject).toBe('New draft');
      expect(savedMap.other).toEqual(existing.other);
    });

    it('clears a general draft by deleting its Setting row', async () => {
      const deleteManySpy = vi.spyOn(prisma.setting, 'deleteMany').mockResolvedValue({ count: 1 } as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'clear-draft', kind: 'general' },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(deleteManySpy).toHaveBeenCalledWith({ where: { key: 'broadcast_draft_general' } });
    });

    it('clears only the named product\'s waitlist draft, leaving others saved', async () => {
      const existing = { other: { subject: 'Other draft', blocks: [], savedAt: '2026-01-01T00:00:00.000Z' }, [PRODUCT_ID]: { subject: 'Mine', blocks: [], savedAt: '2026-01-02T00:00:00.000Z' } };
      vi.spyOn(prisma.setting, 'findUnique').mockImplementation(async ({ where }: any) =>
        where.key === 'broadcast_draft_waitlist' ? ({ key: where.key, value: JSON.stringify(existing) } as any) : null,
      );
      const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'clear-draft', kind: 'waitlist', productId: PRODUCT_ID },
      };
      const res = createMockRes();
      await broadcastHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      const call = upsertSpy.mock.calls[0][0] as any;
      const savedMap = JSON.parse(call.update.value);
      expect(savedMap).toEqual({ other: existing.other });
    });
  });

  it('returns 429 after exceeding the broadcast rate limit', async () => {
    vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([] as any);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { mode: 'general', subject: 'x', blocks: [{ type: 'text', body: 'y' }] },
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
