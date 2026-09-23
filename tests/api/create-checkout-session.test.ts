import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import { limiter } from '../../src/lib/rateLimit.js';
import { InsufficientStockError } from '../../src/lib/inventory.js';

const { mockSessionsCreate } = vi.hoisted(() => ({ mockSessionsCreate: vi.fn() }));
vi.mock('../../src/lib/stripe.js', () => ({
  default: { checkout: { sessions: { create: (...args: any[]) => mockSessionsCreate(...args) } } },
}));

// Imported after the stripe mock is declared so the handler picks it up.
import checkoutHandler from '../../api/create-checkout-session.js';

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

const PRODUCT = {
  id: 'prod-1',
  slug: 'slow-bloom',
  isActive: true,
  name: 'Slow Bloom Kit',
  tagline: 'A kit that grows with you',
  currency: 'AUD',
  basePriceCents: 12345, // deliberately odd/specific — proves the price comes from the DB
};

const DROP = { id: 'drop-1', productId: 'prod-1', status: 'LIVE' };

// api/create-checkout-session.js fetches the product and its one candidate
// live drop in a single query (`product.findUnique({ include: { drops: {
// where: { status: 'LIVE' }, take: 1 } } })`) rather than two separate
// queries — so the mocked product must carry its own `drops` array.
const PRODUCT_WITH_LIVE_DROP = { ...PRODUCT, drops: [DROP] };

const ZONE = { id: 'zone-1', name: 'Local (0-5km)', method: 'SELF_DELIVERY', maxDistanceKm: 5, active: true, feeCents: 500 };

function validBody(overrides = {}) {
  return {
    slug: 'slow-bloom',
    quantity: 2,
    email: 'buyer@example.com',
    postcode: '3000', // within POSTCODES_0_5KM, VIC
    ...overrides,
  };
}

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.1.2.${ipCounter}`;
}

describe('create-checkout-session API handler', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
    mockSessionsCreate.mockReset();

    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(PRODUCT_WITH_LIVE_DROP as any);
    vi.spyOn(prisma.deliveryZone, 'findFirst').mockResolvedValue(ZONE as any);
    vi.spyOn(prisma, '$transaction').mockResolvedValue([
      { id: 'unit-1', serial: 'SN0001' },
      { id: 'unit-2', serial: 'SN0002' },
    ] as any);
    vi.spyOn(prisma, '$executeRaw').mockResolvedValue(1 as any);
    mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session/test' });
  });

  it('returns 400 with field errors for an invalid body', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': nextIp() },
      body: { slug: '', quantity: 0, postcode: 'abc' },
    };
    const res = createMockRes();

    await checkoutHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.fieldErrors).toBeDefined();
  });

  it('returns 404 for an unknown product', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
    const req = { method: 'POST', headers: { 'x-real-ip': nextIp() }, body: validBody() };
    const res = createMockRes();

    await checkoutHandler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an inactive product', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ ...PRODUCT_WITH_LIVE_DROP, isActive: false } as any);
    const req = { method: 'POST', headers: { 'x-real-ip': nextIp() }, body: validBody() };
    const res = createMockRes();

    await checkoutHandler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when there is no live drop', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ ...PRODUCT, drops: [] } as any);
    const req = { method: 'POST', headers: { 'x-real-ip': nextIp() }, body: validBody() };
    const res = createMockRes();

    await checkoutHandler(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('not currently live');
  });

  it('returns 400 for a postcode outside the delivery area', async () => {
    const req = { method: 'POST', headers: { 'x-real-ip': nextIp() }, body: validBody({ postcode: '2000' }) };
    const res = createMockRes();

    await checkoutHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Victoria');
  });

  it('returns 409 with the available count when stock is insufficient', async () => {
    vi.spyOn(prisma, '$transaction').mockRejectedValue(new InsufficientStockError('drop-1', 5, 2));
    const req = { method: 'POST', headers: { 'x-real-ip': nextIp() }, body: validBody({ quantity: 5 }) };
    const res = createMockRes();

    await checkoutHandler(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain('2 unit(s) left');
  });

  it('returns 409 "sold out" when zero units are available', async () => {
    vi.spyOn(prisma, '$transaction').mockRejectedValue(new InsufficientStockError('drop-1', 1, 0));
    const req = { method: 'POST', headers: { 'x-real-ip': nextIp() }, body: validBody({ quantity: 1 }) };
    const res = createMockRes();

    await checkoutHandler(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('This drop is sold out.');
  });

  it('builds the Stripe session with unit_amount from the DB product, not client input', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': nextIp() },
      // Client can't even express a price in this schema, but confirm any
      // stray extra field is simply ignored and never reaches Stripe.
      body: { ...validBody(), basePriceCents: 1, unit_amount: 1 },
    };
    const res = createMockRes();

    await checkoutHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/session/test' });
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockSessionsCreate.mock.calls[0][0];
    expect(callArgs.line_items[0].price_data.unit_amount).toBe(PRODUCT.basePriceCents);
    expect(callArgs.line_items[1].price_data.unit_amount).toBe(ZONE.feeCents);
    expect(callArgs.metadata.unitIds).toBe(JSON.stringify(['unit-1', 'unit-2']));
  });

  it('releases reserved units when the Stripe API call fails', async () => {
    mockSessionsCreate.mockRejectedValue(new Error('Stripe is down'));
    const executeRawSpy = vi.spyOn(prisma, '$executeRaw').mockResolvedValue(2 as any);

    const req = { method: 'POST', headers: { 'x-real-ip': nextIp() }, body: validBody() };
    const res = createMockRes();

    await checkoutHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(executeRawSpy).toHaveBeenCalledTimes(1);
  });
});
