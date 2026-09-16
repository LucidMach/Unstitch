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
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export class InsufficientStockError extends Error {
  constructor(
    public readonly dropId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Requested ${requested} unit(s) for drop ${dropId} but only ${available} in stock`,
    );
    this.name = "InsufficientStockError";
  }
}

/**
 * Locks and reserves `quantity` in-stock units from a drop, oldest edition
 * number first. Returns the serials of the units reserved.
 *
 * Throws InsufficientStockError (without reserving anything) if fewer than
 * `quantity` units are available — SKIP LOCKED means "available" here
 * already excludes units any other concurrent transaction is mid-reserving.
 */
export async function reserveUnitsForDrop(
  dropId: string,
  quantity: number,
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; serial: string }[]>(
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

    return locked.map((r) => r.serial);
  });
}
