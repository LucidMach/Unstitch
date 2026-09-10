import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import contactHandler from '../../api/contact.js';
import { limiter } from '../../src/lib/rateLimit.js';

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
    },
  })),
}));

// Helper to mock Express/Vercel res object
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

describe('Contact API Handler (/api/contact)', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();

    // Mock prisma methods to succeed by default
    if (prisma) {
      vi.spyOn(prisma, '$transaction').mockResolvedValue([{ id: 1 }, { id: 1 }] as any);
      vi.spyOn(prisma.contactSubmission, 'create').mockResolvedValue({ id: 1 } as any);
      vi.spyOn(prisma.subscriber, 'upsert').mockResolvedValue({ id: 1 } as any);
    }
  });

  it('rejects non-POST HTTP methods with 405', async () => {
    const req = { method: 'GET' };
    const res = createMockRes();

    await contactHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('POST');
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });

  it('returns 400 when required fields are missing', async () => {
    const req = {
      method: 'POST',
      body: { name: '', email: 'not-valid' },
    };
    const res = createMockRes();

    await contactHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.fieldErrors).toBeDefined();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': '8.8.8.8' },
      body: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        subject: 'general-enquiry',
        message: 'This is a valid enquiry message for unstitch studio.',
      },
    };

    // Fire 5 valid requests
    for (let i = 0; i < 5; i++) {
      const res = createMockRes();
      await contactHandler(req, res);
      expect(res.statusCode).toBe(200);
    }

    // 6th request from same IP should get 429
    const res = createMockRes();
    await contactHandler(req, res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toContain('Too many requests');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('silently absorbs bot requests when honeypot _gotcha is filled', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': '1.1.1.1' },
      body: {
        name: 'Spam Bot',
        email: 'spammer@bot.org',
        subject: 'general-enquiry',
        message: 'Buy cheap watches here now now now',
        _gotcha: 'http://spam-link.com',
      },
    };
    const res = createMockRes();

    await contactHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('successfully processes valid contact submission', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': '192.168.1.50' },
      body: {
        name: 'Taylor Swift',
        email: 'taylor@example.com',
        countryCode: '+61',
        phoneNumber: '0412345678',
        subject: 'school-workshop-enquiry',
        message: 'We would love to arrange a textile upcycling workshop.',
        marketingOptIn: true,
        details: { schoolName: 'Melbourne Grammar' },
      },
    };
    const res = createMockRes();

    await contactHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 500 when database persistence fails', async () => {
    if (prisma) {
      vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('DB connection lost'));
      vi.spyOn(prisma.contactSubmission, 'create').mockRejectedValueOnce(new Error('DB connection lost'));
    }

    const req = {
      method: 'POST',
      headers: { 'x-real-ip': '192.168.1.99' },
      body: {
        name: 'Alex Johnson',
        email: 'alex@example.com',
        subject: 'general-enquiry',
        message: 'Testing database error recovery response.',
      },
    };
    const res = createMockRes();

    await contactHandler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('issue saving your message');
  });
});
