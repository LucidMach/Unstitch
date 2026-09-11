import { describe, it, expect, beforeEach, vi } from 'vitest';
import shareHandler from '../../api/share.js';
import { limiter } from '../../src/lib/rateLimit.js';

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'mock-share-email-id' }, error: null });

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

describe('Share API Handler (/api/share)', () => {
  beforeEach(() => {
    limiter.reset();
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'mock-share-email-id' }, error: null });
  });

  const validPayload = {
    email: 'creator@example.com',
    projectName: 'Textile Hexagon',
    designData: {
      version: 1,
      tiles: [{ id: 'root', position: [0, 0, 0], rotation: [0, 0, 0], children: {}, foldAngle: 0 }],
      worldTransform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
      overlap: 0.61,
    },
    previewImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  it('rejects non-POST methods with 405', async () => {
    const req = { method: 'GET' };
    const res = createMockRes();

    await shareHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('POST');
  });

  it('validates and accepts valid share payload', async () => {
    const req = {
      method: 'POST',
      body: validPayload,
      headers: { 'x-forwarded-for': '192.168.1.1' },
    };
    const res = createMockRes();

    await shareHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 when email or designData is missing', async () => {
    const req = {
      method: 'POST',
      body: { email: 'invalid' },
      headers: { 'x-forwarded-for': '192.168.1.2' },
    };
    const res = createMockRes();

    await shareHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('silently traps bots when honeypot _gotcha is provided', async () => {
    const req = {
      method: 'POST',
      body: { ...validPayload, _gotcha: 'bot-content' },
      headers: { 'x-forwarded-for': '192.168.1.3' },
    };
    const res = createMockRes();

    await shareHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rate limits excessive requests with 429', async () => {
    const ip = '10.0.0.99';
    for (let i = 0; i < 5; i++) {
      const req = { method: 'POST', body: validPayload, headers: { 'x-forwarded-for': ip } };
      const res = createMockRes();
      await shareHandler(req, res);
      expect(res.statusCode).toBe(200);
    }

    const blockedReq = { method: 'POST', body: validPayload, headers: { 'x-forwarded-for': ip } };
    const blockedRes = createMockRes();
    await shareHandler(blockedReq, blockedRes);
    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.body.error).toContain('Too many share requests');
  });

  it('handles Resend email error responses gracefully', async () => {
    const originalApiKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 're_test_key_123';
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid API key or network error', name: 'application_error' },
    });

    const req = {
      method: 'POST',
      body: validPayload,
      headers: { 'x-forwarded-for': '192.168.1.5' },
    };
    const res = createMockRes();

    await shareHandler(req, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain('Invalid API key or network error');

    process.env.RESEND_API_KEY = originalApiKey;
  });

  it('retries with fallback sender if primary sender is not verified', async () => {
    const originalApiKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 're_test_key_123';
    mockSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'domain not verified', statusCode: 403, name: 'validation_error' },
      })
      .mockResolvedValueOnce({
        data: { id: 'fallback-email-id' },
        error: null,
      });

    const req = {
      method: 'POST',
      body: validPayload,
      headers: { 'x-forwarded-for': '192.168.1.6' },
    };
    const res = createMockRes();

    await shareHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);

    process.env.RESEND_API_KEY = originalApiKey;
  });

  it('correctly handles JPEG image attachments', async () => {
    const originalApiKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 're_test_key_123';

    const req = {
      method: 'POST',
      body: {
        ...validPayload,
        previewImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
      },
      headers: { 'x-forwarded-for': '192.168.1.7' },
    };
    const res = createMockRes();

    await shareHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: 'textile-hexagon-preview.jpg',
          }),
        ]),
      })
    );

    process.env.RESEND_API_KEY = originalApiKey;
  });
});
