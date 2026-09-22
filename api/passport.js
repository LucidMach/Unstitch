// api/passport.js
// GET  /api/passport?serial=<serial>          -> public unit + drop +
//   product info for the customer-facing digital passport page
//   (src/pages/passport.astro). No admin auth — this is meant to be hit by
//   anyone who scans the QR code printed on a physical kit. Returns only
//   customer-safe fields: nothing about pricing, cost breakdown, or other
//   customers' data. `serial` is matched against both Unit.serial and
//   Unit.qrSlug (normally identical — see api/admin/inventory.js — but
//   matching both means a future divergence doesn't quietly 404 real codes).
// POST /api/passport { serial, email, name? }  -> "Register this kit":
//   claims ownership for the scanning customer (find-or-create Customer by
//   email), sets Unit.currentOwnerCustomerId + registeredAt, and bumps
//   status to REGISTERED. Only allowed once the unit has actually been
//   sold (SOLD/SHIPPED/DELIVERED/already REGISTERED) — not IN_STOCK or
//   RESERVED — so registering isn't a way to claim a unit nobody's bought
//   yet. Re-registering an already-REGISTERED unit is allowed on purpose:
//   it reassigns ownership, which is how a resold/gifted kit's passport
//   follows the object to its new owner (see the project doc's provenance
//   note) rather than staying stuck on whoever registered it first.
//
// Deliberately no order-code/proof-of-purchase check here (unlike Review
// submission, which verifies against a delivered order) — registering is
// just "this is mine, personalize my passport", not a legal ownership
// claim, so the bar is intentionally low.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../src/lib/apiHelper.js';
import { checkRateLimit } from '../src/lib/rateLimit.js';
import prisma from '../src/lib/prisma.js';

const REGISTERABLE_STATUSES = new Set(['SOLD', 'SHIPPED', 'DELIVERED', 'REGISTERED']);

function serializeUnit(unit) {
  return {
    serial: unit.serial,
    editionNumber: unit.editionNumber,
    status: unit.status,
    registered: !!unit.registeredAt,
    registeredOwnerName: unit.registeredAt ? unit.currentOwner?.name || null : null,
    drop: {
      dropCode: unit.drop.dropCode,
      totalUnits: unit.drop.totalUnits,
      madeLocation: unit.drop.madeLocation,
      madeYear: unit.drop.madeYear,
    },
    product: {
      name: unit.product.name,
      slug: unit.product.slug,
      tagline: unit.product.tagline,
      colourPalette: unit.product.colourPalette,
      tileMaterial: unit.product.tileMaterial,
      materialRigidity: unit.product.materialRigidity,
      kitContents: unit.product.kitContents,
      imageUrl: unit.product.imageUrl,
    },
  };
}

const RegisterSchema = z.object({
  serial: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  name: z.string().trim().max(200).optional(),
});

export default async function handler(req, res) {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'GET') {
    const { searchParams } = new URL(req.url, 'http://placeholder.local');
    const serial = (searchParams.get('serial') || '').trim();
    if (!serial) return sendJson(res, 400, { error: 'Missing serial.' });
    try {
      const unit = await prisma.unit.findFirst({
        where: { OR: [{ serial }, { qrSlug: serial }] },
        include: { drop: true, product: true, currentOwner: { select: { name: true } } },
      });
      if (!unit) return sendJson(res, 404, { error: "We couldn't find a kit with that passport code." });
      return sendJson(res, 200, { unit: serializeUnit(unit) });
    } catch (err) {
      console.error('[passport] Lookup failed:', err);
      return sendJson(res, 500, { error: 'Unable to load this passport right now.' });
    }
  }

  if (req.method === 'POST') {
    const rateResult = checkRateLimit(req, { limit: 10, windowMs: 60000, prefix: 'passport-register' });
    if (!rateResult.success) {
      return sendJson(res, 429, { error: 'Too many attempts. Please wait a moment and try again.' });
    }
    const body = parseRequestBody(req);
    const parseResult = RegisterSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { serial, email, name } = parseResult.data;
    try {
      const unit = await prisma.unit.findFirst({ where: { OR: [{ serial }, { qrSlug: serial }] } });
      if (!unit) return sendJson(res, 404, { error: "We couldn't find a kit with that passport code." });
      if (!REGISTERABLE_STATUSES.has(unit.status)) {
        return sendJson(res, 409, {
          error:
            unit.status === 'VOID' || unit.status === 'RETURNED'
              ? 'This passport code is no longer valid.'
              : "This kit hasn't been marked sold yet, so it can't be registered.",
        });
      }

      const customer = await prisma.customer.upsert({
        where: { email },
        update: { name: name || undefined },
        create: { email, name: name || null },
      });

      const updated = await prisma.unit.update({
        where: { id: unit.id },
        data: { currentOwnerCustomerId: customer.id, registeredAt: new Date(), status: 'REGISTERED' },
        include: { drop: true, product: true, currentOwner: { select: { name: true } } },
      });

      return sendJson(res, 200, { unit: serializeUnit(updated) });
    } catch (err) {
      console.error('[passport] Registration failed:', err);
      return sendJson(res, 500, { error: 'Unable to register this kit right now.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}
