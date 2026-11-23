import { describe, it, expect, beforeEach, vi } from 'vitest';

// The generated Prisma client may not include the workshop models yet on a
// fresh checkout (it needs `pnpm db:generate`), so these tests replace the
// client with a small fake instead of spying on the real one.
const db = vi.hoisted(() => ({
  workshop: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  workshopFeedback: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  workshopTeacherFeedback: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  workshopSchoolFeedback: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  workshopFacilitatorFeedback: { create: vi.fn(), findMany: vi.fn() },
  workshopSlideNote: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
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

const SCORES = { reuse: 5, connect: 4, spatial: 3, discover: 5, team: 2 };
const FEEDBACK = {
  code: 'k7q4mx', submissionId: 'abc12345-def', scores: SCORES,
  interesting: 'Tiles fold', wouldChange: 'More time', whatWeMade: 'A bag', teamName: 'Tiles',
};
const TEACHER = {
  kind: 'teacher', code: 'k7q4mx', submissionId: 'teach1234-abc', engagement: 'very',
  observed: ['modular', 'spatial', 'modular'], appropriate: 'appropriate', valuable: 'Hands-on', improve: '', recommend: 'yes',
};
const SCHOOL_ANSWERS = {
  q1: 'excellent', q2: 'well', q3: ['sustainability', 'stem', 'stem'], q4: 'appropriate',
  q5: 'very-good', q6: 'mostly', q7: '  Students loved it  ', q8: 'yes',
};
const SCHOOL = { kind: 'school', code: 'k7q4mx', submissionId: 'school123-abc', answers: SCHOOL_ANSWERS };
const FACILITATOR = {
  kind: 'facilitator', key: 'CGGSF', submissionId: 'fac123456-abc',
  answers: {
    outcomes: { reuse: '3', teamwork: 'no', bogus: '1' },
    delivery: { engaging: '  Building  ' },
    checks: { time: { choice: 'partly', note: 'A bit short' } },
    open: { change: 'More tiles' },
    obs: { beyond: 'yes', difficulty: 'Tabs bend' },
  },
};

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
      data: expect.objectContaining({
        workshopId: 'w1', submissionId: 'abc12345-def',
        scoreReuse: 5, scoreConnect: 4, scoreSpatial: 3, scoreDiscover: 5, scoreTeam: 2,
        interesting: 'Tiles fold', wouldChange: 'More time', whatWeMade: 'A bag',
      }),
    });
  });

  it('treats a repeated submissionId as success without a second row', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopFeedback.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = createMockRes();
    await handler(post(FEEDBACK), res);
    expect(res.statusCode).toBe(200);
  });

  it('rejects a score outside 1-5, a missing statement and a bad submission id', async () => {
    const without = (k: string) => Object.fromEntries(Object.entries(SCORES).filter(([key]) => key !== k));
    for (const bad of [
      { scores: { ...SCORES, reuse: 0 } },
      { scores: { ...SCORES, team: 6 } },
      { scores: without('spatial') },
      { scores: undefined },
      { submissionId: 'x' },
    ]) {
      const res = createMockRes();
      await handler(post({ ...FEEDBACK, ...bad }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(db.workshopFeedback.create).not.toHaveBeenCalled();
  });

  it('does not need or store a team number', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopFeedback.create.mockResolvedValue({});
    const res = createMockRes();
    await handler(post({ ...FEEDBACK, teamNumber: 3 }), res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopFeedback.create.mock.calls[0][0].data).not.toHaveProperty('teamNumber');
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
    await handler(post({ ...FEEDBACK, interesting: '  ', wouldChange: '', whatWeMade: undefined, teamName: '  Tiles  ' }), res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ interesting: null, wouldChange: null, whatWeMade: null, teamName: 'Tiles' }),
    });
  });

  it('rejects over-long free text', async () => {
    const res = createMockRes();
    await handler(post({ ...FEEDBACK, wouldChange: 'x'.repeat(501) }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unknown feedback type', async () => {
    const res = createMockRes();
    await handler(post({ ...FEEDBACK, kind: 'parent' }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/workshop (teacher feedback)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('saves a teacher submission and removes repeated choices', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopTeacherFeedback.create.mockResolvedValue({});
    const res = createMockRes();
    await handler(post(TEACHER), res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopTeacherFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workshopId: 'w1', engagement: 'very', observed: ['modular', 'spatial'], appropriate: 'appropriate',
        valuable: 'Hands-on', improve: null, recommend: 'yes',
      }),
    });
    expect(db.workshopFeedback.create).not.toHaveBeenCalled();
  });

  it('needs the three multiple-choice answers and only accepts the listed choices', async () => {
    for (const bad of [{ engagement: undefined }, { appropriate: 'great' }, { recommend: undefined }, { observed: ['nonsense'] }]) {
      const res = createMockRes();
      await handler(post({ ...TEACHER, ...bad }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(db.workshopTeacherFeedback.create).not.toHaveBeenCalled();
  });

  it('counts a repeated teacher submission once and refuses an expired workshop', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopTeacherFeedback.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    let res = createMockRes();
    await handler(post(TEACHER), res);
    expect(res.statusCode).toBe(200);
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, expiresAt: PAST });
    res = createMockRes();
    await handler(post(TEACHER), res);
    expect(res.statusCode).toBe(410);
  });
});

describe('POST /api/workshop (school feedback)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('saves the answers, trims text and removes repeated choices', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopSchoolFeedback.create.mockResolvedValue({});
    const res = createMockRes();
    await handler(post({ ...SCHOOL, answers: { ...SCHOOL_ANSWERS, q9: '', bogus: 'x' } }), res);
    expect(res.statusCode).toBe(200);
    const data = db.workshopSchoolFeedback.create.mock.calls[0][0].data;
    expect(data.workshopId).toBe('w1');
    expect(data.submissionId).toBe('school123-abc');
    expect(data.answers.q3).toEqual(['sustainability', 'stem']);
    expect(data.answers.q7).toBe('Students loved it');
    expect(data.answers).not.toHaveProperty('q9');
    expect(data.answers).not.toHaveProperty('bogus');
    expect(db.workshopFeedback.create).not.toHaveBeenCalled();
    expect(db.workshopTeacherFeedback.create).not.toHaveBeenCalled();
  });

  it('names the first required question that is missing', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    const { q5: _q5, ...withoutQ5 } = SCHOOL_ANSWERS;
    const res = createMockRes();
    await handler(post({ ...SCHOOL, answers: withoutQ5 }), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toContain('question 5');
    expect(db.workshopSchoolFeedback.create).not.toHaveBeenCalled();
  });

  it('only accepts the listed choices', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    for (const bad of [{ q1: 'amazing' }, { q3: ['nonsense'] }, { q8: 'maybe' }]) {
      const res = createMockRes();
      await handler(post({ ...SCHOOL, answers: { ...SCHOOL_ANSWERS, ...bad } }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(db.workshopSchoolFeedback.create).not.toHaveBeenCalled();
  });

  it('accepts "Other" alone for question 3', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopSchoolFeedback.create.mockResolvedValue({});
    const res = createMockRes();
    await handler(post({ ...SCHOOL, answers: { ...SCHOOL_ANSWERS, q3: [], q3_other: 'Upcycling' } }), res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopSchoolFeedback.create.mock.calls[0][0].data.answers.q3_other).toBe('Upcycling');
  });

  it('asks how a testimonial may be used only when there is a testimonial', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopSchoolFeedback.create.mockResolvedValue({});
    let res = createMockRes();
    await handler(post({ ...SCHOOL, answers: { ...SCHOOL_ANSWERS, q11: 'Brilliant' } }), res);
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toContain('question 12');
    res = createMockRes();
    await handler(post({ ...SCHOOL, answers: { ...SCHOOL_ANSWERS, q11: 'Brilliant', q12: 'school-only', q13: 'A. Teacher, Liaison', q15: 'a@b.co' } }), res);
    expect(res.statusCode).toBe(200);
    // no testimonial: question 12 is not needed, and a blank email is fine
    res = createMockRes();
    await handler(post({ ...SCHOOL, submissionId: 'school999-xyz', answers: { ...SCHOOL_ANSWERS, q15: '' } }), res);
    expect(res.statusCode).toBe(200);
    // but a malformed email is rejected
    res = createMockRes();
    await handler(post({ ...SCHOOL, submissionId: 'school888-xyz', answers: { ...SCHOOL_ANSWERS, q15: 'not-an-email' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('counts a repeated submission once', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopSchoolFeedback.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = createMockRes();
    await handler(post(SCHOOL), res);
    expect(res.statusCode).toBe(200);
  });

  it('stays open for 21 days after the workshop date, then closes, and a switch-off closes it at once', async () => {
    db.workshopSchoolFeedback.create.mockResolvedValue({});
    const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
    // default cut-off is the date + 3 days, so both are in the past here
    const row = (dateDaysAgo: number) => ({ ...LIVE, workshopDate: daysAgo(dateDaysAgo), expiresAt: daysAgo(dateDaysAgo - 3) });
    db.workshop.findUnique.mockResolvedValue(row(20));
    let res = createMockRes();
    await handler(post(SCHOOL), res);
    expect(res.statusCode).toBe(200);
    db.workshop.findUnique.mockResolvedValue(row(22));
    res = createMockRes();
    await handler(post({ ...SCHOOL, submissionId: 'school777-xyz' }), res);
    expect(res.statusCode).toBe(410);
    // a later manual cut-off on the code still keeps the form open
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, workshopDate: daysAgo(30), expiresAt: FUTURE });
    res = createMockRes();
    await handler(post({ ...SCHOOL, submissionId: 'school555-xyz' }), res);
    expect(res.statusCode).toBe(200);
    // no workshop date: 21 days after the cut-off
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, workshopDate: null, expiresAt: daysAgo(10) });
    res = createMockRes();
    await handler(post({ ...SCHOOL, submissionId: 'school444-xyz' }), res);
    expect(res.statusCode).toBe(200);
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, active: false });
    res = createMockRes();
    await handler(post({ ...SCHOOL, submissionId: 'school666-xyz' }), res);
    expect(res.statusCode).toBe(410);
  });

  it('GET with for=school is still open after the student code has expired', async () => {
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, expiresAt: new Date(Date.now() - 10 * 86_400_000) });
    let res = createMockRes();
    await handler(get('code=K7Q4MX'), res);
    expect(res.statusCode).toBe(410);
    res = createMockRes();
    await handler(get('code=K7Q4MX&for=school'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.workshop.schoolName).toBe('Test School');
    db.workshop.findUnique.mockResolvedValue({ ...LIVE, active: false });
    res = createMockRes();
    await handler(get('code=K7Q4MX&for=school'), res);
    expect(res.statusCode).toBe(410);
  });
});

describe('POST /api/workshop (facilitator feedback)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('saves the answers under the facilitator key, keeping only known questions', async () => {
    db.workshop.findFirst.mockResolvedValue(LIVE);
    db.workshopFacilitatorFeedback.create.mockResolvedValue({});
    const res = createMockRes();
    await handler(post(FACILITATOR), res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopFacilitatorFeedback.create).toHaveBeenCalledWith({
      data: {
        workshopId: 'w1',
        submissionId: 'fac123456-abc',
        answers: {
          outcomes: { reuse: '3', teamwork: 'no' },
          delivery: { engaging: 'Building' },
          checks: { time: { choice: 'partly', note: 'A bit short' } },
          open: { change: 'More tiles' },
          obs: { beyond: 'yes', difficulty: 'Tabs bend' },
        },
      },
    });
  });

  it('is sent with the facilitator key, so a student code does not work', async () => {
    db.workshop.findFirst.mockResolvedValue(null);
    const res = createMockRes();
    await handler(post({ ...FACILITATOR, key: undefined, code: 'K7Q4MX' }), res);
    expect(res.statusCode).toBe(400);
    const res2 = createMockRes();
    await handler(post(FACILITATOR), res2);
    expect(res2.statusCode).toBe(404);
    expect(db.workshopFacilitatorFeedback.create).not.toHaveBeenCalled();
  });

  it('refuses an empty form and an answer that is not one of the choices', async () => {
    db.workshop.findFirst.mockResolvedValue(LIVE);
    let res = createMockRes();
    await handler(post({ ...FACILITATOR, answers: { outcomes: {}, open: { change: '   ' } } }), res);
    expect(res.statusCode).toBe(400);
    res = createMockRes();
    await handler(post({ ...FACILITATOR, answers: { outcomes: { reuse: '9' } } }), res);
    expect(res.statusCode).toBe(400);
    expect(db.workshopFacilitatorFeedback.create).not.toHaveBeenCalled();
  });
});

describe('speaker notes edited on the page', () => {
  beforeEach(() => vi.resetAllMocks());

  it('lists only the edited slides, for a facilitator key', async () => {
    db.workshop.findFirst.mockResolvedValue(LIVE);
    db.workshopSlideNote.findMany.mockResolvedValue([{ slide: 3, notes: 'My words' }, { slide: 25, notes: 'Go!' }]);
    const res = createMockRes();
    await handler(get('key=CGGSF&notes=1'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.notes).toEqual({ '3': 'My words', '25': 'Go!' });
  });

  it('does not hand the notes to a student code or an unknown or expired key', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    let res = createMockRes();
    await handler(get('code=K7Q4MX&notes=1'), res);
    expect(res.body.role).toBe('student');
    expect(res.body.notes).toBeUndefined();
    db.workshop.findFirst.mockResolvedValue(null);
    res = createMockRes();
    await handler(get('key=NOPE12&notes=1'), res);
    expect(res.statusCode).toBe(404);
    db.workshop.findFirst.mockResolvedValue({ ...LIVE, expiresAt: PAST });
    res = createMockRes();
    await handler(get('key=CGGSF&notes=1'), res);
    expect(res.statusCode).toBe(410);
    expect(db.workshopSlideNote.findMany).not.toHaveBeenCalled();
  });

  it('saves a slide\'s notes under the facilitator key', async () => {
    db.workshop.findFirst.mockResolvedValue(LIVE);
    const res = createMockRes();
    await handler(post({ kind: 'notes', key: 'CGGSF', slide: 3, notes: '  New words  ' }), res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopSlideNote.upsert).toHaveBeenCalledWith({
      where: { slide: 3 }, create: { slide: 3, notes: 'New words' }, update: { notes: 'New words' },
    });
  });

  it('puts the deck notes back when the text is empty', async () => {
    db.workshop.findFirst.mockResolvedValue(LIVE);
    for (const notes of [null, '   ']) {
      const res = createMockRes();
      await handler(post({ kind: 'notes', key: 'CGGSF', slide: 3, notes }), res);
      expect(res.statusCode).toBe(200);
    }
    expect(db.workshopSlideNote.deleteMany).toHaveBeenCalledWith({ where: { slide: 3 } });
    expect(db.workshopSlideNote.upsert).not.toHaveBeenCalled();
  });

  it('refuses a student code, a bad slide number and a missing key', async () => {
    db.workshop.findFirst.mockResolvedValue(null);
    let res = createMockRes();
    await handler(post({ kind: 'notes', key: 'CGGSF', slide: 3, notes: 'x' }), res);
    expect(res.statusCode).toBe(404);
    for (const bad of [{ slide: 0 }, { slide: 'x' }, { key: undefined, code: 'K7Q4MX' }, { notes: 'x'.repeat(4001) }]) {
      res = createMockRes();
      await handler(post({ kind: 'notes', key: 'CGGSF', slide: 3, notes: 'x', ...bad }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(db.workshopSlideNote.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/workshop when the save fails', () => {
  beforeEach(() => vi.resetAllMocks());

  it('says what is wrong outside production and stays generic in production', async () => {
    db.workshop.findUnique.mockResolvedValue(LIVE);
    db.workshopFeedback.create.mockRejectedValue(Object.assign(new Error('The column `score_reuse` does not exist'), { code: 'P2022' }));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      let res = createMockRes();
      await handler(post(FEEDBACK), res);
      expect(res.statusCode).toBe(500);
      expect(res.body.dev).toBe(true);
      expect(res.body.error).toMatch(/pnpm db:push/);
      process.env.NODE_ENV = 'production';
      res = createMockRes();
      await handler(post(FEEDBACK), res);
      expect(res.statusCode).toBe(500);
      expect(res.body.dev).toBeUndefined();
      expect(res.body.error).not.toMatch(/db:push/);
    } finally {
      process.env.NODE_ENV = prev;
      quiet.mockRestore();
    }
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
    db.workshopFeedback.findMany.mockResolvedValue([{ id: 'f1', teamNumber: 1, scoreReuse: 5 }]);
    db.workshopTeacherFeedback.findMany.mockResolvedValue([{ id: 't1', engagement: 'very' }]);
    db.workshopFacilitatorFeedback.findMany.mockResolvedValue([{ id: 'x1', answers: {} }]);
    db.workshopSchoolFeedback.findMany.mockResolvedValue([{ id: 's1', answers: { q1: 'excellent' } }]);
    let res = createMockRes();
    await adminHandler({ method: 'GET', url: '/api/admin/workshops?feedback=w1', headers: { cookie: cookie() } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.feedback).toHaveLength(1);
    expect(res.body.teacherFeedback).toHaveLength(1);
    expect(res.body.facilitatorFeedback).toHaveLength(1);
    expect(res.body.schoolFeedback).toHaveLength(1);

    const FID = '11111111-1111-4111-8111-111111111111';
    db.workshopFeedback.findUnique.mockResolvedValue({ id: FID });
    db.workshopFeedback.update.mockResolvedValue({ id: FID, hidden: true });
    res = createMockRes();
    await adminHandler({ method: 'PATCH', url: '/api/admin/workshops', headers: { cookie: cookie() }, body: { feedbackId: FID, hidden: true } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopFeedback.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hidden: true } }));

    const TID = '22222222-2222-4222-8222-222222222222';
    db.workshopTeacherFeedback.findUnique.mockResolvedValue({ id: TID });
    db.workshopTeacherFeedback.update.mockResolvedValue({ id: TID, hidden: true });
    res = createMockRes();
    await adminHandler({ method: 'PATCH', url: '/api/admin/workshops', headers: { cookie: cookie() }, body: { feedbackId: TID, hidden: true, kind: 'teacher' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopTeacherFeedback.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hidden: true } }));

    const SID = '33333333-3333-4333-8333-333333333333';
    db.workshopSchoolFeedback.findUnique.mockResolvedValue({ id: SID });
    db.workshopSchoolFeedback.update.mockResolvedValue({ id: SID, hidden: true });
    res = createMockRes();
    await adminHandler({ method: 'PATCH', url: '/api/admin/workshops', headers: { cookie: cookie() }, body: { feedbackId: SID, hidden: true, kind: 'school' } } as any, res);
    expect(res.statusCode).toBe(200);
    expect(db.workshopSchoolFeedback.update).toHaveBeenCalledWith(expect.objectContaining({ data: { hidden: true } }));
  });
});
