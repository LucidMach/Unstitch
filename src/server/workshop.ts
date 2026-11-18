// src/server/workshop.ts -- public. Wired in at /api/workshop via
// api/[...route].ts (and the dev middleware in astro.config.ts).
//
// GET  /api/workshop?code=ABC234   (the student QR link)
// GET  /api/workshop?key=<key>     (the facilitator's own link)
//   200 -> { role: 'student' | 'facilitator',
//            workshop: { code, schoolName, workshopDate, teams } }
//   404 -> unknown code or key
//   410 -> exists but is switched off or has expired
//
// POST /api/workshop               (a student's feedback)
//   body: { code, submissionId, teamNumber, rating, oneWord?, wouldChange?,
//           whatWeMade?, teamName? }
//   200 -> { ok: true }   (also when the same submissionId arrives twice)
//
// The hub's content is not secret. The code ties a session to a booking
// (school name, team count) and lets us switch a workshop off afterwards.
// The facilitator key is a separate, longer random value, so a student's link
// never shows the Facilitator tab.
//
// Rate limits are per IP and generous on purpose: a whole class sits behind
// one school Wi-Fi address and opens the QR link within the same minute.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';

const clean = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const FeedbackSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,16}$/, 'Missing workshop code'),
  submissionId: z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid submission id'),
  teamNumber: z.coerce.number().int().min(1).max(40),
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5),
  oneWord: clean(40),
  wouldChange: clean(500),
  whatWeMade: clean(240),
  teamName: clean(80),
});

function isLive(row: { active: boolean; expiresAt: Date | null }): boolean {
  return row.active && !(row.expiresAt && row.expiresAt.getTime() < Date.now());
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

  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'POST') {
    const parsed = FeedbackSchema.safeParse(parseRequestBody(req));
    if (!parsed.success) {
      const formatted = formatZodError(parsed.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { code, submissionId, teamNumber, rating, oneWord, wouldChange, whatWeMade, teamName } = parsed.data;
    try {
      const workshop = await prisma.workshop.findUnique({
        where: { code },
        select: { id: true, teams: true, active: true, expiresAt: true },
      });
      if (!workshop) return sendJson(res, 404, { error: 'Code not found' });
      if (!isLive(workshop)) return sendJson(res, 410, { error: 'This workshop code has expired' });
      if (teamNumber > workshop.teams) {
        return sendJson(res, 400, { error: 'Choose your team from the list.', fieldErrors: { teamNumber: ['Choose your team from the list.'] } });
      }
      try {
        await prisma.workshopFeedback.create({
          data: { workshopId: workshop.id, submissionId, teamNumber, rating, oneWord, wouldChange, whatWeMade, teamName },
        });
      } catch (err: any) {
        // The same submission arriving twice (a retry or a double tap) is fine.
        if (err?.code !== 'P2002') throw err;
      }
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[workshop] Feedback save failed:', err);
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

  try {
    const select = { code: true, schoolName: true, workshopDate: true, teams: true, active: true, expiresAt: true } as const;
    const row = bykey
      ? await prisma.workshop.findFirst({ where: { facilitatorKey: { equals: key, mode: 'insensitive' } }, select })
      : await prisma.workshop.findUnique({ where: { code }, select });
    if (!row) return sendJson(res, 404, { error: 'Code not found' });
    if (!isLive(row)) return sendJson(res, 410, { error: 'This workshop code has expired' });
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
