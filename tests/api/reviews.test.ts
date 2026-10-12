// src/server/reviews.js (customer-facing review submission + published
// list) — new this session, modelled on order-lookup-by-number.test.ts's
// mock-res pattern.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import reviewsHandler from '../../src/server/reviews.js';
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

const SAMPLE_PRODUCT = { id: 'product-1', slug: 'slow-bloom', totalUnits: 11 };

const SAMPLE_ORDER = {
  id: 'order-1',
  orderNumber: 'UX-2026-000001',
  status: 'DELIVERED',
  customerId: 'cust-1',
  customer: { id: 'cust-1', email: 'jane@example.com' },
  items: [
    { id: 'item-1', productId: 'product-1', unitId: 'unit-1', unit: { id: 'unit-1', editionNumber: 7 } },
  ],
};

const SUBMIT_PAYLOAD = {
  productSlug: 'slow-bloom',
  orderNumber: 'UX-2026-000001',
  email: 'jane@example.com',
  ratingPlay: 5,
  ratingBuild: 4,
  ratingValue: 5,
  title: 'Lovely kit',
  body: 'Built it in an afternoon.',
  wouldRecommend: true,
  showUnit: true,
};

describe('/api/reviews — POST (submit)', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
  });

  it('returns 400 for a malformed request body', async () => {
    const req = { method: 'POST', body: { productSlug: 'slow-bloom' } };
    const res = createMockRes();
    await reviewsHandler(req as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('creates a PENDING review when the order verifies and matches the product', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(SAMPLE_PRODUCT as any);
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(SAMPLE_ORDER as any);
    vi.spyOn(prisma.review, 'findFirst').mockResolvedValue(null);
    const createSpy = vi.spyOn(prisma.review, 'create').mockResolvedValue({ id: 'review-1' } as any);

    const req = { method: 'POST', body: SUBMIT_PAYLOAD };
    const res = createMockRes();
    await reviewsHandler(req as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'product-1',
          orderId: 'order-1',
          customerId: 'cust-1',
          unitId: 'unit-1',
          rating: 5, // round((5+4+5)/3) = round(4.67) = 5
          ratingPlay: 5,
          ratingBuild: 4,
          ratingValue: 5,
        }),
      }),
    );
  });

  it('omits the unit badge when showUnit is false', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(SAMPLE_PRODUCT as any);
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(SAMPLE_ORDER as any);
    vi.spyOn(prisma.review, 'findFirst').mockResolvedValue(null);
    const createSpy = vi.spyOn(prisma.review, 'create').mockResolvedValue({ id: 'review-1' } as any);

    const req = { method: 'POST', body: { ...SUBMIT_PAYLOAD, showUnit: false } };
    const res = createMockRes();
    await reviewsHandler(req as any, res);

    expect(res.statusCode).toBe(201);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unitId: null }) }));
  });

  it('returns a generic 404 when the order number and email do not match', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(SAMPLE_PRODUCT as any);
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(SAMPLE_ORDER as any);

    const req = { method: 'POST', body: { ...SUBMIT_PAYLOAD, email: 'someone-else@example.com' } };
    const res = createMockRes();
    await reviewsHandler(req as any, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/couldn't find/i);
  });

  it('rejects a review against an order that is not yet DELIVERED', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(SAMPLE_PRODUCT as any);
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({ ...SAMPLE_ORDER, status: 'PAID' } as any);

    const req = { method: 'POST', body: SUBMIT_PAYLOAD };
    const res = createMockRes();
    await reviewsHandler(req as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/delivered/i);
  });

  it("rejects a review when the order doesn't contain the reviewed product", async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(SAMPLE_PRODUCT as any);
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
      ...SAMPLE_ORDER,
      items: [{ id: 'item-2', productId: 'other-product', unitId: null, unit: null }],
    } as any);

    const req = { method: 'POST', body: SUBMIT_PAYLOAD };
    const res = createMockRes();
    await reviewsHandler(req as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/doesn't include this product/i);
  });

  it('rejects a second review against the same order + product', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(SAMPLE_PRODUCT as any);
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(SAMPLE_ORDER as any);
    vi.spyOn(prisma.review, 'findFirst').mockResolvedValue({ id: 'existing-review' } as any);

    const req = { method: 'POST', body: SUBMIT_PAYLOAD };
    const res = createMockRes();
    await reviewsHandler(req as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already reviewed/i);
  });

  it('returns 429 after exceeding the rate limit', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
    const req = { method: 'POST', body: SUBMIT_PAYLOAD };
    for (let i = 0; i < 5; i++) {
      await reviewsHandler(req as any, createMockRes());
    }
    const res = createMockRes();
    await reviewsHandler(req as any, res);
    expect(res.statusCode).toBe(429);
  });

  it('returns 500 on an unexpected database error', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockRejectedValue(new Error('Connection timeout'));
    const req = { method: 'POST', body: SUBMIT_PAYLOAD };
    const res = createMockRes();
    await reviewsHandler(req as any, res);
    expect(res.statusCode).toBe(500);
  });
});

describe('/api/reviews — GET (published list)', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
  });

  it('returns 400 when no product is given', async () => {
    const req = { method: 'GET', url: '/api/reviews' };
    const res = createMockRes();
    await reviewsHandler(req as any, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns only published reviews, with the reviewer reduced to a first name', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(SAMPLE_PRODUCT as any);
    vi.spyOn(prisma.review, 'findMany').mockResolvedValue([
      {
        id: 'review-1',
        rating: 5,
        ratingPlay: 5,
        ratingBuild: 4,
        ratingValue: 5,
        title: 'Lovely kit',
        body: 'Built it in an afternoon.',
        wouldRecommend: true,
        createdAt: new Date('2026-02-01T00:00:00Z'),
        customer: { name: 'Jane Smith' },
        unit: { editionNumber: 7 },
      },
    ] as any);

    const req = { method: 'GET', url: '/api/reviews?product=slow-bloom' };
    const res = createMockRes();
    await reviewsHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].reviewerFirstName).toBe('Jane');
    expect(res.body.reviews[0].customer).toBeUndefined();
    expect(res.body.reviews[0].unitBadge).toEqual({ editionNumber: 7, totalUnits: 11 });
  });

  it('returns 404 for an unknown product slug', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
    const req = { method: 'GET', url: '/api/reviews?product=nonexistent' };
    const res = createMockRes();
    await reviewsHandler(req as any, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('/api/reviews — method guard', () => {
  it('rejects DELETE with 405', async () => {
    const req = { method: 'DELETE' };
    const res = createMockRes();
    await reviewsHandler(req as any, res);
    expect(res.statusCode).toBe(405);
  });
});
