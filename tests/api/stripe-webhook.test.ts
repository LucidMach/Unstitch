import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Stripe from 'stripe';

const ORIGINAL_ENV = { ...process.env };

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

/** Builds a request whose raw body + stripe-signature header verify correctly against `secret`. */
function createSignedReq(eventPayload: any, secret: string) {
  const payload = JSON.stringify(eventPayload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return {
    method: 'POST',
    headers: { 'stripe-signature': header },
    rawBody: Buffer.from(payload, 'utf8'),
  };
}

/**
 * Sets up env vars then dynamically (re)imports prisma + the handler so
 * each test gets a coherent, freshly-configured module graph — this file
 * needs to flip `stripe`/`prisma`'s "configured or not" module-load-time
 * state between tests, which a single static import can't do.
 */
async function loadHandler({
  stripeSecretKey = 'sk_test_mock_key_1234567890',
  webhookSecret = 'whsec_test_mock_secret',
  databaseUrl,
}: { stripeSecretKey?: string | null; webhookSecret?: string | null; databaseUrl?: string | null } = {}) {
  if (stripeSecretKey === null) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = stripeSecretKey;
  }
  if (webhookSecret === null) {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  }
  if (databaseUrl === null) {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
  } else if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  const prismaModule = await import('../../src/lib/prisma.js');
  const handlerModule = await import('../../api/stripe-webhook.js');
  return { prisma: prismaModule.default as any, handler: handlerModule.default };
}

describe('Stripe webhook handler (/api/stripe-webhook)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mockSend.mockClear();
    process.env = { ...ORIGINAL_ENV };
    // stripe.js/prisma.js cache their singleton on `globalThis` (dev-mode
    // hot-reload guard) — that cache survives vi.resetModules(), so it must
    // be cleared by hand or a test that flips STRIPE_SECRET_KEY/DATABASE_URL
    // off would still see the previous test's already-constructed client.
    delete (globalThis as any).stripe;
    delete (globalThis as any).prisma;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete (globalThis as any).stripe;
    delete (globalThis as any).prisma;
  });

  it('rejects non-POST HTTP methods with 405', async () => {
    const { handler } = await loadHandler();
    const req = { method: 'GET', headers: {} };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('POST');
  });

  it('returns 503 when STRIPE_SECRET_KEY is not configured', async () => {
    const { handler } = await loadHandler({ stripeSecretKey: null });
    const req = { method: 'POST', headers: { 'stripe-signature': 'whatever' } };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it('returns 503 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const { handler } = await loadHandler({ webhookSecret: null });
    const req = { method: 'POST', headers: { 'stripe-signature': 'whatever' } };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it('returns 503 when Prisma/DATABASE_URL is not configured', async () => {
    const { handler } = await loadHandler({ databaseUrl: null });
    const req = { method: 'POST', headers: { 'stripe-signature': 'whatever' } };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it('returns 400 for an invalid signature before touching the DB', async () => {
    const { handler, prisma } = await loadHandler();
    const findUniqueSpy = vi.spyOn(prisma.payment, 'findUnique');

    const req = {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      rawBody: Buffer.from(JSON.stringify({ id: 'evt_fake', type: 'checkout.session.completed' })),
    };
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
    expect(findUniqueSpy).not.toHaveBeenCalled();
  });

  it('checkout.session.completed happy path creates Customer/Order/OrderItems/Payment and marks units sold', async () => {
    const webhookSecret = 'whsec_happy_path';
    const { handler, prisma } = await loadHandler({ webhookSecret });

    vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue(null);

    const mockTx = {
      customer: { upsert: vi.fn().mockResolvedValue({ id: 'cust-1', email: 'buyer@example.com' }) },
      address: { create: vi.fn() },
      order: { create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'UX-2026-000001' }) },
      orderItem: { create: vi.fn().mockResolvedValue({}) },
      payment: { create: vi.fn().mockResolvedValue({}) },
      product: { findUnique: vi.fn().mockResolvedValue({ id: 'prod-1', name: 'Slow Bloom Kit' }) },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(mockTx));

    const session = {
      id: 'cs_test_happy',
      payment_intent: 'pi_test_happy',
      customer_details: { email: 'buyer@example.com', name: 'Buyer Name' },
      customer_email: null,
      amount_total: 15000,
      currency: 'aud',
      metadata: {
        unitIds: JSON.stringify(['unit-1', 'unit-2']),
        productId: 'prod-1',
        deliveryFeeCents: '1000',
        deliveryZoneId: '',
      },
    };
    const req = createSignedReq({ id: 'evt_happy', type: 'checkout.session.completed', data: { object: session } }, webhookSecret);
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockTx.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'buyer@example.com' } })
    );
    expect(mockTx.order.create).toHaveBeenCalledTimes(1);
    expect(mockTx.orderItem.create).toHaveBeenCalledTimes(2);
    expect(mockTx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerPaymentId: 'pi_test_happy', status: 'SUCCEEDED' }),
      })
    );
    // markUnitsSold flips units to SOLD via a raw UPDATE on the tx client.
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: an existing Payment.providerPaymentId skips all writes', async () => {
    const webhookSecret = 'whsec_idempotent';
    const { handler, prisma } = await loadHandler({ webhookSecret });

    vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue({ id: 'existing-payment' } as any);
    const transactionSpy = vi.spyOn(prisma, '$transaction');

    const session = {
      id: 'cs_test_dup',
      payment_intent: 'pi_already_recorded',
      customer_details: { email: 'buyer@example.com' },
      amount_total: 5000,
      currency: 'aud',
      metadata: {},
    };
    const req = createSignedReq({ id: 'evt_dup', type: 'checkout.session.completed', data: { object: session } }, webhookSecret);
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('checkout.session.expired releases reserved units', async () => {
    const webhookSecret = 'whsec_expired';
    const { handler, prisma } = await loadHandler({ webhookSecret });

    const executeRawSpy = vi.spyOn(prisma, '$executeRaw').mockResolvedValue(2 as any);

    const session = {
      id: 'cs_test_expired',
      metadata: { unitIds: JSON.stringify(['unit-9', 'unit-10']) },
    };
    const req = createSignedReq({ id: 'evt_expired', type: 'checkout.session.expired', data: { object: session } }, webhookSecret);
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(executeRawSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores unhandled event types and responds 200 with no DB writes', async () => {
    const webhookSecret = 'whsec_unhandled';
    const { handler, prisma } = await loadHandler({ webhookSecret });

    const transactionSpy = vi.spyOn(prisma, '$transaction');
    const executeRawSpy = vi.spyOn(prisma, '$executeRaw');

    const req = createSignedReq({ id: 'evt_other', type: 'payment_intent.succeeded', data: { object: {} } }, webhookSecret);
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(executeRawSpy).not.toHaveBeenCalled();
  });

  it('returns 500 (so Stripe retries) when the handler throws', async () => {
    const webhookSecret = 'whsec_error';
    const { handler, prisma } = await loadHandler({ webhookSecret });

    vi.spyOn(prisma.payment, 'findUnique').mockRejectedValue(new Error('DB connection lost'));

    const session = {
      id: 'cs_test_error',
      payment_intent: 'pi_test_error',
      customer_details: { email: 'buyer@example.com' },
      amount_total: 5000,
      currency: 'aud',
      metadata: {},
    };
    const req = createSignedReq({ id: 'evt_error', type: 'checkout.session.completed', data: { object: session } }, webhookSecret);
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
  });
});
