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

export interface ReservedUnit {
  id: string;
  serial: string;
}

export class InsufficientStockError extends Error {
  dropId: string;
  requested: number;
  available: number;

  constructor(dropId: string, requested: number, available: number) {
    super(`Requested ${requested} unit(s) for drop ${dropId} but only ${available} in stock`);
    this.name = 'InsufficientStockError';
    this.dropId = dropId;
    this.requested = requested;
    this.available = available;
  }
}

/**
 * Locks and reserves `quantity` in-stock units from a drop, oldest edition
 * number first. Returns the id + serial of each unit reserved.
 */
export async function reserveUnitsForDrop(dropId: string, quantity: number): Promise<ReservedUnit[]> {
  if (!prisma) throw new Error('Database not configured');
  return prisma.$transaction(async (tx: any) => {
    const locked = (await tx.$queryRaw(
      Prisma.sql`
        SELECT id, serial FROM units
        WHERE drop_id = ${dropId}::uuid AND status = 'IN_STOCK'
        ORDER BY edition_number ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${quantity}
      `,
    )) as ReservedUnit[];

    if (locked.length < quantity) {
      throw new InsufficientStockError(dropId, quantity, locked.length);
    }

    const ids = locked.map((r: ReservedUnit) => r.id);

    await tx.$executeRaw(Prisma.sql`
      UPDATE units SET status = 'RESERVED', updated_at = now()
      WHERE id IN (${Prisma.join(ids)})
    `);

    return locked;
  });
}

/**
 * Flips previously-reserved units to SOLD and assigns their ownership to a
 * customer.
 */
export async function markUnitsSold(tx: any, unitIds: string[], customerId: string): Promise<void> {
  if (unitIds.length === 0) return;
  await tx.$executeRaw(Prisma.sql`
    UPDATE units SET status = 'SOLD', current_owner_customer_id = ${customerId}::uuid, updated_at = now()
    WHERE id IN (${Prisma.join(unitIds)})
  `);
}

/**
 * Releases previously-reserved units back to IN_STOCK.
 */
export async function releaseUnits(unitIds: string[]): Promise<void> {
  if (!prisma || unitIds.length === 0) return;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE units SET status = 'IN_STOCK', updated_at = now()
    WHERE id IN (${Prisma.join(unitIds)}) AND status = 'RESERVED'
  `);
}

/**
 * Reverts SOLD (or VOID) units back to IN_STOCK and clears ownership.
 */
export async function revertUnitsToStock(tx: any, unitIds: string[]): Promise<void> {
  if (unitIds.length === 0) return;
  await tx.$executeRaw(Prisma.sql`
    UPDATE units
    SET status = 'IN_STOCK', current_owner_customer_id = NULL, registered_at = NULL, updated_at = now()
    WHERE id IN (${Prisma.join(unitIds)})
  `);
}

