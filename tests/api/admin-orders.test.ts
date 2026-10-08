// src/server/admin/orders.js had no dedicated test file at all before this
// one -- every action (mark-paid, mark-shipped, mark-delivered,
// update-tracking, update-ship-date, delete-test-order,
// update-order-details) was only exercised indirectly, if at all, via
// admin-authz.test.ts's "rejects with no session" check. This covers the
// actual business logic of each action, with extra depth on mark-delivered
// (status-guard bug fixed in this pass) and update-ship-date (the
// deliberate "no floor, admin's call" behavior documented in the source).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import ordersHandler from '../../src/server/admin/orders.js';
import { buildAdminSessionCookie } from '../../src/lib/adminAuth.js';

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

const ORDER_ID = 'a0000000-0000-4000-8000-000000000001';

function baseOrder(overrides: Record<string, any> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: 'UX-2026-000001',
    status: 'PAID',
    totalCents: 2900,
    currency: 'AUD',
    shippedAt: null,
    deliveredAt: null,
    trackingNumber: null,
    deliveryAddressId: null,
    deliveryAddress: null,
    customer: { email: 'buyer@example.com', name: 'Buyer' },
    ...overrides,
  };
}

describe('admin/orders API handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSend.mockClear();
    process.env.SESSION_SECRET = 'test-secret-for-admin-orders';
    process.env.RESEND_API_KEY = 'test-resend-key';
    // mark-paid and delete-test-order use prisma.$transaction. The array
    // form just needs its entries resolved together; the callback form
    // (tx) => {...} is given `prisma` itself as `tx` so the usual
    // vi.spyOn(prisma.model, ...) mocks underneath still apply.
    vi.spyOn(prisma, '$transaction').mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
    );
  });

  describe('GET', () => {
    it('returns 401 without a valid admin session', async () => {
      const req = { method: 'GET', headers: {}, url: '/api/admin/orders' };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(401);
    });

    it('returns one order with full detail when ?id= is given', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder() as any);
      const req = { method: 'GET', headers: { cookie: adminCookieHeader() }, url: `/api/admin/orders?id=${ORDER_ID}` };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.order.id).toBe(ORDER_ID);
    });

    it('returns 404 for an unknown order id', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
      const req = { method: 'GET', headers: { cookie: adminCookieHeader() }, url: `/api/admin/orders?id=${ORDER_ID}` };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(404);
    });

    it('returns a summarized order list with no ?id=', async () => {
      vi.spyOn(prisma.order, 'findMany').mockResolvedValue([baseOrder()] as any);
      const req = { method: 'GET', headers: { cookie: adminCookieHeader() }, url: '/api/admin/orders' };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.orders).toHaveLength(1);
    });
  });

  describe('mark-paid', () => {
    it('moves a PENDING_PAYMENT order to PAID and records a Payment', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ status: 'PENDING_PAYMENT' }) as any);
      vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder({ status: 'PAID' }) as any);
      const paymentCreateSpy = vi.spyOn(prisma.payment, 'create').mockResolvedValue({} as any);

      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-paid', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.order.status).toBe('PAID');
      expect(paymentCreateSpy).toHaveBeenCalled();
    });

    it('rejects marking an already-PAID order as paid again', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ status: 'PAID' }) as any);
      const updateSpy = vi.spyOn(prisma.order, 'update');

      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-paid', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown order', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-paid', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('mark-shipped', () => {
    it('sets shippedAt, bumps status from PAID, and sends the shipped email on first call', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ status: 'PAID', shippedAt: null }) as any);
      vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder({ status: 'OUT_FOR_DELIVERY', shippedAt: new Date() }) as any);

      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-shipped', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.order.status).toBe('OUT_FOR_DELIVERY');
      expect(res.body.emailSent).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('does not re-send the shipped email on a second mark-shipped call', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ status: 'OUT_FOR_DELIVERY', shippedAt: new Date('2026-01-01') }) as any);
      vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder({ status: 'OUT_FOR_DELIVERY' }) as any);

      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-shipped', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.emailSent).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('does not move status backward for a CANCELLED order', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ status: 'CANCELLED', shippedAt: null }) as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder({ status: 'CANCELLED' }) as any);

      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-shipped', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
    });
  });

  describe('mark-delivered', () => {
    it.each(['PAID', 'PACKED', 'OUT_FOR_DELIVERY'])('marks a %s order delivered and bumps status to DELIVERED', async (status) => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ status }) as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder({ status: 'DELIVERED', deliveredAt: new Date() }) as any);

      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-delivered', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { deliveredAt: expect.any(Date), status: 'DELIVERED' } }));
    });

    it.each(['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'])(
      'rejects marking a %s order as delivered and does not write',
      async (status) => {
        vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ status }) as any);
        const updateSpy = vi.spyOn(prisma.order, 'update');

        const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-delivered', orderId: ORDER_ID } };
        const res = createMockRes();
        await ordersHandler(req as any, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(new RegExp(status));
        expect(updateSpy).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for an unknown order', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'mark-delivered', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('update-tracking', () => {
    it('saves a tracking number', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder() as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder({ trackingNumber: 'AP123456789AU' }) as any);

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { action: 'update-tracking', orderId: ORDER_ID, trackingNumber: 'AP123456789AU' },
      };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { trackingNumber: 'AP123456789AU' } }));
    });

    it('clears the tracking number when given an empty string', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ trackingNumber: 'OLD123' }) as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder({ trackingNumber: null }) as any);

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { action: 'update-tracking', orderId: ORDER_ID, trackingNumber: '' },
      };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { trackingNumber: null } }));
    });
  });

  describe('update-ship-date', () => {
    it('accepts a date earlier than the order was even created -- deliberately no floor (admin override)', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(baseOrder({ createdAt: new Date('2026-06-01') }) as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder({ expectedShipAt: new Date('2026-01-01T12:00:00') }) as any);

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { action: 'update-ship-date', orderId: ORDER_ID, expectedShipAt: '2026-01-01' },
      };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { expectedShipAt: new Date('2026-01-01T12:00:00') } }));
    });

    it('rejects a malformed date string before it ever reaches the handler', async () => {
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { action: 'update-ship-date', orderId: ORDER_ID, expectedShipAt: 'not-a-date' },
      };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for an unknown order', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { action: 'update-ship-date', orderId: ORDER_ID, expectedShipAt: '2026-03-01' },
      };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('delete-test-order', () => {
    it('deletes the order and its dependent rows, with no units to revert', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({ ...baseOrder(), items: [] } as any);
      vi.spyOn(prisma.refund, 'deleteMany').mockResolvedValue({} as any);
      vi.spyOn(prisma.review, 'deleteMany').mockResolvedValue({} as any);
      vi.spyOn(prisma.givingLedgerEntry, 'deleteMany').mockResolvedValue({} as any);
      vi.spyOn(prisma.orderItem, 'deleteMany').mockResolvedValue({} as any);
      vi.spyOn(prisma.payment, 'deleteMany').mockResolvedValue({} as any);
      const deleteSpy = vi.spyOn(prisma.order, 'delete').mockResolvedValue({} as any);

      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'delete-test-order', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(res.body.unitsReverted).toBe(0);
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: ORDER_ID } });
    });

    it('returns 404 for an unknown order', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
      const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { action: 'delete-test-order', orderId: ORDER_ID } };
      const res = createMockRes();
      await ordersHandler(req as any, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('update-order-details', () => {
    it('leaves the existing address untouched when every address field is blank', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        ...baseOrder(),
        deliveryAddressId: 'addr-1',
        deliveryAddress: { recipientName: 'Old Name', line1: 'Old Line 1', line2: null, suburb: 'Old Suburb', state: 'VIC', postcode: '3000' },
      } as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue(baseOrder() as any);

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { action: 'update-order-details', orderId: ORDER_ID, internalNote: 'Fragile, handle with care' },
      };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: { deliveryAddressId: 'addr-1', internalNote: 'Fragile, handle with care' } }));
    });

    it('rejects a partial address update that would leave a required field empty', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({ ...baseOrder(), deliveryAddressId: null, deliveryAddress: null } as any);
      const updateSpy = vi.spyOn(prisma.order, 'update');

      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { action: 'update-order-details', orderId: ORDER_ID, recipientName: 'New Name' },
      };
      const res = createMockRes();
      await ordersHandler(req as any, res);

      expect(res.statusCode).toBe(400);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  it('returns 405 for an unsupported method', async () => {
    const req = { method: 'PUT', headers: { cookie: adminCookieHeader() } };
    const res = createMockRes();
    await ordersHandler(req as any, res);
    expect(res.statusCode).toBe(405);
  });
});
