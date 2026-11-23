// src/server/admin/workshops.ts -- authenticated CRUD for workshop bookings
// (Admin > Workshops), wired in at /api/admin/workshops via
// api/admin/[...action].ts.
//
// GET    /api/admin/workshops                    -> every workshop, newest first (each has code + facilitatorKey)
// GET    /api/admin/workshops?feedback=<id>      -> that workshop's { feedback (students), teacherFeedback, facilitatorFeedback }
// POST   /api/admin/workshops                    -> create (no id; code and facilitator key are generated) or update (id)
// PATCH  /api/admin/workshops                    -> { feedbackId, hidden, kind? } hide or show one student (default) or teacher entry
// DELETE /api/admin/workshops?id=<uuid>          -> permanently removes a workshop (and its feedback)

import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';

// No 0/O/1/I/L so a code read off a slide or typed on a phone can't be misread.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// A code stops working this many days after the workshop date (unless the
// admin sets a different cut-off), so old QR codes don't stay live forever.
const DEFAULT_EXPIRY_DAYS = 3;

function generateCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

// The facilitator's own link carries a longer random key. Mixed case is fine
// (it is only ever pasted or clicked), so it has far more combinations than a code.
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function generateFacilitatorKey(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) out += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return out;
}

const WorkshopSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,16}$/, 'Use 4 to 16 letters and numbers')
    .optional()
    .or(z.literal('')),
  schoolName: z.string().trim().min(1, 'School name is required').max(200),
  workshopDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-11-30')
    .optional()
    .nullable()
    .or(z.literal('')),
  // Optional custom facilitator link name, so the link can be typed: /workshop-<name>. Blank keeps the current one (or generates one).
  facilitatorKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{5,24}$/, 'Facilitator link name: use 5 to 24 letters and numbers')
    .optional()
    .or(z.literal('')),
  teams: z.coerce.number().int().min(1).max(40).default(9),
  notes: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().default(true),
  // Optional manual cut-off (YYYY-MM-DD, end of that day UTC). Blank = date + 3 days.
  expiresOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-12-05')
    .optional()
    .nullable()
    .or(z.literal('')),
});

const SELECT = {
  id: true,
  code: true,
  schoolName: true,
  workshopDate: true,
  teams: true,
  notes: true,
  active: true,
  expiresAt: true,
  facilitatorKey: true,
  createdAt: true,
  updatedAt: true,
} as const;

const FEEDBACK_SELECT = {
  id: true,
  teamNumber: true,
  scoreReuse: true,
  scoreConnect: true,
  scoreSpatial: true,
  scoreDiscover: true,
  scoreTeam: true,
  whatWeMade: true,
  interesting: true,
  wouldChange: true,
  teamName: true,
  rating: true,
  oneWord: true,
  hidden: true,
  createdAt: true,
} as const;

const TEACHER_SELECT = {
  id: true,
  engagement: true,
  observed: true,
  appropriate: true,
  valuable: true,
  improve: true,
  recommend: true,
  hidden: true,
  createdAt: true,
} as const;

const FACILITATOR_SELECT = { id: true, answers: true, createdAt: true } as const;

const HideSchema = z.object({ feedbackId: z.string().uuid(), hidden: z.boolean(), kind: z.enum(['student', 'teacher']).optional() });

function setupHint(err: any): string | null {
  const msg = String(err?.message || '');
  if (err?.code === 'P2021' || err?.code === 'P2022' || /workshop|does not exist/i.test(msg)) {
    return 'The workshops table is not set up yet. Run "pnpm db:generate" then "pnpm db:push", and restart the dev server.';
  }
  return null;
}

function computeExpiry(workshopDate?: string | null, expiresOn?: string | null): Date | null {
  if (expiresOn) return new Date(`${expiresOn}T23:59:59.000Z`);
  if (workshopDate) {
    const d = new Date(`${workshopDate}T23:59:59.000Z`);
    d.setUTCDate(d.getUTCDate() + DEFAULT_EXPIRY_DAYS);
    return d;
  }
  return null;
}

export default async function handler(req: any, res: any): Promise<any> {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });
  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST') {
    const parsed = WorkshopSchema.safeParse(parseRequestBody(req));
    if (!parsed.success) {
      const formatted = formatZodError(parsed.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { id, code, workshopDate, expiresOn, notes, facilitatorKey: customKey, ...rest } = parsed.data;

    try {
      let finalCode = code || '';
      if (!finalCode) {
        if (id) {
          const existing = await prisma.workshop.findUnique({ where: { id }, select: { code: true } });
          if (!existing) return sendJson(res, 404, { error: 'Workshop not found.' });
          finalCode = existing.code;
        } else {
          for (let i = 0; i < 10 && !finalCode; i++) {
            const candidate = generateCode();
            const taken = await prisma.workshop.findUnique({ where: { code: candidate }, select: { id: true } });
            if (!taken) finalCode = candidate;
          }
          if (!finalCode) return sendJson(res, 500, { error: 'Could not generate a free code. Try again.' });
        }
      }
      const clash = await prisma.workshop.findUnique({ where: { code: finalCode }, select: { id: true } });
      if (clash && clash.id !== id) {
        return sendJson(res, 409, { error: `The code "${finalCode}" is already used by another workshop.` });
      }

      // A student code and a facilitator link name must never be interchangeable: the code is printed on
      // the QR, so if it could also open the facilitator view, students could use it.
      const codeUsedAsKey = await prisma.workshop.findFirst({
        where: { facilitatorKey: { equals: finalCode, mode: 'insensitive' } },
        select: { id: true },
      });
      if (codeUsedAsKey) {
        return sendJson(res, 409, { error: `"${finalCode}" is already used as a facilitator link name. Choose a different code.` });
      }
      if (customKey) {
        if (customKey.toUpperCase() === finalCode) {
          return sendJson(res, 409, { error: 'The facilitator link name must be different from the student code.' });
        }
        const keyClash = await prisma.workshop.findFirst({
          where: { facilitatorKey: { equals: customKey, mode: 'insensitive' } },
          select: { id: true },
        });
        if (keyClash && keyClash.id !== id) {
          return sendJson(res, 409, { error: `The facilitator link name "${customKey}" is already used by another workshop.` });
        }
        const keyIsCode = await prisma.workshop.findUnique({ where: { code: customKey.toUpperCase() }, select: { id: true } });
        if (keyIsCode) {
          return sendJson(res, 409, { error: `"${customKey}" is already a student code. Choose a different facilitator link name.` });
        }
      }

      const data: Record<string, unknown> = {
        ...rest,
        code: finalCode,
        notes: notes || null,
        workshopDate: workshopDate ? new Date(`${workshopDate}T00:00:00.000Z`) : null,
        expiresAt: computeExpiry(workshopDate, expiresOn),
      };
      if (customKey) data.facilitatorKey = customKey;
      else if (!id) data.facilitatorKey = generateFacilitatorKey();
      let workshop = id
        ? await prisma.workshop.update({ where: { id }, data, select: SELECT })
        : await prisma.workshop.create({ data: data as any, select: SELECT });
      // Workshops made before the facilitator link existed get a key the first time they are saved.
      if (!workshop.facilitatorKey) {
        workshop = await prisma.workshop.update({ where: { id: workshop.id }, data: { facilitatorKey: generateFacilitatorKey() }, select: SELECT });
      }
      return sendJson(res, 200, { workshop });
    } catch (err) {
      console.error('[admin/workshops] Save failed:', err);
      return sendJson(res, 500, { error: setupHint(err) || 'Failed to save the workshop.' });
    }
  }

  if (req.method === 'DELETE') {
    const { searchParams } = new URL(req.url, 'http://placeholder.local');
    const id = searchParams.get('id');
    if (!id) return sendJson(res, 400, { error: 'Missing id.' });
    try {
      const existing = await prisma.workshop.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return sendJson(res, 404, { error: 'Workshop not found.' });
      await prisma.workshop.delete({ where: { id } });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[admin/workshops] Delete failed:', err);
      return sendJson(res, 500, { error: 'Failed to delete the workshop.' });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = HideSchema.safeParse(parseRequestBody(req));
    if (!parsed.success) {
      const formatted = formatZodError(parsed.error);
      return sendJson(res, 400, { error: formatted.message });
    }
    try {
      const model: any = parsed.data.kind === 'teacher' ? prisma.workshopTeacherFeedback : prisma.workshopFeedback;
      const existing = await model.findUnique({ where: { id: parsed.data.feedbackId }, select: { id: true } });
      if (!existing) return sendJson(res, 404, { error: 'Feedback entry not found.' });
      const feedback = await model.update({
        where: { id: parsed.data.feedbackId },
        data: { hidden: parsed.data.hidden },
        select: parsed.data.kind === 'teacher' ? TEACHER_SELECT : FEEDBACK_SELECT,
      });
      return sendJson(res, 200, { feedback });
    } catch (err) {
      console.error('[admin/workshops] Hide failed:', err);
      return sendJson(res, 500, { error: setupHint(err) || 'Failed to update the feedback entry.' });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { searchParams: query } = new URL(req.url, 'http://placeholder.local');
  const feedbackFor = query.get('feedback');

  try {
    if (feedbackFor) {
      const [feedback, teacherFeedback, facilitatorFeedback] = await Promise.all([
        prisma.workshopFeedback.findMany({
          where: { workshopId: feedbackFor },
          orderBy: { createdAt: 'desc' },
          take: 2000,
          select: FEEDBACK_SELECT,
        }),
        prisma.workshopTeacherFeedback.findMany({
          where: { workshopId: feedbackFor },
          orderBy: { createdAt: 'desc' },
          take: 500,
          select: TEACHER_SELECT,
        }),
        prisma.workshopFacilitatorFeedback.findMany({
          where: { workshopId: feedbackFor },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: FACILITATOR_SELECT,
        }),
      ]);
      return sendJson(res, 200, { feedback, teacherFeedback, facilitatorFeedback });
    }

    let workshops = await prisma.workshop.findMany({
      orderBy: [{ workshopDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: SELECT,
    });
    // Give older workshops (made before the facilitator link existed) a key so every row has one.
    if (workshops.some((w: any) => !w.facilitatorKey)) {
      await Promise.all(
        workshops
          .filter((w: any) => !w.facilitatorKey)
          .map((w: any) =>
            prisma.workshop.update({ where: { id: w.id }, data: { facilitatorKey: generateFacilitatorKey() } }),
          ),
      );
      workshops = await prisma.workshop.findMany({
        orderBy: [{ workshopDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        select: SELECT,
      });
    }
    return sendJson(res, 200, { workshops });
  } catch (err) {
    console.error('[admin/workshops] Lookup failed:', err);
    return sendJson(res, 500, { error: setupHint(err) || 'Unable to load workshops.' });
  }
}
