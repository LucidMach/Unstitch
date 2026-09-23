// api/admin/batch-drops.js
// Dedicated Admin API handler for scheduling and managing "Batch Drops as Events".
// GET  /api/admin/batch-drops -> lists all drops with products, unit counts, and release schedules
// POST /api/admin/batch-drops -> schedule a new drop event or update release schedule & status

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';

const BatchDropSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  dropCode: z.string().trim().min(1, 'Drop code is required').max(20).optional(),
  releaseAt: z.coerce.date().optional().nullable(),
  totalUnits: z.coerce.number().int().min(1).max(10000).optional(),
  madeLocation: z.string().trim().max(120).optional().default('Melbourne'),
  madeYear: z.coerce.number().int().min(2020).max(2100).optional(),
  status: z.enum(['UPCOMING', 'LIVE', 'SOLD_OUT', 'ARCHIVED']).optional(),
});

export default async function handler(req, res) {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });
  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST') {
    const body = parseRequestBody(req);
    const parseResult = BatchDropSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const data = parseResult.data;

    try {
      if (data.id) {
        // Update existing drop
        const existing = await prisma.drop.findUnique({ where: { id: data.id } });
        if (!existing) return sendJson(res, 404, { error: 'Drop not found.' });

        const updated = await prisma.drop.update({
          where: { id: data.id },
          data: {
            releaseAt: data.releaseAt !== undefined ? data.releaseAt : undefined,
            status: data.status || undefined,
            totalUnits: data.totalUnits !== undefined ? data.totalUnits : undefined,
            madeLocation: data.madeLocation || undefined,
            madeYear: data.madeYear !== undefined ? data.madeYear : undefined,
          },
          include: {
            product: { select: { id: true, name: true, slug: true, imageUrl: true } },
          },
        });
        return sendJson(res, 200, { drop: updated });
      }

      // Create new scheduled drop event
      if (!data.productId || !data.dropCode || !data.totalUnits) {
        return sendJson(res, 400, {
          error: 'Product, Drop Code, and Total Units are required when scheduling a new drop.',
        });
      }

      const existingCode = await prisma.drop.findUnique({
        where: {
          productId_dropCode: {
            productId: data.productId,
            dropCode: data.dropCode,
          },
        },
      });
      if (existingCode) {
        return sendJson(res, 409, {
          error: `Drop code "${data.dropCode}" is already in use for this product.`,
        });
      }

      const currentYear = new Date().getFullYear();
      const drop = await prisma.drop.create({
        data: {
          productId: data.productId,
          dropCode: data.dropCode,
          totalUnits: data.totalUnits,
          status: data.status || 'UPCOMING',
          madeLocation: data.madeLocation || 'Melbourne',
          madeYear: data.madeYear || currentYear,
          releaseAt: data.releaseAt || null,
        },
        include: {
          product: { select: { id: true, name: true, slug: true, imageUrl: true } },
        },
      });

      return sendJson(res, 201, { drop });
    } catch (err) {
      console.error('[admin/batch-drops] Save failed:', err);
      return sendJson(res, 500, { error: 'Failed to save batch drop.' });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const [drops, products] = await Promise.all([
      prisma.drop.findMany({
        orderBy: [{ releaseAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          product: { select: { id: true, name: true, slug: true, imageUrl: true } },
          _count: { select: { units: true, reservations: true } },
        },
      }),
      prisma.product.findMany({
        select: { id: true, name: true, slug: true, imageUrl: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return sendJson(res, 200, { drops, products });
  } catch (err) {
    console.error('[admin/batch-drops] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load batch drops.' });
  }
}
