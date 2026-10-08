import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import sendEmailHandler from '../../src/server/admin/send-email.js';
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
    // The custom-send path looks up existing customers by email (for the
    // {name} placeholder). Without this, it'd hit the CI mock Neon host
    // for real, throw, and surface as a 500.
    vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([]);
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

  describe('custom send — {name} personalization', () => {
    it("fills {name} with the matching customer's real name", async () => {
      vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([{ email: 'jane@example.com', name: 'Jane Doe' }] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'custom', to: 'jane@example.com', subject: 'Hi {name}', message: 'Thanks, {name}!' },
      };
      const res = createMockRes();
      await sendEmailHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockSend.mock.calls[0][0].subject).toBe('Hi Jane Doe');
      expect(mockSend.mock.calls[0][0].text).toContain('Thanks, Jane Doe!');
    });

    // The case-sensitivity bug fixed in this pass: stripe-webhook.js never
    // normalizes the case of a Customer's stored email, but recipients
    // typed into this form are lower-cased by EmailAddressSchema before
    // the lookup -- a mixed-case stored email used to miss that lookup.
    it('matches a mixed-case stored customer email against a lower-cased recipient address', async () => {
      vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([{ email: 'Jane.Doe@Example.com', name: 'Jane Doe' }] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'custom', to: 'jane.doe@example.com', subject: 'Hi {name}', message: 'Hi there.' },
      };
      const res = createMockRes();
      await sendEmailHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockSend.mock.calls[0][0].subject).toBe('Hi Jane Doe');
    });

    it('falls back to the local part of the email when no customer matches', async () => {
      vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'custom', to: 'unknown-person@example.com', subject: 'Hi {name}', message: 'Hi.' },
      };
      const res = createMockRes();
      await sendEmailHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockSend.mock.calls[0][0].subject).toBe('Hi unknown-person');
    });

    it('previews against the first recipient without sending anything', async () => {
      vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([{ email: 'jane@example.com', name: 'Jane Doe' }] as any);
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'custom', to: 'jane@example.com', subject: 'Hi {name}', message: 'Hi.', preview: true },
      };
      const res = createMockRes();
      await sendEmailHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.preview).toBe(true);
      expect(res.body.html).toContain('Jane Doe');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('rejects a send with more recipients than MAX_RECIPIENTS', async () => {
      vi.spyOn(prisma.customer, 'findMany').mockResolvedValue([] as any);
      const to = Array.from({ length: 51 }, (_, i) => `person${i}@example.com`).join(',');
      const req = {
        method: 'POST',
        headers: { cookie: adminCookieHeader() },
        body: { mode: 'custom', to, subject: 'x', message: 'y' },
      };
      const res = createMockRes();
      await sendEmailHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
