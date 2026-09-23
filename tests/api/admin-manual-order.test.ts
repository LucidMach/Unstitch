import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import manualOrderHandler from '../../src/server/admin/manual-order.js';
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

const PRODUCT = {
  id: 'prod-1',
  slug: 'slow-bloom',
  isActive: true,
  name: 'Slow Bloom Kit',
  currency: 'AUD',
  basePriceCents: 12000,
};

describe('admin/manual-order API handler — creation happy path', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSend.mockClear();
    process.env.SESSION_SECRET = 'test-secret-for-admin-manual-order';
    delete process.env.RESEND_API_KEY;

    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(PRODUCT as any);
  });

  it('creates a COMMISSION order with a single aggregate OrderItem and a Payment when paid', async () => {
    const mockTx = {
      customer: { upsert: vi.fn().mockResolvedValue({ id: 'cust-1', email: 'buyer@example.com' }) },
      address: { create: vi.fn() },
      order: { create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'UX-2026-000010' }) },
      orderItem: { create: vi.fn().mockResolvedValue({}) },
      payment: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(mockTx));

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: {
        email: 'buyer@example.com',
        name: 'Buyer Name',
        type: 'COMMISSION',
        quantity: 1,
        unitPriceCents: 20000,
        deliveryMethod: 'NONE',
        paymentStatus: 'PAID',
      },
    };
    const res = createMockRes();

    await manualOrderHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.order).toEqual({ id: 'order-1', orderNumber: 'UX-2026-000010' });
    expect(res.body.emailSent).toBe(false);
    expect(mockTx.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'buyer@example.com' } })
    );
    expect(mockTx.orderItem.create).toHaveBeenCalledTimes(1);
    expect(mockTx.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unitId: null, quantity: 1, unitPriceCents: 20000 }) })
    );
    expect(mockTx.payment.create).toHaveBeenCalledTimes(1);
  });

  it('records an UNPAID commission with no Payment row', async () => {
    const mockTx = {
      customer: { upsert: vi.fn().mockResolvedValue({ id: 'cust-1', email: 'buyer@example.com' }) },
      address: { create: vi.fn() },
      order: { create: vi.fn().mockResolvedValue({ id: 'order-2', orderNumber: 'UX-2026-000011' }) },
      orderItem: { create: vi.fn().mockResolvedValue({}) },
      payment: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(mockTx));

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: {
        email: 'buyer@example.com',
        type: 'COMMISSION',
        quantity: 1,
        paymentStatus: 'UNPAID',
      },
    };
    const res = createMockRes();

    await manualOrderHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockTx.payment.create).not.toHaveBeenCalled();
    expect(mockTx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_PAYMENT' }) })
    );
  });

  it('returns 404 when the product is inactive/unavailable', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ ...PRODUCT, isActive: false } as any);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { email: 'buyer@example.com', type: 'COMMISSION', quantity: 1 },
    };
    const res = createMockRes();

    await manualOrderHandler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 without a valid admin session', async () => {
    const req = {
      method: 'POST',
      headers: {},
      body: { email: 'buyer@example.com', type: 'COMMISSION', quantity: 1 },
    };
    const res = createMockRes();

    await manualOrderHandler(req, res);
    expect(res.statusCode).toBe(401);
  });
});
