import { describe, it, expect, beforeEach, vi } from 'vitest';

// The generated Prisma client may not include the workshop models yet on a
// fresh checkout (it needs `pnpm db:generate`), so these tests replace the
// client with a small fake instead of spying on the real one.
const db = vi.hoisted(() => ({
  workshop: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  workshopFeedback: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('../../src/lib/prisma.js', () => ({ default: db }));

import handler from '../../src/server/workshop.js';
import adminHandler from '../../src/server/admin/workshops.js';
import { buildAdminSessionCookie } from '../../src/lib/adminAuth.js';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k: string, v: string) { res.headers[k.toLowerCase()] = v; return res; },
    status(c: number) { res.statusCode = c; return res; },
    json(d: any) { res.body = d; return res; },
    end(d?: any) { if (d) { try { res.body = JSON.parse(d); } catch { res.body = d; } } return res; },
  };
  return res;
}

let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;
const get = (qs: string) => ({ method: 'GET', url: `/api/workshop?${qs}`, headers: { 'x-forwarded-for': nextIp() } }) as any;
const post = (body: any) => ({ method: 'POST', url: '/api/workshop', headers: { 'x-forwarded-for': nextIp() }, body }) as any;

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);
const LIVE = { id: 'w1', code: 'K7Q4MX', schoolName: 'Test School', workshopDate: new Date('2026-11-30'), teams: 9, active: true, expiresAt: FUTURE };

const FEEDBACK = { code: 'k7q4mx', submissionId: 'abc12345-def', teamNumber: 3, rating: 4, oneWord: 'Fun', wouldChange: 'More time', whatWeMade: 'A bag', teamName: 'Tiles' };

describe('GET /api/workshop', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the student role for a valid code (case-insensitive)', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    const res = createMockRes();
    await handler(get('code=k7q4mx'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('student');
    expect(res.body.workshop).toEqual({ code: 'K7Q4MX', schoolName: 'Test School', workshopDate: '2026-11-30', teams: 9 });
    expect(db.workshop.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'K7Q4MX' } }));
  });

  it('returns the facilitator role for a valid facilitator key', async () => {
    db.workshop.findFirst.mockResolvedValue(LIVE);
    const res = createMockRes();
    await handler(get('key=AbCdEfGh2345'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('facilitator');
    // matched ignoring case, so a typed /workshop-cggsf works
    expect(db.workshop.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { facilitatorKey: { equals: 'AbCdEfGh2345', mode: 'insensitive' } } }));
  });

  it('a student code is never accepted as a facilitator key', async () => {
    const res = createMockRes();
    await handler(get('key=K7Q'), res); // too short for a key
    expect(res.statusCode).toBe(404);
    expect(db.workshop.findFirst).not.toHaveBeenCalled();
    // and a real student code only ever looks up facilitator keys, never the code column
    db.workshop.findFirst.mockResolvedValue(null);
    const res2 = createMockRes();
    await handler(get('key=K7Q4MX'), res2);
    expect(res2.statusCode).toBe(404);
    expect(db.workshop.findUnique).not.toHaveBeenCalled();
  });

  it('404s for an unknown code and for a malformed code', async () => {
    db.workshop.findUnique.mockResolvedValue(null);
    let res = createMockRes();
    await handler(get('code=ZZZZ99'), res);
    expect(res.statusCode).toBe(404);
    res = createMockRes();
    await handler(get('code=%24%24'), res);
    expect(res.statusCode).toBe(404);
  });

  it('410s when the code has expired or is switched off', async () => {
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, expiresAt: PAST });
    let res = createMockRes();
    await handler(get('code=K7Q4MX'), res);
    expect(res.statusCode).toBe(410);
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, active: false });
    res = createMockRes();
    await handler(get('code=K7Q4MX'), res);
    expect(res.statusCode).toBe(410);
  });

  it('allows a whole class on one IP to look up the code in the same minute', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    const req = () => ({ method: 'GET', url: '/api/workshop?code=K7Q4MX', headers: { 'x-forwarded-for': '203.0.113.50' } }) as any;
    for (let i = 0; i < 60; i++) {
      const res = createMockRes();
      await handler(req(), res);
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('POST /api/workshop (feedback)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('saves a valid submission for a live workshop', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopFeedback.create.mockResolvedValue({});
    const res = createMockRes();
    await handler(post(FEEDBACK), res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workshopId: 'w1', teamNumber: 3, rating: 4, oneWord: 'Fun', submissionId: 'abc12345-def' }),
    });
  });

  it('treats a repeated submissionId as success without a second row', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopFeedback.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = createMockRes();
    await handler(post(FEEDBACK), res);
    expect(res.statusCode).toBe(200);
  });

  it('rejects a rating outside 1-5, a missing rating and a bad submission id', async () => {
    for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: undefined }, { submissionId: 'x' }]) {
      const res = createMockRes();
      await handler(post({ ...FEEDBACK, ...bad }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(db.workshopFeedback.create).not.toHaveBeenCalled();
  });

  it('rejects a team number higher than the workshop team count', async () => {
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, teams: 4 });
    const res = createMockRes();
    await handler(post({ ...FEEDBACK, teamNumber: 5 }), res);
    expect(res.statusCode).toBe(400);
    expect(db.workshopFeedback.create).not.toHaveBeenCalled();
  });

  it('rejects feedback for an unknown or expired workshop', async () => {
    db.workshop.findUnique.mockResolvedValue(null);
    let res = createMockRes();
    await handler(post(FEEDBACK), res);
    expect(res.statusCode).toBe(404);
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, expiresAt: PAST });
    res = createMockRes();
    await handler(post(FEEDBACK), res);
    expect(res.statusCode).toBe(410);
  });

  it('trims text and stores empty optional fields as null', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopFeedback.create.mockResolvedValue({});
    const res = createMockRes();
    await handler(post({ ...FEEDBACK, oneWord: '  ', wouldChange: '', whatWeMade: undefined, teamName: '  Tiles  ' }), res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ oneWord: null, wouldChange: null, whatWeMade: null, teamName: 'Tiles' }),
    });
  });

  it('rejects over-long free text', async () => {
    const res = createMockRes();
    await handler(post({ ...FEEDBACK, wouldChange: 'x'.repeat(501) }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('admin/workshops handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-workshops';
  });
  const cookie = () => buildAdminSessionCookie().split(';')[0];

  it('requires admin auth for every method', async () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const res = createMockRes();
      await adminHandler({ method, url: '/api/admin/workshops', headers: {} } as any, res);
      expect(res.statusCode).toBe(401);
    }
  });

  it('creates a workshop with a generated code and facilitator key', async () => {
    db.workshop.findUnique.mockResolvedValue(null);
    db.workshop.create.mockImplementation(async ({ data }: any) => ({ id: 'w1', ...data }));
    const res = createMockRes();
    await adminHandler({ method: 'POST', url: '/api/admin/workshops', headers: { cookie: cookie() }, body: { schoolName: 'Test School', teams: 9, active: true } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.workshop.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(res.body.workshop.facilitatorKey).toMatch(/^[A-HJKMNP-Za-hjkmnp-z2-9]{12}$/);
    expect(res.body.workshop.facilitatorKey).not.toBe(res.body.workshop.code);
  });

  it('saves a custom facilitator link name', async () => {
    db.workshop.findUnique.mockResolvedValue(null);
    db.workshop.findFirst.mockResolvedValue(null);
    db.workshop.create.mockImplementation(async ({ data }: any) => ({ id: 'w1', ...data }));
    const res = createMockRes();
    await adminHandler({ method: 'POST', url: '/api/admin/workshops', headers: { cookie: cookie() }, body: { schoolName: 'Test School', teams: 9, active: true, facilitatorKey: 'CGGSF' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.workshop.facilitatorKey).toBe('CGGSF');
  });

  it('rejects a facilitator link name that is already taken, is too short, or matches a student code', async () => {
    const post = async (body: any) => {
      const res = createMockRes();
      await adminHandler({ method: 'POST', url: '/api/admin/workshops', headers: { cookie: cookie() }, body: { schoolName: 'S', teams: 9, active: true, code: 'K7Q4MX', ...body } } as any, res);
      return res;
    };
    db.workshop.findUnique.mockResolvedValue(null);
    // too short
    expect((await post({ facilitatorKey: 'AB' })).statusCode).toBe(400);
    // same as this workshop's student code
    db.workshop.findFirst.mockResolvedValue(null);
    expect((await post({ facilitatorKey: 'k7q4mx' })).statusCode).toBe(409);
    // used by another workshop's facilitator link (first findFirst = code-as-key check, second = key clash)
    db.workshop.findFirst.mockReset();
    db.workshop.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other' });
    expect((await post({ facilitatorKey: 'CGGSF' })).statusCode).toBe(409);
    // equal to some other workshop's student code
    db.workshop.findFirst.mockReset();
    db.workshop.findFirst.mockResolvedValue(null);
    db.workshop.findUnique.mockReset();
    db.workshop.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other' }); // code clash check, then key-is-a-code check
    expect((await post({ facilitatorKey: 'ABCDEF' })).statusCode).toBe(409);
  });

  it('gives a missing facilitator key to older workshops when listing', async () => {
    const old = { id: 'w9', code: 'OLD123', schoolName: 'Old', workshopDate: null, teams: 9, notes: null, active: true, expiresAt: null, facilitatorKey: null };
    db.workshop.findMany.mockResolvedValueOnce([old]).mockResolvedValueOnce([{ ...old, facilitatorKey: 'newKey123456' }]);
    db.workshop.update.mockResolvedValue({});
    const res = createMockRes();
    await adminHandler({ method: 'GET', url: '/api/admin/workshops', headers: { cookie: cookie() } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(db.workshop.update).toHaveBeenCalledTimes(1);
    expect(res.body.workshops[0].facilitatorKey).toBe('newKey123456');
  });

  it('lists a workshop\'s feedback and hides an entry', async () => {
    db.workshopFeedback.findMany.mockResolvedValue([{ id: 'f1', teamNumber: 1, rating: 5 }]);
    let res = createMockRes();
    await adminHandler({ method: 'GET', url: '/api/admin/workshops?feedback=w1', headers: { cookie: cookie() } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.feedback).toHaveLength(1);

    const FID = '11111111-1111-4111-8111-111111111111';
    db.workshopFeedback.findUnique.mockResolvedValue({ id: FID });
    db.workshopFeedback.update.mockResolvedValue({ id: FID, hidden: true });
    res = createMockRes();
    await adminHandler({ method: 'PATCH', url: '/api/admin/workshops', headers: { cookie: cookie() }, body: { feedbackId: FID, hidden: true } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopFeedback.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hidden: true } }));
  });
});
