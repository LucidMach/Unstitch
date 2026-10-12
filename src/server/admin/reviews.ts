// src/server/admin/reviews.js — wired in at /api/admin/reviews via
// api/admin/[...action].js's dispatcher, same pattern as every other
// admin handler in this directory.
//
// GET  -> every review, newest first, optionally filtered by status
//         (?status=PENDING, the default — customers' submissions start
//         here and shouldn't need digging through PUBLISHED/REJECTED
//         ones to find; pass ?status=all for every row). Includes enough
//         of product/customer/unit to show the admin what's being judged
//         without a second round trip.
// POST -> { reviewId, action: "publish" | "reject" } — moves a review out
//         of PENDING. Deliberately two-state-from-pending only: a
//         published review can't be flipped back to pending or rejected
//         here, and a rejected one can't be un-rejected — if a published
//         review turns out to need pulling down, that's done directly in
//         the database, not papered over as a normal admin action, since
//         it means something customer-visible needs retracting.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';

const ModerateSchema = z.object({
  reviewId: z.string().uuid(),
  action: z.enum(['publish', 'reject']),
});

async function handleGet(req: any, res: any) {
  if (!requireAdmin(req, res)) return;
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const statusParam = (searchParams.get('status') || 'PENDING').toUpperCase();
  const where = statusParam === 'ALL' ? {} : { status: statusParam as any };

  try {
    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { name: true, slug: true, totalUnits: true } },
        customer: { select: { name: true, email: true } },
        order: { select: { orderNumber: true } },
        unit: { select: { editionNumber: true } },
      },
    });
    return sendJson(res, 200, { reviews });
  } catch (err: any) {
    console.error('[admin/reviews] List failed:', err);
    return sendJson(res, 500, { error: 'Unable to load reviews.' });
  }
}

async function handlePost(req: any, res: any) {
  if (!requireAdmin(req, res)) return;
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const body = parseRequestBody(req);
  const parseResult = ModerateSchema.safeParse(body);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
  }
  const { reviewId, action } = parseResult.data;

  try {
    const existing = await prisma.review.findUnique({ where: { id: reviewId }, select: { status: true } });
    if (!existing) return sendJson(res, 404, { error: 'Review not found.' });
    if (existing.status !== 'PENDING') {
      return sendJson(res, 409, { error: `This review is already ${existing.status.toLowerCase()}.` });
    }

    const review = await prisma.review.update({
      where: { id: reviewId },
      data: { status: action === 'publish' ? 'PUBLISHED' : 'REJECTED' },
    });
    return sendJson(res, 200, { ok: true, review });
  } catch (err: any) {
    console.error('[admin/reviews] Moderate failed:', err);
    return sendJson(res, 500, { error: 'Something went wrong. Please try again shortly.' });
  }
}

export default async function handler(req: any, res: any): Promise<any> {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}
