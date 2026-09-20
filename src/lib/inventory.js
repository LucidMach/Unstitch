/**
 * Anti-oversell reservation logic for limited-drop units.
 *
 * Uses `SELECT ... FOR UPDATE SKIP LOCKED` inside a Prisma interactive
 * transaction so that concurrent checkout attempts racing for the same
 * last unit(s) of a drop cannot both "win" — exactly as many reservations
 * succeed as there is real stock, and every loser gets a clean
 * `InsufficientStockError` instead of a double-sold unit.
 *
 * This was proven under real concurrent load (8 simultaneous callers
 * racing for the last unit of a drop, exactly 1 succeeds) against an
 * earlier Drizzle-based draft of this same schema; the query shape here
 * is unchanged, just re-expressed as Prisma raw queries against the
 * Prisma-mapped table/column names in prisma/schema.prisma.
 *
 * IMPORTANT: Prisma's typed query API (`prisma.unit.findMany`, etc.) has
 * no way to express `FOR UPDATE SKIP LOCKED`, so this intentionally drops
 * to `tx.$queryRaw` / `tx.$executeRaw` inside `prisma.$transaction()`.
 * The Neon driver adapter this project uses (`@prisma/adapter-neon` with
 * the `ws` websocket polyfill) holds one real connection for the
 * duration of an interactive transaction, which is what row locking
 * requires — the alternative HTTP/fetch-based Neon driver does not
 * support this and must not be substituted in here.
 *
 * (Originally written as `inventory.ts`; converted to plain JS so it can
 * be imported directly, with a plain relative `.js` specifier, from the
 * root-level `api/*.js` Vercel functions without depending on a bundler's
 * TS-to-JS extension-rewriting behavior at build time.)
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/**
 * @typedef {{ id: string, serial: string }} ReservedUnit
 */

export class InsufficientStockError extends Error {
  /**
   * @param {string} dropId
   * @param {number} requested
   * @param {number} available
   */
  constructor(dropId, requested, available) {
    super(`Requested ${requested} unit(s) for drop ${dropId} but only ${available} in stock`);
    this.name = 'InsufficientStockError';
    /** @type {string} */
    this.dropId = dropId;
    /** @type {number} */
    this.requested = requested;
    /** @type {number} */
    this.available = available;
  }
}

/**
 * Locks and reserves `quantity` in-stock units from a drop, oldest edition
 * number first. Returns the id + serial of each unit reserved (the id is
 * what callers must persist — e.g. in Stripe Checkout Session metadata —
 * so the exact same units can later be flipped to SOLD or released back
 * to IN_STOCK; the serial is just for display/line-item text).
 *
 * Throws InsufficientStockError (without reserving anything) if fewer than
 * `quantity` units are available — SKIP LOCKED means "available" here
 * already excludes units any other concurrent transaction is mid-reserving.
 *
 * @param {string} dropId
 * @param {number} quantity
 * @returns {Promise<ReservedUnit[]>}
 */
export async function reserveUnitsForDrop(dropId, quantity) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw(
      Prisma.sql`
        SELECT id, serial FROM units
        WHERE drop_id = ${dropId}::uuid AND status = 'IN_STOCK'
        ORDER BY edition_number ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${quantity}
      `,
    );

    if (locked.length < quantity) {
      throw new InsufficientStockError(dropId, quantity, locked.length);
    }

    const ids = locked.map((r) => r.id);

    // NOTE: `= ANY(${ids})` fails here for the same reason it failed in the
    // Drizzle draft this was ported from — the query builder expands a JS
    // array into comma-separated bind parameters rather than one Postgres
    // array parameter, so `ANY(...)` sees a malformed array literal.
    // `Prisma.join` + `IN (...)` avoids that.
    await tx.$executeRaw(Prisma.sql`
      UPDATE units SET status = 'RESERVED', updated_at = now()
      WHERE id IN (${Prisma.join(ids)})
    `);

    return locked;
  });
}

/**
 * Flips previously-reserved units to SOLD and assigns their ownership to a
 * customer. Must be called from inside the same Prisma transaction that
 * creates the Order/OrderItems (pass its `tx` client, not the top-level
 * `prisma`), so a mid-way failure can't leave an Order with unassigned
 * units or vice versa.
 *
 * Uses the same `Prisma.join` + `IN (...)` pattern as the rest of this
 * file rather than `id = ANY(${unitIds})` — see the note on
 * `reserveUnitsForDrop` above for why the array-expansion form breaks.
 *
 * @param {any} tx - a Prisma transaction client (from `prisma.$transaction`)
 * @param {string[]} unitIds
 * @param {string} customerId
 * @returns {Promise<void>}
 */
export async function markUnitsSold(tx, unitIds, customerId) {
  if (unitIds.length === 0) return;
  await tx.$executeRaw(Prisma.sql`
    UPDATE units SET status = 'SOLD', current_owner_customer_id = ${customerId}::uuid, updated_at = now()
    WHERE id IN (${Prisma.join(unitIds)})
  `);
}

/**
 * Releases previously-reserved units back to IN_STOCK. Used when a checkout
 * attempt fails after reserving (e.g. Stripe Session creation errors) or
 * when a Checkout Session expires unpaid (`checkout.session.expired`
 * webhook) — in both cases the hold on real stock must not outlive the
 * payment attempt.
 *
 * Deliberately only moves units that are still RESERVED, so this is safe
 * to call even if some of the ids were already flipped to SOLD by a
 * `checkout.session.completed` webhook that raced ahead of an expiry event
 * (or vice versa) — it just becomes a no-op for those ids.
 *
 * @param {string[]} unitIds
 * @returns {Promise<void>}
 */
export async function releaseUnits(unitIds) {
  if (unitIds.length === 0) return;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE units SET status = 'IN_STOCK', updated_at = now()
    WHERE id IN (${Prisma.join(unitIds)}) AND status = 'RESERVED'
  `);
}
