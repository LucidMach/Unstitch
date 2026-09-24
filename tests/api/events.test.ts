import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import eventsHandler from '../../src/server/events.js';
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

const NOW = new Date('2026-06-01T00:00:00Z');

function makeEvent(overrides: Record<string, any>) {
  return {
    id: overrides.id || 'evt-1',
    slug: overrides.slug || 'some-event',
    title: overrides.title || 'Some Event',
    location: overrides.location ?? 'Melbourne',
    description: overrides.description ?? 'Description',
    color: overrides.color ?? '#6D771A',
    startsAt: overrides.startsAt,
    endsAt: overrides.endsAt ?? null,
    ctaLabel: overrides.ctaLabel ?? null,
    ctaUrl: overrides.ctaUrl ?? null,
    raffleEnabled: overrides.raffleEnabled ?? false,
    raffleButtonLabel: overrides.raffleButtonLabel ?? null,
    raffleClosesAt: overrides.raffleClosesAt ?? null,
    raffleDrawCopy: overrides.raffleDrawCopy ?? null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };
}

describe('events API handler (/api/events)', () => {
  beforeEach(() => {
    limiter.reset();
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects non-GET methods with 405', async () => {
    const req: any = { method: 'POST' };
    const res = createMockRes();
    await eventsHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['allow']).toBe('GET');
  });

  it('returns 429 once the rate limit is exceeded', async () => {
    vi.spyOn(prisma.event, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.drop, 'findMany').mockResolvedValue([]);
    const req: any = { method: 'GET', headers: { 'x-real-ip': '9.9.9.9' } };

    for (let i = 0; i < 60; i++) {
      const res = createMockRes();
      await eventsHandler(req, res);
      expect(res.statusCode).toBe(200);
    }

    const res = createMockRes();
    await eventsHandler(req, res);
    expect(res.statusCode).toBe(429);
  });

  it('returns upcoming: null, past: [], nextBatchDrop: null when empty', async () => {
    vi.spyOn(prisma.event, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.drop, 'findMany').mockResolvedValue([]);
    const req: any = { method: 'GET', headers: {} };
    const res = createMockRes();
    await eventsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ upcoming: null, past: [], nextBatchDrop: null, activeRaffle: null });
  });

  it('correctly reports raffleOpen: true before raffleClosesAt and false after', async () => {
    const openEvent = makeEvent({
      id: 'e1',
      slug: 'open-raffle',
      startsAt: new Date('2026-06-10T00:00:00Z'),
      raffleEnabled: true,
      raffleClosesAt: new Date('2026-06-12T00:00:00Z'), // in future relative to NOW (June 1)
      color: '#B45309',
    });

    vi.spyOn(prisma.event, 'findMany').mockResolvedValue([openEvent] as any);
    vi.spyOn(prisma.drop, 'findMany').mockResolvedValue([]);

    const req: any = { method: 'GET', headers: {} };
    const res = createMockRes();
    await eventsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.upcoming.raffleOpen).toBe(true);
    expect(res.body.upcoming.color).toBe('#B45309');
    expect(res.body.activeRaffle.raffleOpen).toBe(true);

    // Advance clock past raffleClosesAt
    vi.setSystemTime(new Date('2026-06-13T00:00:00Z'));
    const res2 = createMockRes();
    await eventsHandler(req, res2);

    expect(res2.statusCode).toBe(200);
    // Effective end is June 10, so it moved to past, upcoming is null
    expect(res2.body.upcoming).toBeNull();
    expect(res2.body.past).toHaveLength(1);
    expect(res2.body.activeRaffle).toBeNull();
  });

  it('keeps activeRaffle available even if event dates are past but raffle remains open', async () => {
    const pastWorkshopActiveRaffle = makeEvent({
      id: 'zwf-1',
      slug: 'zero-waste-festival-2026',
      title: 'Zero Waste Festival',
      startsAt: new Date('2026-05-12T00:00:00Z'), // in the past relative to NOW (June 1)
      endsAt: new Date('2026-05-12T18:00:00Z'),
      raffleEnabled: true,
      raffleClosesAt: new Date('2026-06-15T00:00:00Z'), // in the future relative to NOW (June 1)
      color: '#6D771A',
    });

    vi.spyOn(prisma.event, 'findMany').mockResolvedValue([pastWorkshopActiveRaffle] as any);
    vi.spyOn(prisma.drop, 'findMany').mockResolvedValue([]);

    const req: any = { method: 'GET', headers: {} };
    const res = createMockRes();
    await eventsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.upcoming).toBeNull();
    expect(res.body.past).toHaveLength(1);
    expect(res.body.activeRaffle).not.toBeNull();
    expect(res.body.activeRaffle.slug).toBe('zero-waste-festival-2026');
    expect(res.body.activeRaffle.raffleOpen).toBe(true);
    expect(res.body.activeRaffle.color).toBe('#6D771A');
  });

  it('includes nextBatchDrop with product info when scheduled', async () => {
    vi.spyOn(prisma.event, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.drop, 'findMany').mockResolvedValue([
      {
        id: 'd1',
        dropCode: 'D002',
        totalUnits: 150,
        status: 'UPCOMING',
        madeLocation: 'Melbourne',
        madeYear: 2026,
        releaseAt: new Date('2026-07-01T10:00:00Z'),
        product: { name: 'Modular Tote 02', imageUrl: '/assets/drop-02.jpg' },
      },
    ] as any);

    const req: any = { method: 'GET', headers: {} };
    const res = createMockRes();
    await eventsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.nextBatchDrop).toEqual({
      id: 'd1',
      dropCode: 'D002',
      productName: 'Modular Tote 02',
      productImage: '/assets/drop-02.jpg',
      releaseAt: new Date('2026-07-01T10:00:00Z'),
      totalUnits: 150,
      status: 'UPCOMING',
      madeLocation: 'Melbourne',
      madeYear: 2026,
    });
  });
});
