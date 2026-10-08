// src/server/order-lookup-by-number.js (the order-number + email instant
// lookup, added in the pull this session reviewed) had zero test coverage.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import orderLookupByNumberHandler from '../../src/server/order-lookup-by-number.js';
import { limiter } from '../../src/lib/rateLimit.js';

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

const SAMPLE_ORDER = {
  id: 'order-1',
  orderNumber: 'UX-2026-000001',
  status: 'PAID',
  totalCents: 12345,
  currency: 'AUD',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  customerId: 'cust-1',
  customer: { email: 'jane@example.com' },
  items: [{ product: { name: 'Slow Bloom Kit' }, quantity: 1, lineTotalCents: 12345 }],
  deliveryAddress: null,
};

describe('/api/order-lookup-by-number', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
  });

  it('rejects non-POST methods with 405', async () => {
    const req = { method: 'GET' };
    const res = createMockRes();
    await orderLookupByNumberHandler(req as any, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 for a malformed request body', async () => {
    const req = { method: 'POST', body: { orderNumber: '', email: 'not-an-email' } };
    const res = createMockRes();
    await orderLookupByNumberHandler(req as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns the sanitized order when the order number and email both match', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(SAMPLE_ORDER as any);
    const req = { method: 'POST', body: { orderNumber: 'ux-2026-000001', email: 'JANE@EXAMPLE.COM' } };
    const res = createMockRes();
    await orderLookupByNumberHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].orderNumber).toBe('UX-2026-000001');
  });

  it("returns a generic 404 when the order exists but the email doesn't match (not 'wrong email' vs 'wrong number')", async () => {
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(SAMPLE_ORDER as any);
    const req = { method: 'POST', body: { orderNumber: 'UX-2026-000001', email: 'someone-else@example.com' } };
    const res = createMockRes();
    await orderLookupByNumberHandler(req as any, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/couldn't find/i);
  });

  it('returns the same generic 404 when the order number does not exist at all', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
    const req = { method: 'POST', body: { orderNumber: 'UX-2026-999999', email: 'jane@example.com' } };
    const res = createMockRes();
    await orderLookupByNumberHandler(req as any, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/couldn't find/i);
  });

  it('returns 429 after exceeding the rate limit', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
    const req = { method: 'POST', body: { orderNumber: 'UX-2026-000001', email: 'jane@example.com' } };
    for (let i = 0; i < 8; i++) {
      await orderLookupByNumberHandler(req as any, createMockRes());
    }
    const res = createMockRes();
    await orderLookupByNumberHandler(req as any, res);
    expect(res.statusCode).toBe(429);
  });

  it('returns 500 on an unexpected database error', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockRejectedValue(new Error('Connection timeout'));
    const req = { method: 'POST', body: { orderNumber: 'UX-2026-000001', email: 'jane@example.com' } };
    const res = createMockRes();
    await orderLookupByNumberHandler(req as any, res);
    expect(res.statusCode).toBe(500);
  });
});
