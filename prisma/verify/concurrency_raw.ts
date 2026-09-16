/**
 * NOT part of the deliverable. Sandbox-only verification: re-proves the
 * anti-oversell reservation logic against the new schema/table names using
 * the `pg` driver directly (Prisma Client can't be generated in this
 * sandbox — see explanation). The query shape (SELECT ... FOR UPDATE SKIP
 * LOCKED, then UPDATE ... WHERE id IN (...)) is identical to
 * src/lib/inventory.ts's reserveUnitsForDrop — this only swaps the driver
 * used to issue it, to prove the locking behaviour holds against the real
 * Postgres schema this repo now has.
 *
 * Run with: VERIFY_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/unstitch_astro npx tsx prisma/verify/concurrency_raw.ts
 */
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.VERIFY_DATABASE_URL });
const RACERS = 8;

class InsufficientStockError extends Error {}

async function reserveUnitsForDrop(dropId: string, quantity: number): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT id, serial FROM units
       WHERE drop_id = $1 AND status = 'IN_STOCK'
       ORDER BY edition_number ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $2`,
      [dropId, quantity],
    );
    if (locked.rows.length < quantity) {
      throw new InsufficientStockError(
        `Requested ${quantity} but only ${locked.rows.length} in stock`,
      );
    }
    const ids = locked.rows.map((r) => r.id);
    await client.query(`UPDATE units SET status = 'RESERVED', updated_at = now() WHERE id = ANY($1::uuid[])`, [ids]);
    await client.query("COMMIT");
    return locked.rows.map((r) => r.serial);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const dropResult = await pool.query(`SELECT id, drop_code FROM drops WHERE drop_code = 'D001' LIMIT 1`);
  const drop = dropResult.rows[0];
  if (!drop) throw new Error("Seed data not found — run prisma/verify/seed_raw.ts first.");

  // Force down to exactly one unit left in stock, so every racer genuinely
  // contends for the same single row.
  await pool.query(
    `UPDATE units SET status = 'SOLD'
     WHERE drop_id = $1 AND status = 'IN_STOCK'
     AND id NOT IN (
       SELECT id FROM units WHERE drop_id = $1 AND status = 'IN_STOCK'
       ORDER BY edition_number ASC LIMIT 1
     )`,
    [drop.id],
  );

  const before = await pool.query(
    `SELECT count(*)::int AS n FROM units WHERE drop_id = $1 AND status = 'IN_STOCK'`,
    [drop.id],
  );
  console.log(`Stock before race: ${before.rows[0].n} unit(s) IN_STOCK`);
  console.log(`Firing ${RACERS} concurrent reservation attempts for 1 unit...`);

  const results = await Promise.allSettled(
    Array.from({ length: RACERS }, () => reserveUnitsForDrop(drop.id, 1)),
  );

  const wins = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<string[]>[];
  const losses = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

  console.log(`\nWinners: ${wins.length}`);
  wins.forEach((w) => console.log(`  reserved serial(s): ${w.value.join(", ")}`));

  console.log(`Losers: ${losses.length}`);
  const allInsufficientStock = losses.every((l) => l.reason instanceof InsufficientStockError);
  console.log(`  all losers failed with InsufficientStockError: ${allInsufficientStock}`);
  if (!allInsufficientStock) {
    for (const l of losses) {
      if (!(l.reason instanceof InsufficientStockError)) console.log("  unexpected error:", l.reason);
    }
  }

  const after = await pool.query(
    `SELECT status, count(*)::int AS n FROM units WHERE drop_id = $1 GROUP BY status ORDER BY status`,
    [drop.id],
  );
  console.log("\nFinal unit status breakdown for drop D001:");
  for (const row of after.rows) console.log(`  ${row.status}: ${row.n}`);

  const pass = wins.length === 1 && losses.length === RACERS - 1 && allInsufficientStock;
  console.log(`\n${pass ? "PASS" : "FAIL"}: exactly one reservation succeeded, no oversell.`);
  if (!pass) process.exitCode = 1;
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exitCode = 1;
  });
