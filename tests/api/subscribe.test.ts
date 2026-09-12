import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import subscribeHandler from '../../api/subscribe.js';
import { limiter } from '../../src/lib/rateLimit.js';

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'mock-raffle-email-id' }, error: null });

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

describe('Subscribe API Handler (/api/subscribe)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'mock-raffle-email-id' }, error: null });
    process.env = { ...originalEnv, RESEND_API_KEY: 'test-resend-key' };

    if (prisma) {
      vi.spyOn(prisma.subscriber, 'upsert').mockResolvedValue({ id: 1 } as any);
    }
  });

  it('rejects non-POST methods with 405', async () => {
    const req = { method: 'GET' };
    const res = createMockRes();

    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('POST');
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });

  it('returns 400 when email is invalid', async () => {
    const req = {
      method: 'POST',
      body: { email: 'not-an-email' },
    };
    const res = createMockRes();

    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('valid email');
  });

  it('returns 429 when rate limit is exceeded (10 reqs)', async () => {
    const req = {
      method: 'POST',
      headers: { 'x-real-ip': '5.5.5.5' },
      body: {
        email: 'subscriber@example.com',
        source: 'home-signup',
      },
    };

    for (let i = 0; i < 10; i++) {
      const res = createMockRes();
      await subscribeHandler(req, res);
      expect(res.statusCode).toBe(200);
    }

    const res = createMockRes();
    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toContain('Too many requests');
  });

  it('silently absorbs bots with honeypot _gotcha', async () => {
    const req = {
      method: 'POST',
      body: {
        email: 'spambot@example.com',
        _gotcha: 'http://spam.url',
      },
    };
    const res = createMockRes();

    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('successfully subscribes user with valid payload', async () => {
    const req = {
      method: 'POST',
      body: {
        name: 'Jordan',
        email: 'jordan@unstitch.com',
        source: 'shop-signup',
      },
    };
    const res = createMockRes();

    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 500 when database upsert fails', async () => {
    if (prisma) {
      vi.spyOn(prisma.subscriber, 'upsert').mockRejectedValueOnce(new Error('Connection timeout'));
    }

    const req = {
      method: 'POST',
      body: {
        name: 'Jordan',
        email: 'jordan@unstitch.com',
        source: 'shop-signup',
      },
    };
    const res = createMockRes();

    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('Unable to save subscription');
  });

  it('sends raffle confirmation email when source is zwf-raffle-draw', async () => {
    const req = {
      method: 'POST',
      body: {
        name: 'Alex',
        email: 'alex@example.com',
        source: 'zwf-raffle-draw',
      },
    };
    const res = createMockRes();

    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sendArgs = mockSend.mock.calls[0][0];
    expect(sendArgs.to).toBe('alex@example.com');
    expect(sendArgs.subject).toContain('Raffle Draw');
    expect(sendArgs.html).toContain('Zero Waste Festival');
    expect(sendArgs.html).toContain('Alex');
  });

  it('retries with fallback sender if primary sender is unverified during raffle email dispatch', async () => {
    mockSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Domain hello@unstitchx.com is not verified', statusCode: 403, name: 'validation_error' },
      })
      .mockResolvedValueOnce({
        data: { id: 'fallback-raffle-email-id' },
        error: null,
      });

    const req = {
      method: 'POST',
      body: {
        name: 'Casey',
        email: 'casey@example.com',
        source: 'zwf-raffle-draw',
      },
    };
    const res = createMockRes();

    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0].from).toContain('onboarding@resend.dev');
  });

  it('does not send raffle email for regular newsletter subscription', async () => {
    const req = {
      method: 'POST',
      body: {
        name: 'Sam',
        email: 'sam@example.com',
        source: 'shop-signup',
      },
    };
    const res = createMockRes();

    await subscribeHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

