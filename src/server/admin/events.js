// api/admin/events.js
// Authenticated CRUD for Events with color customization and raffle scheduling.
// GET  /api/admin/events            -> every event, newest startsAt first
// GET  /api/admin/events?id=<uuid>  -> one event's full record for edit panel
// POST /api/admin/events            -> creates or updates an event
// DELETE /api/admin/events?id=<uuid> -> permanently removes an event

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i;

const EventSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
  location: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, 'Color must be a valid hex code (e.g. #6D771A)')
    .optional()
    .nullable()
    .or(z.literal('')),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  ctaLabel: z.string().trim().max(100).optional().nullable(),
  ctaUrl: z.string().trim().max(500).optional().nullable(),
  raffleEnabled: z.boolean().optional().default(false),
  raffleButtonLabel: z.string().trim().max(100).optional().nullable(),
  raffleClosesAt: z.coerce.date().optional().nullable(),
  raffleDrawCopy: z.string().trim().max(2000).optional().nullable(),
});

export default async function handler(req, res) {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });
  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST') {
    const body = parseRequestBody(req);
    const parseResult = EventSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { id, color, ...fields } = parseResult.data;

    try {
      const clash = await prisma.event.findUnique({ where: { slug: fields.slug } });
      if (clash && clash.id !== id) {
        return sendJson(res, 409, { error: `Another event already uses slug "${fields.slug}".` });
      }

      const raffleClosesAt = fields.raffleEnabled
        ? (fields.raffleClosesAt ?? fields.endsAt ?? fields.startsAt)
        : (fields.raffleClosesAt ?? null);

      const normalizedColor = color && color.trim() ? color.trim().toUpperCase() : null;

      const data = {
        title: fields.title,
        slug: fields.slug,
        location: fields.location || null,
        description: fields.description || null,
        color: normalizedColor,
        startsAt: fields.startsAt,
        endsAt: fields.endsAt || null,
        ctaLabel: fields.ctaLabel || null,
        ctaUrl: fields.ctaUrl || null,
        raffleEnabled: fields.raffleEnabled,
        raffleButtonLabel: fields.raffleButtonLabel || null,
        raffleClosesAt,
        raffleDrawCopy: fields.raffleDrawCopy || null,
      };

      let event;
      if (id) {
        const existing = await prisma.event.findUnique({ where: { id } });
        if (!existing) return sendJson(res, 404, { error: 'Event not found.' });
        event = await prisma.event.update({ where: { id }, data });
      } else {
        event = await prisma.event.create({ data });
      }
      return sendJson(res, 200, { event });
    } catch (err) {
      console.error('[admin/events] Save failed:', err);
      return sendJson(res, 500, { error: 'Failed to save event.' });
    }
  }

  if (req.method === 'DELETE') {
    const { searchParams } = new URL(req.url, 'http://placeholder.local');
    const id = searchParams.get('id');
    if (!id) return sendJson(res, 400, { error: 'Missing id.' });
    try {
      const existing = await prisma.event.findUnique({ where: { id } });
      if (!existing) return sendJson(res, 404, { error: 'Event not found.' });
      await prisma.event.delete({ where: { id } });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[admin/events] Delete failed:', err);
      return sendJson(res, 500, { error: 'Failed to delete event.' });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const id = searchParams.get('id');

  try {
    if (id) {
      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return sendJson(res, 404, { error: 'Event not found.' });
      return sendJson(res, 200, { event });
    }

    const events = await prisma.event.findMany({
      orderBy: { startsAt: 'desc' },
      take: 500,
    });
    return sendJson(res, 200, { events });
  } catch (err) {
    console.error('[admin/events] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load events.' });
  }
}
