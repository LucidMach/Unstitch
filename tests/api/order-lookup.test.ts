import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import orderLookupHandler from '../../api/order-lookup.js';
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

function reqWithToken(token?: string) {
  const url = token ? `/api/order-lookup?token=${encodeURIComponent(token)}` : '/api/order-lookup';
  return { method: 'GET', url };
}

const SAMPLE_ORDER = {
  id: 'order-1',
  orderNumber: 'UX-2026-000001',
  status: 'PAID',
  totalCents: 12345,
  currency: 'AUD',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  customerId: 'cust-1',
  items: [
    {
      product: { name: 'Slow Bloom Kit' },
      quantity: 1,
      lineTotalCents: 12345,
    },
  ],
  deliveryAddress: {
    recipientName: 'Jane Doe',
    line1: '1 Example St',
    line2: null,
    suburb: 'Melbourne',
    state: 'VIC',
    postcode: '3000',
    country: 'AU',
  },
};

describe('order-lookup API handler (/api/order-lookup)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-order-lookup';
  });

  it('rejects non-GET HTTP methods with 405', async () => {
    const req = { method: 'POST', url: '/api/order-lookup' };
    const res = createMockRes();

    await orderLookupHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('GET');
  });

  it('returns 400 when the token query param is missing', async () => {
    const res = createMockRes();
    await orderLookupHandler(reqWithToken(), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for a malformed/invalid token', async () => {
    const res = createMockRes();
    await orderLookupHandler(reqWithToken('not-a-real-token'), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the token kind is not "order-lookup"', async () => {
    const token = sign({ kind: 'passport-transfer', orderId: 'order-1' }, 60);
    const res = createMockRes();
    await orderLookupHandler(reqWithToken(token), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when the token has neither orderId nor customerId', async () => {
    const token = sign({ kind: 'order-lookup' }, 60);
    const res = createMockRes();
    await orderLookupHandler(reqWithToken(token), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid link.');
  });

  it('an orderId-scoped token returns exactly that order, sanitized', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(SAMPLE_ORDER as any);
    const token = sign({ kind: 'order-lookup', orderId: 'order-1' }, 60);
    const res = createMockRes();

    await orderLookupHandler(reqWithToken(token), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0]).toEqual({
      orderNumber: 'UX-2026-000001',
      status: 'PAID',
      totalCents: 12345,
      currency: 'AUD',
      createdAt: SAMPLE_ORDER.createdAt,
      items: [{ productName: 'Slow Bloom Kit', quantity: 1, lineTotalCents: 12345 }],
      deliveryAddress: {
        recipientName: 'Jane Doe',
        line1: '1 Example St',
        line2: null,
        suburb: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        country: 'AU',
      },
    });
    // Never leaks the internal customerId to the client.
    expect(res.body.orders[0].customerId).toBeUndefined();
  });

  it('returns 404 when the orderId-scoped token points at a nonexistent order', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
    const token = sign({ kind: 'order-lookup', orderId: 'ghost-order' }, 60);
    const res = createMockRes();

    await orderLookupHandler(reqWithToken(token), res);
    expect(res.statusCode).toBe(404);
  });

  it('a customerId-scoped token returns all of that customer\'s orders', async () => {
    const secondOrder = { ...SAMPLE_ORDER, id: 'order-2', orderNumber: 'UX-2026-000002' };
    const findManySpy = vi.spyOn(prisma.order, 'findMany').mockResolvedValue([SAMPLE_ORDER, secondOrder] as any);
    const token = sign({ kind: 'order-lookup', customerId: 'cust-1' }, 60);
    const res = createMockRes();

    await orderLookupHandler(reqWithToken(token), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.orders).toHaveLength(2);
    expect(res.body.orders.map((o: any) => o.orderNumber)).toEqual(['UX-2026-000001', 'UX-2026-000002']);
    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'cust-1' } })
    );
  });

  it('a customerId-scoped token with zero orders returns an empty list (not 404)', async () => {
    vi.spyOn(prisma.order, 'findMany').mockResolvedValue([]);
    const token = sign({ kind: 'order-lookup', customerId: 'cust-with-no-orders' }, 60);
    const res = createMockRes();

    await orderLookupHandler(reqWithToken(token), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.orders).toEqual([]);
  });

  it('returns 500 when the database lookup throws', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockRejectedValue(new Error('DB down'));
    const token = sign({ kind: 'order-lookup', orderId: 'order-1' }, 60);
    const res = createMockRes();

    await orderLookupHandler(reqWithToken(token), res);
    expect(res.statusCode).toBe(500);
  });
});
