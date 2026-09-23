import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import batchDropsHandler from '../../src/server/admin/batch-drops.js';
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

const PRODUCT_ID = 'a0000000-0000-4000-8000-000000000001';
const DROP_ID = 'b0000000-0000-4000-8000-000000000002';

describe('admin/batch-drops API handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-batch-drops';
  });

  it('rejects an unauthenticated GET with 401', async () => {
    const req: any = { method: 'GET', headers: {} };
    const res = createMockRes();
    await batchDropsHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('lists batch drops and product options when authenticated', async () => {
    vi.spyOn(prisma.drop, 'findMany').mockResolvedValue([
      {
        id: DROP_ID,
        dropCode: 'D001',
        totalUnits: 100,
        status: 'UPCOMING',
        product: { id: PRODUCT_ID, name: 'Modular Tote', slug: 'modular-tote', imageUrl: null },
        _count: { units: 100, reservations: 0 },
      },
    ] as any);

    vi.spyOn(prisma.product, 'findMany').mockResolvedValue([
      { id: PRODUCT_ID, name: 'Modular Tote', slug: 'modular-tote', imageUrl: null },
    ] as any);

    const req: any = { method: 'GET', headers: { cookie: adminCookieHeader() } };
    const res = createMockRes();
    await batchDropsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.drops).toHaveLength(1);
    expect(res.body.products).toHaveLength(1);
  });

  it('schedules a new batch drop event', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.drop, 'create').mockResolvedValue({
      id: DROP_ID,
      productId: PRODUCT_ID,
      dropCode: 'D002',
      totalUnits: 150,
      status: 'UPCOMING',
      releaseAt: new Date('2026-08-01T10:00:00Z'),
    } as any);

    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: {
        productId: PRODUCT_ID,
        dropCode: 'D002',
        totalUnits: 150,
        releaseAt: '2026-08-01T10:00:00Z',
      },
    };
    const res = createMockRes();
    await batchDropsHandler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.drop.dropCode).toBe('D002');
  });

  it('updates an existing drop release date', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue({ id: DROP_ID } as any);
    vi.spyOn(prisma.drop, 'update').mockResolvedValue({
      id: DROP_ID,
      releaseAt: new Date('2026-09-01T12:00:00Z'),
      status: 'LIVE',
    } as any);

    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: {
        id: DROP_ID,
        releaseAt: '2026-09-01T12:00:00Z',
        status: 'LIVE',
      },
    };
    const res = createMockRes();
    await batchDropsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.drop.status).toBe('LIVE');
  });
});
