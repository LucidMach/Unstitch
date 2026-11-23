// src/server/workshop.ts -- public. Wired in at /api/workshop via
// api/[...route].ts (and the dev middleware in astro.config.ts).
//
// GET  /api/workshop?code=ABC234   (the student and teacher QR link)
// GET  /api/workshop?key=<key>     (the facilitator's own link)
//   200 -> { role: 'student' | 'facilitator',
//            workshop: { code, schoolName, workshopDate, teams } }
//   404 -> unknown code or key
//   410 -> exists but is switched off or has expired
//
// GET  /api/workshop?code=ABC234&for=school   (the school feedback page: stays open for 60 days after the workshop expires)
// GET  /api/workshop?key=<key>&notes=1   (facilitator only)
//   200 -> { notes: { "<slide>": "<edited notes>" } }   only the slides that were edited
//
// POST /api/workshop               (feedback and notes; `kind` says which)
//   kind "student" (the default; sent with `code`):
//     { code, submissionId, scores: { reuse, connect, spatial, discover, team },
//       teamName?, whatWeMade?, interesting?, wouldChange? }
//   kind "teacher" (sent with `code`):
//     { code, submissionId, engagement, observed[], appropriate, valuable?, improve?, recommend }
//   kind "facilitator" (sent with the facilitator `key`, so students cannot send it):
//     { key, submissionId, answers: { outcomes, delivery, checks, open, obs } }
//   kind "school" (sent with `code`; the teacher liaison and other school staff):
//     { code, submissionId, answers: { q1 ... q15, q3_other } }   see schoolForm in workshopFeedback.ts
//   kind "notes" (sent with the facilitator `key`): { key, slide, notes }
//     saves the edited speaker notes for a slide, for every workshop; empty or null notes put the deck's version back
//   200 -> { ok: true }   (also when the same submissionId arrives twice)
//
// The questions and choices are listed in src/lib/constants/workshopFeedback.ts.
//
// The hub's content is not secret. The code ties a session to a booking
// (school name, team count) and lets us switch a workshop off afterwards.
// The facilitator key is a separate, longer value, so a student's link
// never shows the Facilitator tab.
//
// Rate limits are per IP and generous on purpose: a whole class sits behind
// one school Wi-Fi address and opens the QR link within the same minute.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';
import {
  schoolQuestions,
  studentStatements,
  teacherForm,
  facilitatorScale,
  facilitatorOutcomes,
  facilitatorDeliveryOpen,
  facilitatorDeliveryChecks,
  facilitatorYesPartlyNo,
  facilitatorOpen,
  facilitatorObservations,
} from '../lib/constants/workshopFeedback.js';

const clean = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const codeField = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,16}$/, 'Missing workshop code');
const keyField = z.string().trim().regex(/^[A-Za-z0-9]{5,24}$/, 'Missing facilitator link');
const submissionField = z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid submission id');

const score = z.coerce.number().int().min(1, 'Answer every statement').max(5, 'Answer every statement');

const StudentSchema = z.object({
  code: codeField,
  submissionId: submissionField,
  scores: z.object({
    reuse: score,
    connect: score,
    spatial: score,
    discover: score,
    team: score,
  }),
  teamName: clean(80),
  whatWeMade: clean(240),
  interesting: clean(500),
  wouldChange: clean(500),
});

const values = (choices: readonly { v: string }[]) => choices.map((c) => c.v) as [string, ...string[]];

const TeacherSchema = z.object({
  code: codeField,
  submissionId: submissionField,
  engagement: z.enum(values(teacherForm.engagement.choices), { message: 'Choose one for the first question' }),
  observed: z.array(z.enum(values(teacherForm.observed.choices))).max(10).default([]),
  appropriate: z.enum(values(teacherForm.appropriate.choices), { message: 'Choose one for the third question' }),
  valuable: clean(1500),
  improve: clean(1500),
  recommend: z.enum(values(teacherForm.recommend.choices), { message: 'Choose one for the last question' }),
});

// The facilitator's answers are stored as one JSON object. Every known key is optional (a section can be
// skipped); unknown keys are dropped, and text is trimmed and length-limited.
const text = (max: number) => z.string().trim().max(max).optional();
const oneOf = (choices: readonly { v: string }[]) => z.enum(values(choices)).optional();
const shape = <T extends readonly { key: string }[]>(items: T, make: (item: T[number]) => z.ZodTypeAny) =>
  z.object(Object.fromEntries(items.map((i) => [i.key, make(i).optional()])) as Record<string, z.ZodTypeAny>).default({});

const FacilitatorAnswers = z.object({
  outcomes: shape(facilitatorOutcomes, () => oneOf(facilitatorScale)),
  delivery: shape(facilitatorDeliveryOpen, () => text(1000)),
  checks: shape(facilitatorDeliveryChecks, () => z.object({ choice: oneOf(facilitatorYesPartlyNo), note: text(1000) })),
  open: shape(facilitatorOpen, () => text(1500)),
  obs: shape(facilitatorObservations, (o) => (o.kind === 'text' ? text(300) : oneOf(facilitatorYesPartlyNo))),
});

const NotesSchema = z.object({
  key: keyField,
  slide: z.coerce.number().int().min(1).max(100),
  notes: z.string().max(4000).nullable(),
});

// The school evaluation: the answers object is built from the questions, so a new question only needs adding
// to schoolForm. Required questions are checked afterwards (missingSchoolAnswer) so the message can name one.
const schoolShape: Record<string, z.ZodTypeAny> = {};
for (const q of schoolQuestions) {
  if (q.kind === 'single') schoolShape[q.key] = oneOf(q.choices);
  else if (q.kind === 'multi') {
    schoolShape[q.key] = z.array(z.enum(values(q.choices))).max(12).optional();
    schoolShape[`${q.key}_other`] = text(300);
  } else if (q.kind === 'text') schoolShape[q.key] = text(3000);
  else schoolShape[q.key] = q.type === 'email' ? z.union([z.literal(''), z.string().trim().max(200).email('Check the email address')]).optional() : text(200);
}

const SchoolSchema = z.object({
  code: codeField,
  submissionId: submissionField,
  answers: z.object(schoolShape).default({}),
});

/** The first required school question that has no answer, or null. The testimonial permission is needed only when one was written. */
function missingSchoolAnswer(a: Record<string, any>): { key: string; n: number } | null {
  const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : v != null);
  for (const q of schoolQuestions) {
    const needed = q.key === 'q12' ? filled(a.q11) : !q.optional;
    if (!needed) continue;
    const ok = q.kind === 'multi' ? filled(a[q.key]) || filled(a[`${q.key}_other`]) : filled(a[q.key]);
    if (!ok) return { key: q.key, n: q.n };
  }
  return null;
}

const FacilitatorSchema = z.object({
  key: keyField,
  submissionId: submissionField,
  answers: FacilitatorAnswers,
});

/** True when the object holds at least one non-empty answer anywhere inside it. */
function hasAnyAnswer(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (v && typeof v === 'object') return Object.values(v as object).some(hasAnyAnswer);
  return false;
}

/** Drops empty strings and empty groups so the stored JSON only holds what was answered. */
function prune(v: any): any {
  if (typeof v === 'string') return v.trim() || undefined;
  if (Array.isArray(v)) {
    const items = [...new Set(v.map(prune).filter((x) => x !== undefined))];
    return items.length ? items : undefined;
  }
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) {
      const p = prune(x);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v ?? undefined;
}

function isLive(row: { active: boolean; expiresAt: Date | null }): boolean {
  return row.active && !(row.expiresAt && row.expiresAt.getTime() < Date.now());
}

// School staff often answer a few days after the workshop, so their form stays open for 60 days after the
// code expires. Switching a workshop off (active = false) still closes it.
const SCHOOL_GRACE_MS = 60 * 86_400_000;
function isLiveForSchool(row: { active: boolean; expiresAt: Date | null }): boolean {
  return row.active && !(row.expiresAt && row.expiresAt.getTime() + SCHOOL_GRACE_MS < Date.now());
}

export default async function handler(req: any, res: any): Promise<any> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // 200 a minute is far above a classroom scanning a QR code together and far
  // below what is needed to guess a 6-character code (31^6 possibilities).
  const rate = checkRateLimit(req, {
    limit: req.method === 'POST' ? 300 : 200,
    windowMs: 60000,
    prefix: req.method === 'POST' ? 'workshop-feedback' : 'workshop',
  });
  if (!rate.success) return sendJson(res, 429, { error: 'Too many attempts. Wait a minute and try again.' });

  if (!prisma) {
    return sendJson(res, 503, process.env.NODE_ENV !== 'production'
      ? { error: 'Dev: no database is configured. Set DATABASE_URL in .env and restart the dev server.', dev: true }
      : { error: 'Not configured' });
  }

  if (req.method === 'POST') {
    const body = parseRequestBody(req) as any;
    const kind = body && typeof body === 'object' && typeof body.kind === 'string' ? body.kind : 'student';
    if (kind !== 'student' && kind !== 'teacher' && kind !== 'facilitator' && kind !== 'notes' && kind !== 'school') {
      return sendJson(res, 400, { error: 'Unknown feedback type' });
    }
    const schema = kind === 'teacher' ? TeacherSchema : kind === 'facilitator' ? FacilitatorSchema : kind === 'notes' ? NotesSchema : kind === 'school' ? SchoolSchema : StudentSchema;
    const parsed = (schema as z.ZodTypeAny).safeParse(body);
    if (!parsed.success) {
      const formatted = formatZodError(parsed.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const data = parsed.data as any;
    try {
      const select = { id: true, teams: true, active: true, expiresAt: true } as const;
      const workshop =
        kind === 'facilitator' || kind === 'notes'
          ? await prisma.workshop.findFirst({ where: { facilitatorKey: { equals: data.key, mode: 'insensitive' } }, select })
          : await prisma.workshop.findUnique({ where: { code: data.code }, select });
      if (!workshop) return sendJson(res, 404, { error: kind === 'facilitator' || kind === 'notes' ? 'Facilitator link not found' : 'Code not found' });
      if (!(kind === 'school' ? isLiveForSchool(workshop) : isLive(workshop))) return sendJson(res, 410, { error: 'This workshop code has expired' });

      if (kind === 'notes') {
        const text = (data.notes ?? '').trim();
        if (text) {
          await prisma.workshopSlideNote.upsert({
            where: { slide: data.slide },
            create: { slide: data.slide, notes: text },
            update: { notes: text },
          });
        } else {
          await prisma.workshopSlideNote.deleteMany({ where: { slide: data.slide } });
        }
        res.setHeader('Cache-Control', 'no-store');
        return sendJson(res, 200, { ok: true });
      }

      try {
        if (kind === 'student') {
          await prisma.workshopFeedback.create({
            data: {
              workshopId: workshop.id,
              submissionId: data.submissionId,
              scoreReuse: data.scores.reuse,
              scoreConnect: data.scores.connect,
              scoreSpatial: data.scores.spatial,
              scoreDiscover: data.scores.discover,
              scoreTeam: data.scores.team,
              whatWeMade: data.whatWeMade,
              interesting: data.interesting,
              wouldChange: data.wouldChange,
              teamName: data.teamName,
            },
          });
        } else if (kind === 'school') {
          const missing = missingSchoolAnswer(data.answers);
          if (missing) {
            return sendJson(res, 400, { error: `Please answer question ${missing.n}.`, fieldErrors: { [missing.key]: [`Please answer question ${missing.n}.`] } });
          }
          await prisma.workshopSchoolFeedback.create({
            data: { workshopId: workshop.id, submissionId: data.submissionId, answers: prune(data.answers) ?? {} },
          });
        } else if (kind === 'teacher') {
          await prisma.workshopTeacherFeedback.create({
            data: {
              workshopId: workshop.id,
              submissionId: data.submissionId,
              engagement: data.engagement,
              observed: [...new Set<string>(data.observed)],
              appropriate: data.appropriate,
              valuable: data.valuable,
              improve: data.improve,
              recommend: data.recommend,
            },
          });
        } else {
          if (!hasAnyAnswer(data.answers)) {
            return sendJson(res, 400, { error: 'Answer at least one question before sending.' });
          }
          await prisma.workshopFacilitatorFeedback.create({
            data: { workshopId: workshop.id, submissionId: data.submissionId, answers: prune(data.answers) ?? {} },
          });
        }
      } catch (err: any) {
        // The same submission arriving twice (a retry or a double tap) is fine.
        if (err?.code !== 'P2002') throw err;
      }
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[workshop] Feedback save failed:', err);
      // On a developer's machine, say what is wrong (usually a database or Prisma client that is behind the
      // schema). The page shows this only when `dev` is set; in production the message stays generic.
      if (process.env.NODE_ENV !== 'production') {
        const code = (err as any)?.code;
        const msg = String((err as any)?.message || err);
        const behind = code === 'P2021' || code === 'P2022' || /does not exist|Unknown (argument|field)|Invalid `prisma/i.test(msg);
        const detail = behind
          ? 'Dev: the database or the Prisma client is behind the schema. Run pnpm db:generate and pnpm db:push, then restart the dev server.'
          : `Dev: ${msg.split('\n').filter(Boolean).pop()?.slice(0, 240) || 'save failed'}`;
        return sendJson(res, 500, { error: detail, dev: true });
      }
      return sendJson(res, 500, { error: 'We could not save your feedback. Please try again.' });
    }
  }

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const code = (searchParams.get('code') || '').trim().toUpperCase();
  const key = (searchParams.get('key') || '').trim();
  const bykey = !!key;

  if (bykey ? !/^[A-Za-z0-9]{5,24}$/.test(key) : !/^[A-Z0-9]{4,16}$/.test(code)) {
    return sendJson(res, 404, { error: 'Code not found' });
  }

  // The facilitator's edited speaker notes (only the slides that were changed).
  if (bykey && searchParams.get('notes')) {
    try {
      const row = await prisma.workshop.findFirst({
        where: { facilitatorKey: { equals: key, mode: 'insensitive' } },
        select: { active: true, expiresAt: true },
      });
      if (!row) return sendJson(res, 404, { error: 'Facilitator link not found' });
      if (!isLive(row)) return sendJson(res, 410, { error: 'This workshop code has expired' });
      const rows = await prisma.workshopSlideNote.findMany({ select: { slide: true, notes: true } });
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, { notes: Object.fromEntries(rows.map((r: { slide: number; notes: string }) => [String(r.slide), r.notes])) });
    } catch (err) {
      console.error('[workshop] Notes lookup failed:', err);
      return sendJson(res, 500, { error: 'Unable to load the notes right now.' });
    }
  }

  try {
    const select = { code: true, schoolName: true, workshopDate: true, teams: true, active: true, expiresAt: true } as const;
    const row = bykey
      ? await prisma.workshop.findFirst({ where: { facilitatorKey: { equals: key, mode: 'insensitive' } }, select })
      : await prisma.workshop.findUnique({ where: { code }, select });
    if (!row) return sendJson(res, 404, { error: 'Code not found' });
    const forSchool = !bykey && searchParams.get('for') === 'school';
    if (!(forSchool ? isLiveForSchool(row) : isLive(row))) return sendJson(res, 410, { error: 'This workshop code has expired' });
    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, {
      role: bykey ? 'facilitator' : 'student',
      workshop: {
        code: row.code,
        schoolName: row.schoolName,
        workshopDate: row.workshopDate ? row.workshopDate.toISOString().slice(0, 10) : null,
        teams: row.teams,
      },
    });
  } catch (err) {
    console.error('[workshop] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to check that code right now.' });
  }
}
