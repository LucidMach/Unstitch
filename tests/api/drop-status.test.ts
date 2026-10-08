import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import dropStatusHandler from '../../src/server/drop-status.js';

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

describe('drop-status API handler (/api/drop-status)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects non-GET requests with 405', async () => {
    const req = { method: 'POST', url: '/api/drop-status' };
    const res = createMockRes();

    await dropStatusHandler(req as any, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET');
    expect(res.body.error).toBe('Method not allowed');
  });

  it('returns all active products and drop statuses when ?all=true is passed', async () => {
    const mockProducts = [
      {
        id: 'p1',
        slug: 'slow-bloom',
        sku: 'UX-SLOWBLOOM',
        name: 'Slow Bloom',
        tagline: '2026 RESET x Zero Waste Festival',
        basePriceCents: 2900,
        imageUrl: '/SlowBloom.png',
        isActive: true,
        drops: [
          {
            id: 'd1',
            dropCode: 'D001',
            status: 'LIVE',
            totalUnits: 11,
          },
        ],
      },
      {
        id: 'p2',
        slug: 'zero-waste-tote',
        sku: 'UX-ZWTOTE',
        name: 'Zero Waste Tote',
        tagline: 'Rescued textile tote',
        basePriceCents: 4500,
        imageUrl: '/tote.png',
        isActive: true,
        drops: [
          {
            id: 'd2',
            dropCode: 'D002',
            status: 'SOLD_OUT',
            totalUnits: 20,
          },
        ],
      },
    ];

    vi.spyOn(prisma.product, 'findMany').mockResolvedValue(mockProducts as any);
    vi.spyOn(prisma.unit, 'count').mockResolvedValue(5); // 5 in stock for live drop

    const req = { method: 'GET', url: '/api/drop-status?all=true' };
    const res = createMockRes();

    await dropStatusHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.drops).toHaveLength(2);

    const first = res.body.drops[0];
    expect(first.slug).toBe('slow-bloom');
    expect(first.status).toBe('live');
    expect(first.available).toBe(true);
    expect(first.inStock).toBe(5);

    const second = res.body.drops[1];
    expect(second.slug).toBe('zero-waste-tote');
    expect(second.status).toBe('sold-out');
    expect(second.available).toBe(false);
  });

  it('returns details for a single product when ?slug=slow-bloom is queried', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      id: 'p1',
      slug: 'slow-bloom',
      sku: 'UX-SLOWBLOOM',
      name: 'Slow Bloom',
      tagline: '2026 RESET x Zero Waste Festival',
      description: 'Slow Bloom modular kit',
      basePriceCents: 2900,
      currency: 'AUD',
      colourPalette: ['#383433'],
      materialRigidity: 'Soft / Low-rigidity',
      ageRangeMin: 4,
      ageRangeMax: 200,
      kitContents: ['3 Designs', 'Tiles'],
      imageUrl: '/SlowBloom.png',
      isActive: true,
      costRecipe: { tilesPerKit: 22 },
    } as any);

    vi.spyOn(prisma.drop, 'findFirst').mockResolvedValue({
      id: 'd1',
      dropCode: 'D001',
      status: 'LIVE',
      totalUnits: 11,
    } as any);

    vi.spyOn(prisma.unit, 'count').mockResolvedValue(3);

    const req = { method: 'GET', url: '/api/drop-status?slug=slow-bloom' };
    const res = createMockRes();

    await dropStatusHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.slug).toBe('slow-bloom');
    expect(res.body.name).toBe('Slow Bloom');
    expect(res.body.available).toBe(true);
    expect(res.body.inStock).toBe(3);
    expect(res.body.totalUnits).toBe(11);
    expect(res.body.dropCode).toBe('D001');
    expect(res.body.basePriceCents).toBe(2900);
    expect(res.body.tilesPerKit).toBe(22);
  });

  it('returns available: false and status: NONE when product is not found', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);

    const req = { method: 'GET', url: '/api/drop-status?slug=non-existent' };
    const res = createMockRes();

    await dropStatusHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ available: false, status: 'NONE', inStock: 0 });
  });

  it('falls back to default active product when slug is omitted', async () => {
    vi.spyOn(prisma.drop, 'findFirst').mockImplementation(async (query: any) => {
      // If querying live drop with product include
      if (query?.where?.status === 'LIVE' && query?.include?.product) {
        return {
          id: 'd1',
          product: { slug: 'slow-bloom' },
        } as any;
      }
      // If querying drop for product
      return {
        id: 'd1',
        dropCode: 'D001',
        status: 'LIVE',
        totalUnits: 11,
      } as any;
    });

    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      id: 'p1',
      slug: 'slow-bloom',
      sku: 'UX-SLOWBLOOM',
      name: 'Slow Bloom',
      basePriceCents: 2900,
      currency: 'AUD',
      isActive: true,
      costRecipe: { tilesPerKit: 22 },
    } as any);

    vi.spyOn(prisma.unit, 'count').mockResolvedValue(7);

    const req = { method: 'GET', url: '/api/drop-status' };
    const res = createMockRes();

    await dropStatusHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.slug).toBe('slow-bloom');
    expect(res.body.available).toBe(true);
    expect(res.body.inStock).toBe(7);
  });

  it('returns product display fields with status NONE when product has no drops', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      id: 'p-new',
      slug: 'new-bag',
      sku: 'UX-NEWBAG',
      name: 'New Bag',
      tagline: 'Brand new bag',
      basePriceCents: 5000,
      currency: 'AUD',
      isActive: true,
      costRecipe: { tilesPerKit: 10 },
    } as any);

    vi.spyOn(prisma.drop, 'findFirst').mockResolvedValue(null);

    const req = { method: 'GET', url: '/api/drop-status?slug=new-bag' };
    const res = createMockRes();

    await dropStatusHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.slug).toBe('new-bag');
    expect(res.body.name).toBe('New Bag');
    expect(res.body.status).toBe('NONE');
    expect(res.body.available).toBe(false);
    expect(res.body.totalUnits).toBe(0);
  });

  it('returns available: false and status: SOLD_OUT when drop is sold out', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      id: 'p1',
      slug: 'slow-bloom',
      sku: 'UX-SLOWBLOOM',
      name: 'Slow Bloom',
      basePriceCents: 2900,
      isActive: true,
    } as any);

    vi.spyOn(prisma.drop, 'findFirst').mockResolvedValue({
      id: 'd1',
      dropCode: 'D001',
      status: 'SOLD_OUT',
      totalUnits: 11,
    } as any);

    vi.spyOn(prisma.unit, 'count').mockResolvedValue(0);

    const req = { method: 'GET', url: '/api/drop-status?slug=slow-bloom' };
    const res = createMockRes();

    await dropStatusHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('SOLD_OUT');
    expect(res.body.available).toBe(false);
    expect(res.body.inStock).toBe(0);
  });

  it('returns 500 when database throws an error', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockRejectedValue(new Error('DB failure'));

    const req = { method: 'GET', url: '/api/drop-status?slug=slow-bloom' };
    const res = createMockRes();

    await dropStatusHandler(req as any, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Unable to check stock.');
  });
});
