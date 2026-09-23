import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import customersHandler from '../../src/server/admin/customers.js';
import { buildAdminSessionCookie } from '../../src/lib/adminAuth.js';

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
  const setCookie = buildAdminSessionCookie();
  return setCookie.split(';')[0];
}

describe('admin/customers API handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-customers';
  });

  it('rejects unauthenticated requests with 401', async () => {
    const req: any = { method: 'GET', headers: {} };
    const res = createMockRes();
    await customersHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns unified audience from customers, subscribers, and contact forms', async () => {
    const customerId = 'c0000000-0000-4000-8000-000000000001';
    vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([
      {
        id: customerId,
        email: 'buyer@example.com',
        name: 'Alice Buyer',
        phone: '0400000000',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ] as any);

    vi.spyOn(prisma.order, 'groupBy').mockResolvedValue([
      {
        customerId,
        _count: 3,
        _sum: { totalCents: 15000 },
      },
    ] as any);

    vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([
      {
        id: 1,
        email: 'buyer@example.com', // same user entered raffle!
        name: 'Alice Buyer',
        source: 'zwf-raffle-draw',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
      {
        id: 2,
        email: 'creator@example.com',
        name: 'Bob Creator',
        source: 'playground-export',
        createdAt: new Date('2026-02-15T00:00:00Z'),
      },
      {
        id: 3,
        email: 'fan@example.com',
        name: null,
        source: 'footer-newsletter',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ] as any);

    vi.spyOn(prisma.contactSubmission, 'findMany').mockResolvedValue([
      {
        id: 10,
        email: 'inquiry@example.com',
        name: 'Charlie Inquiry',
        phone: null,
        subject: 'Custom commission',
        message: 'Hello, looking for custom work.',
        createdAt: new Date('2026-03-10T00:00:00Z'),
      },
    ] as any);

    const req: any = { method: 'GET', headers: { cookie: adminCookieHeader() }, url: '/api/admin/customers' };
    const res = createMockRes();
    await customersHandler(req, res);

    expect(res.statusCode).toBe(200);
    const { customers, counts } = res.body;

    expect(counts).toEqual({
      all: 4,
      customers: 1,
      subscribers: 1,
      raffles: 1,
      contacts: 1,
      exports: 1,
    });

    const alice = customers.find((c: any) => c.email === 'buyer@example.com');
    expect(alice).toBeDefined();
    expect(alice.roles).toContain('customer');
    expect(alice.roles).toContain('raffle');
    expect(alice.orderCount).toBe(3);
    expect(alice.totalSpentCents).toBe(15000);

    const bob = customers.find((c: any) => c.email === 'creator@example.com');
    expect(bob).toBeDefined();
    expect(bob.roles).toContain('playground_export');

    const charlie = customers.find((c: any) => c.email === 'inquiry@example.com');
    expect(charlie).toBeDefined();
    expect(charlie.roles).toContain('contact');
    expect(charlie.subject).toBe('Custom commission');
  });

  it('filters audience when type parameter is provided', async () => {
    vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([
      {
        id: 'c1',
        email: 'buyer@example.com',
        name: 'Buyer',
        phone: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ] as any);

    vi.spyOn(prisma.order, 'groupBy').mockResolvedValue([]);

    vi.spyOn(prisma.subscriber, 'findMany').mockResolvedValue([
      {
        id: 1,
        email: 'creator@example.com',
        name: 'Creator',
        source: 'playground-export',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    ] as any);

    vi.spyOn(prisma.contactSubmission, 'findMany').mockResolvedValue([]);

    const req: any = {
      method: 'GET',
      headers: { cookie: adminCookieHeader() },
      url: '/api/admin/customers?type=exports',
    };
    const res = createMockRes();
    await customersHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].email).toBe('creator@example.com');
  });

  it('updates a customer record via POST', async () => {
    const customerId = 'c0000000-0000-4000-8000-000000000001';
    vi.spyOn(prisma.customer, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id === customerId) {
        return {
          id: customerId,
          email: 'old@example.com',
          name: 'Old Name',
          phone: null,
        } as any;
      }
      return null;
    });

    vi.spyOn(prisma.customer, 'update').mockResolvedValue({
      id: customerId,
      email: 'new@example.com',
      name: 'New Name',
      phone: '0412345678',
    } as any);

    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: {
        customerId,
        email: 'new@example.com',
        name: 'New Name',
        phone: '0412345678',
      },
    };
    const res = createMockRes();
    await customersHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.customer.name).toBe('New Name');
  });
});
