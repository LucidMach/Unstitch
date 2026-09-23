// api/admin/inventory.js
// GET  -> every drop (with its product, photo, and a per-unit list — serial,
//         edition number, status), so the admin panel can answer "how much
//         stock is left" AND "which exact units are in which state" without
//         querying the DB by hand.
// POST -> five actions, all scoped to an existing drop:
//   action: "restock" (default) -> add N more numbered units. Works
//         immediately for checkout (it looks up units live from the DB) —
//         unlike a genuinely new product, which the static-built site
//         can't sell without a new page + redeploy (see the chat/project
//         doc for why a full product-creation flow was deliberately NOT
//         built here). Numbering fills the lowest *unused* edition number
//         first (see fillEditionGaps below), so a gap left behind by a
//         deleted VOID unit (see "delete-void") gets reused instead of
//         leaving a permanent hole in the sequence.
//   action: "void" -> undo an accidental restock. Marks the most-recently
//         added still-IN_STOCK units as VOID (never touches a unit that's
//         RESERVED/SOLD/etc — voiding can never cancel a real order) and
//         lowers totalUnits to match. The VOID rows stay in the database
//         (not deleted) unless/until "delete-void" is used on them — this
//         is the safe default so nothing is lost by accident.
//   action: "undo-void" -> the opposite of "void": brings the
//         most-recently-voided N units on this drop back to IN_STOCK
//         (and back into totalUnits). For when a void was itself a
//         mistake — no data was ever destroyed, so this is always safe.
//   action: "delete-void" -> PERMANENTLY deletes every currently-VOID unit
//         on this drop. Unlike void, this can't be undone. It's scoped to
//         VOID-only rows on purpose: those units were never RESERVED or
//         SOLD (void only ever touches IN_STOCK units — see above), so no
//         order or payment record can reference one, and deleting them is
//         safe from a data-integrity standpoint.
//         The real risk isn't the database — it's the physical world: a
//         unit's serial (e.g. UX-D001-011) is also its qrSlug, meant to be
//         printed once on a real QR tag/postcard and never reused. Deleting
//         a VOID unit frees its edition number for a *future* restock to
//         reuse (see fillEditionGaps) — that's only safe if that serial was
//         never actually printed on physical stock. Use this for cleaning
//         up test/mistaken restocks, not for units that made it into the
//         real world.
//   action: "release-stale" -> hand back units stuck in RESERVED because
//         the checkout session that reserved them was abandoned and its
//         `checkout.session.expired` webhook never arrived (e.g. testing
//         against a dev server Stripe can't reach) — see
//         src/lib/inventory.js's releaseUnits, which normally does this
//         automatically. Only touches units reserved longer ago than a
//         real checkout hold could still legitimately be open for, so it
//         can never snatch back a unit a customer is mid-payment on.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../src/lib/apiHelper.js';
import { requireAdmin } from '../../src/lib/adminAuth.js';
import prisma from '../../src/lib/prisma.js';
import { releaseUnits } from '../../src/lib/inventory.js';

// Mirrors SESSION_HOLD_SECONDS in api/create-checkout-session.js — a real
// in-progress checkout never holds a reservation longer than this, so
// anything still RESERVED past it is abandoned, not just slow.
const STALE_RESERVATION_MS = 30 * 60 * 1000;

const InventoryActionSchema = z.object({
  dropId: z.string().uuid(),
  action: z.enum(['restock', 'void', 'release-stale', 'undo-void', 'delete-void']).default('restock'),
  // Required for restock/void/undo-void; ignored for release-stale and
  // delete-void, which always act on every eligible unit on the drop —
  // there's no "which ones" to choose between for either.
  quantity: z.number().int().min(1).max(500).optional(),
  // restock only: if the drop was SOLD_OUT, restocking implies you want it
  // sellable again. Defaults to true; set false to add units without
  // reactivating (e.g. staging next week's units early).
  reactivate: z.boolean().optional().default(true),
});

/**
 * Picks the next `count` edition numbers for a restock, filling the lowest
 * *unused* numbers first rather than always appending after the current
 * max. Without this, a gap left by a deleted VOID unit (see "delete-void")
 * could never be reclaimed — restock would just keep counting up forever
 * even once the hole in the middle is gone.
 * @param {{editionNumber: number}[]} existingUnits
 * @param {number} count
 * @returns {number[]}
 */
function fillEditionGaps(existingUnits, count) {
  const used = new Set(existingUnits.map((u) => u.editionNumber));
  const picked = [];
  let candidate = 1;
  while (picked.length < count) {
    if (!used.has(candidate)) picked.push(candidate);
    candidate += 1;
  }
  return picked;
}

export default async function handler(req, res) {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return;

    const drops = await prisma.drop.findMany({
      // Archived drops are done-with; the default admin Inventory view has
      // no use for them and they only grow the response over time as more
      // drops get archived. Excluded by default rather than paginated —
      // full pagination/aggregate-counts for this endpoint is a larger
      // redesign left for a future pass.
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, slug: true, sku: true, imageUrl: true } },
        units: {
          select: { id: true, serial: true, editionNumber: true, status: true },
          orderBy: { editionNumber: 'asc' },
        },
      },
    });

    const result = drops.map((drop) => {
      /** @type {Record<string, number>} */
      const statusCounts = {};
      for (const unit of drop.units) {
        statusCounts[unit.status] = (statusCounts[unit.status] || 0) + 1;
      }
      return {
        id: drop.id,
        dropCode: drop.dropCode,
        status: drop.status,
        totalUnits: drop.totalUnits,
        releaseAt: drop.releaseAt,
        product: drop.product,
        statusCounts,
        units: drop.units,
      };
    });

    return sendJson(res, 200, { drops: result });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = parseRequestBody(req);
  const parseResult = InventoryActionSchema.safeParse(body);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
  }
  const { dropId, action, quantity, reactivate } = parseResult.data;
  if ((action === 'restock' || action === 'void' || action === 'undo-void') && quantity === undefined) {
    return sendJson(res, 400, { error: 'quantity is required for this action.' });
  }

  try {
    const drop = await prisma.drop.findUnique({ where: { id: dropId } });
    if (!drop) return sendJson(res, 404, { error: 'Drop not found.' });

    if (action === 'release-stale') {
      const staleCutoff = new Date(Date.now() - STALE_RESERVATION_MS);
      const stale = await prisma.unit.findMany({
        where: { dropId, status: 'RESERVED', updatedAt: { lt: staleCutoff } },
        select: { id: true, serial: true },
      });

      if (stale.length === 0) {
        return sendJson(res, 200, { drop, unitsReleased: 0, releasedSerials: [] });
      }

      await releaseUnits(stale.map((u) => u.id));

      // Releasing might bring real stock back for a drop that looked
      // SOLD_OUT purely because everything was stuck RESERVED.
      const inStockCount = await prisma.unit.count({ where: { dropId, status: 'IN_STOCK' } });
      let finalDrop = drop;
      if (inStockCount > 0 && drop.status === 'SOLD_OUT') {
        finalDrop = await prisma.drop.update({ where: { id: dropId }, data: { status: 'LIVE' } });
      }

      return sendJson(res, 200, {
        drop: finalDrop,
        unitsReleased: stale.length,
        releasedSerials: stale.map((u) => u.serial),
      });
    }

    if (action === 'void') {
      // Most-recently-added first — an accidental over-restock is almost
      // always the units you just added, not ones that have been sitting in
      // stock for a while.
      const candidates = await prisma.unit.findMany({
        where: { dropId, status: 'IN_STOCK' },
        orderBy: { editionNumber: 'desc' },
        take: quantity,
        select: { id: true, serial: true },
      });
      if (candidates.length < quantity) {
        return sendJson(res, 400, {
          error: `Only ${candidates.length} unit(s) are still in stock and safe to remove — a reserved or sold unit can't be voided.`,
        });
      }
      const ids = candidates.map((u) => u.id);

      const [, updatedDrop] = await prisma.$transaction([
        prisma.unit.updateMany({ where: { id: { in: ids } }, data: { status: 'VOID' } }),
        prisma.drop.update({
          where: { id: dropId },
          data: { totalUnits: Math.max(0, drop.totalUnits - quantity) },
        }),
      ]);

      // If that emptied out the drop's real stock, reflect it — but only
      // ever move LIVE -> SOLD_OUT here, never touch any other status.
      const stillInStock = await prisma.unit.count({ where: { dropId, status: 'IN_STOCK' } });
      let finalDrop = updatedDrop;
      if (stillInStock === 0 && updatedDrop.status === 'LIVE') {
        finalDrop = await prisma.drop.update({ where: { id: dropId }, data: { status: 'SOLD_OUT' } });
      }

      return sendJson(res, 200, {
        drop: finalDrop,
        unitsVoided: quantity,
        voidedSerials: candidates.map((u) => u.serial),
      });
    }

    if (action === 'undo-void') {
      // Most-recently-voided first — mirrors void's "most-recently-added
      // first" logic: a mistaken void is almost always the last one(s) you
      // just did, not one from weeks ago.
      const candidates = await prisma.unit.findMany({
        where: { dropId, status: 'VOID' },
        orderBy: { updatedAt: 'desc' },
        take: quantity,
        select: { id: true, serial: true },
      });
      if (candidates.length < quantity) {
        return sendJson(res, 400, {
          error: `Only ${candidates.length} voided unit(s) are available to bring back.`,
        });
      }
      const ids = candidates.map((u) => u.id);

      const [, updatedDrop] = await prisma.$transaction([
        prisma.unit.updateMany({ where: { id: { in: ids } }, data: { status: 'IN_STOCK' } }),
        prisma.drop.update({
          where: { id: dropId },
          data: {
            totalUnits: drop.totalUnits + quantity,
            status: drop.status === 'SOLD_OUT' ? 'LIVE' : drop.status,
          },
        }),
      ]);

      return sendJson(res, 200, {
        drop: updatedDrop,
        unitsReactivated: quantity,
        reactivatedSerials: candidates.map((u) => u.serial),
      });
    }

    if (action === 'delete-void') {
      const voidUnits = await prisma.unit.findMany({
        where: { dropId, status: 'VOID' },
        select: { id: true, serial: true },
      });
      if (voidUnits.length === 0) {
        return sendJson(res, 200, { drop, unitsDeleted: 0, deletedSerials: [] });
      }
      // Safe to hard-delete: void only ever applies to units that were
      // still IN_STOCK (never RESERVED/SOLD — see the void branch above),
      // so nothing else in the database references these rows.
      await prisma.unit.deleteMany({ where: { id: { in: voidUnits.map((u) => u.id) } } });

      return sendJson(res, 200, {
        drop,
        unitsDeleted: voidUnits.length,
        deletedSerials: voidUnits.map((u) => u.serial),
      });
    }

    // action === 'restock'
    const existingUnits = await prisma.unit.findMany({
      where: { dropId },
      select: { editionNumber: true },
    });
    const editionNumbers = fillEditionGaps(existingUnits, quantity);

    const newUnits = editionNumbers.map((editionNumber) => {
      const serial = `UX-${drop.dropCode}-${String(editionNumber).padStart(3, '0')}`;
      return {
        serial,
        qrSlug: serial,
        dropId: drop.id,
        productId: drop.productId,
        editionNumber,
        status: 'IN_STOCK',
      };
    });

    const [, updatedDrop] = await prisma.$transaction([
      prisma.unit.createMany({ data: newUnits }),
      prisma.drop.update({
        where: { id: dropId },
        data: {
          totalUnits: drop.totalUnits + quantity,
          status: reactivate && drop.status === 'SOLD_OUT' ? 'LIVE' : drop.status,
        },
      }),
    ]);

    return sendJson(res, 200, {
      drop: updatedDrop,
      unitsAdded: quantity,
      startingEdition: editionNumbers[0],
    });
  } catch (err) {
    console.error('[admin/inventory] Update failed:', err);
    return sendJson(res, 500, { error: 'Update failed.' });
  }
}
