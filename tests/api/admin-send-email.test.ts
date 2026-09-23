import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import sendEmailHandler from '../../api/admin/send-email.js';
import { buildAdminSessionCookie } from '../../src/lib/adminAuth.js';
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

function adminCookieHeader() {
  return buildAdminSessionCookie().split(';')[0];
}

describe('admin/send-email API handler — custom + resend-confirmation happy paths', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
    mockSend.mockClear();
    process.env.SESSION_SECRET = 'test-secret-for-admin-send-email';
    process.env.RESEND_API_KEY = 'test-resend-key';
  });

  it('sends a custom email to each valid, deduped recipient', async () => {
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: {
        mode: 'custom',
        to: 'a@example.com, b@example.com, a@example.com, not-an-email',
        subject: 'Hello',
        message: 'Just checking in.',
      },
    };
    const res = createMockRes();

    await sendEmailHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBe(2);
    expect(res.body.skippedInvalid).toEqual(['not-an-email']);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when no valid recipients are found', async () => {
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { mode: 'custom', to: 'not-an-email, also-bad', subject: 'Hello', message: 'Hi' },
    };
    const res = createMockRes();

    await sendEmailHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('resends the standard confirmation email for an existing order', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
      id: 'order-1',
      orderNumber: 'UX-2026-000001',
      totalCents: 12000,
      currency: 'AUD',
      deliveryFeeCents: 0,
      customer: { email: 'buyer@example.com' },
      deliveryAddress: null,
      deliveryZone: null,
      items: [{ product: { name: 'Slow Bloom Kit' }, quantity: 1 }],
    } as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { mode: 'resend-confirmation', orderId: 'order-1' },
    };
    const res = createMockRes();

    await sendEmailHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe('buyer@example.com');
  });

  it('returns 404 when resending confirmation for a nonexistent order', async () => {
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { mode: 'resend-confirmation', orderId: 'ghost-order' },
    };
    const res = createMockRes();

    await sendEmailHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 401 without a valid admin session', async () => {
    const req = { method: 'POST', headers: {}, body: { mode: 'custom', to: 'a@example.com', subject: 'x', message: 'y' } };
    const res = createMockRes();

    await sendEmailHandler(req, res);
    expect(res.statusCode).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
