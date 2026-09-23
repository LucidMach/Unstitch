import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import orderLookupRequestHandler from '../../api/order-lookup-request.js';
import { limiter } from '../../src/lib/rateLimit.js';

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

const GENERIC_RESPONSE = {
  ok: true,
  message: "If we found an order under that email, we've sent a link to check its status.",
};

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.5.6.${ipCounter}`;
}

describe('order-lookup-request API handler (/api/order-lookup-request)', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
    mockSend.mockClear();
    process.env.SESSION_SECRET = 'test-secret-for-order-lookup-request';
    process.env.RESEND_API_KEY = 'test-resend-key';
  });

  it('rejects non-POST HTTP methods with 405', async () => {
    const req = { method: 'GET', headers: {} };
    const res = createMockRes();

    await orderLookupRequestHandler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 with field errors for an invalid email', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': nextIp() },
      body: { email: 'not-an-email' },
    };
    const res = createMockRes();

    await orderLookupRequestHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.fieldErrors).toBeDefined();
  });

  it('returns 429 once the rate limit is exceeded', async () => {
    const ip = nextIp();
    const makeReq = () => ({
      method: 'POST',
      headers: { 'x-real-ip': ip },
      body: { email: 'someone@example.com' },
    });
    vi.spyOn(prisma.customer, 'findUnique').mockResolvedValue(null);

    for (let i = 0; i < 5; i++) {
      const res = createMockRes();
      await orderLookupRequestHandler(makeReq(), res);
      expect(res.statusCode).toBe(200);
    }

    const res = createMockRes();
    await orderLookupRequestHandler(makeReq(), res);
    expect(res.statusCode).toBe(429);
  });

  it('returns the generic response and sends no email when the customer does not exist', async () => {
    vi.spyOn(prisma.customer, 'findUnique').mockResolvedValue(null);
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': nextIp() },
      body: { email: 'unknown@example.com' },
    };
    const res = createMockRes();

    await orderLookupRequestHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(GENERIC_RESPONSE);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns the generic response and sends no email when the customer has zero orders', async () => {
    vi.spyOn(prisma.customer, 'findUnique').mockResolvedValue({ id: 'cust-1', email: 'zero@example.com' } as any);
    vi.spyOn(prisma.order, 'count').mockResolvedValue(0);
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': nextIp() },
      body: { email: 'zero@example.com' },
    };
    const res = createMockRes();

    await orderLookupRequestHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(GENERIC_RESPONSE);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends exactly one magic-link email and returns the generic response for a customer with orders', async () => {
    vi.spyOn(prisma.customer, 'findUnique').mockResolvedValue({ id: 'cust-1', email: 'buyer@example.com' } as any);
    vi.spyOn(prisma.order, 'count').mockResolvedValue(3);
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': nextIp() },
      body: { email: 'buyer@example.com' },
    };
    const res = createMockRes();

    await orderLookupRequestHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(GENERIC_RESPONSE);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('buyer@example.com');
  });

  it('returns the generic response (not an error) when the DB lookup throws', async () => {
    vi.spyOn(prisma.customer, 'findUnique').mockRejectedValue(new Error('DB down'));
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': nextIp() },
      body: { email: 'buyer@example.com' },
    };
    const res = createMockRes();

    await orderLookupRequestHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(GENERIC_RESPONSE);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
