import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import eventsHandler from '../../src/server/admin/events.js';
import { buildAdminSessionCookie } from '../../src/lib/adminAuth.js';

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
  const setCookie = buildAdminSessionCookie();
  return setCookie.split(';')[0];
}

const EVENT_ID = '11111111-1111-1111-1111-111111111111';

const EVENT = {
  id: EVENT_ID,
  slug: 'zero-waste-festival-2026',
  title: 'Zero Waste Festival',
  location: 'Fed Square, Melbourne',
  description: 'Drop-in tile building all day.',
  color: '#6D771A',
  startsAt: new Date('2026-09-12T12:00:00+10:00'),
  endsAt: new Date('2026-09-12T18:00:00+10:00'),
  ctaLabel: 'Learn More',
  ctaUrl: 'https://example.com',
  raffleEnabled: true,
  raffleButtonLabel: 'Enter the Raffle Draw',
  raffleClosesAt: new Date('2026-09-16T18:00:00+10:00'),
  raffleDrawCopy: "We'll draw live on Wednesday.",
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const VALID_PAYLOAD = {
  title: 'Zero Waste Festival',
  slug: 'zero-waste-festival-2026',
  location: 'Fed Square, Melbourne',
  description: 'Drop-in tile building all day.',
  color: '#6D771A',
  startsAt: '2026-09-12T12:00:00+10:00',
  endsAt: '2026-09-12T18:00:00+10:00',
  ctaLabel: 'Learn More',
  ctaUrl: 'https://example.com',
  raffleEnabled: true,
  raffleButtonLabel: 'Enter the Raffle Draw',
  raffleClosesAt: '2026-09-16T18:00:00+10:00',
  raffleDrawCopy: "We'll draw live on Wednesday.",
};

describe('admin/events API handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-events';
  });

  it('rejects an unauthenticated GET with 401', async () => {
    const req: any = { method: 'GET', headers: {} };
    const res = createMockRes();
    await eventsHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unauthenticated POST with 401', async () => {
    const req: any = { method: 'POST', headers: {}, body: VALID_PAYLOAD };
    const res = createMockRes();
    await eventsHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid color formats to prevent CSS/script injection', async () => {
    const maliciousPayload = {
      ...VALID_PAYLOAD,
      color: 'red; background: url(evil.com)',
    };
    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: maliciousPayload,
    };
    const res = createMockRes();
    await eventsHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.fieldErrors?.color).toBeDefined();
  });

  it('creates an event with valid hex color and fields', async () => {
    vi.spyOn(prisma.event, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.event, 'create').mockResolvedValue(EVENT as any);

    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: VALID_PAYLOAD,
    };
    const res = createMockRes();
    await eventsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.event).toEqual(EVENT);
  });

  it('deletes an event by id', async () => {
    vi.spyOn(prisma.event, 'findUnique').mockResolvedValue(EVENT as any);
    vi.spyOn(prisma.event, 'delete').mockResolvedValue(EVENT as any);

    const req: any = {
      method: 'DELETE',
      headers: { cookie: adminCookieHeader() },
      url: `/api/admin/events?id=${EVENT_ID}`,
    };
    const res = createMockRes();
    await eventsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
