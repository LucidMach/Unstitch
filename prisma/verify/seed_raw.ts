/**
 * NOT part of the deliverable. Sandbox-only verification: seeds sample data
 * using the `pg` driver directly (not Prisma Client, which can't be
 * generated in this sandbox — see explanation). Column/table names match
 * prisma/schema.prisma exactly, so this proves the schema is usable with
 * real data even though it bypasses Prisma's own client for now.
 */
import { Pool } from "pg";
import { computeCostBreakdown } from "../../src/lib/costCalculator";

const pool = new Pool({ connectionString: process.env.VERIFY_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log("Seeding sample data (raw pg, verification only)...");

    const archive = await client.query(
      `INSERT INTO material_archive_cards (slug, title, origin_story, images, hidden)
       VALUES ($1, $2, $3, '[]'::jsonb, true) RETURNING id`,
      [
        "reclaimed-curtain-and-polar-fleece",
        "Reclaimed curtain & polar fleece",
        "Rescued textile waste, Melbourne.",
      ],
    );
    const archiveId = archive.rows[0].id;

    const givingProgram = await client.query(
      `INSERT INTO giving_programs (name, type, description, active)
       VALUES ($1, $2, $3, true) RETURNING id, name`,
      ["Community Workshop Melbourne", "community_workshop", "Free textile workshops for kids."],
    );
    const givingProgramId = givingProgram.rows[0].id;

    const materialSource = await client.query(
      `INSERT INTO material_sources (name, material_type, cost_cents, width_cm, height_cm, waste_percent, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, cost_cents, width_cm, height_cm, waste_percent`,
      ["Reclaimed curtain fabric — Batch 3", "curtain", 0, 140, 200, 12, "Rescued, $0 acquisition cost"],
    );
    const ms = materialSource.rows[0];

    const tileSizeCm = 9;
    const tilesPerKit = 22;
    const labourMinutes = 20;
    const labourRateCentsPerHour = 3000;
    const equipmentCostCents = 197;
    const designCostCents = 50000;
    const designAmortizationUnits = 40;
    const packagingComponents = [
      { label: "A5 postcard (with passport QR code)", amountCents: 131 },
      { label: "Glassine protective sleeve", amountCents: 30 },
    ];
    const operationsOverheadCents = 200;
    const givingTilesPerKit = 3;

    const firstPass = computeCostBreakdown({
      materialSource: { costCents: ms.cost_cents, widthCm: ms.width_cm, heightCm: ms.height_cm, wastePercent: ms.waste_percent },
      tileSizeCm, tilesPerKit, labourMinutes, labourRateCentsPerHour, equipmentCostCents,
      designCostCents, designAmortizationUnits, packagingComponents, operationsOverheadCents,
      givingTilesPerKit, givingInternalValueCentsPerTile: 0,
    });
    const givingInternalValueCentsPerTile = Math.round(firstPass.costPerTileCents);

    const costCalc = computeCostBreakdown({
      materialSource: { costCents: ms.cost_cents, widthCm: ms.width_cm, heightCm: ms.height_cm, wastePercent: ms.waste_percent },
      tileSizeCm, tilesPerKit, labourMinutes, labourRateCentsPerHour, equipmentCostCents,
      designCostCents, designAmortizationUnits, packagingComponents, operationsOverheadCents,
      givingTilesPerKit, givingInternalValueCentsPerTile,
    });

    const marginCents = 2000;
    const basePriceCents = Math.ceil((costCalc.totalCostCents + marginCents) / 50) * 50;

    const product = await client.query(
      `INSERT INTO products (
         sku, slug, name, tagline, description, material_archive_card_id,
         colour_palette, tile_material, material_rigidity, difficulty_level,
         age_range_min, age_range_max, kit_contents, gift_wrap_available, gift_message_available,
         base_price_cents, currency, cost_breakdown, last_cost_calculation_cents,
         giving_tiles_per_kit, giving_internal_value_cents_per_tile, giving_description, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING id, name, sku`,
      [
        "UX-SLOWBLOOM", "slow-bloom", "Slow Bloom", "Placeholder tagline",
        "Placeholder description", archiveId,
        JSON.stringify(["#E8D8C3", "#B7C4A4", "#D98E73"]), "Curtain and polar fleece",
        "Soft / low-rigidity", "BEGINNER", 4, 99,
        JSON.stringify([{ item: `${tilesPerKit} interlocking pieces` }]), true, true,
        basePriceCents, "AUD", JSON.stringify(costCalc.breakdown), costCalc.totalCostCents,
        givingTilesPerKit, givingInternalValueCentsPerTile,
        `Every kit contributes ${givingTilesPerKit} pieces to ${givingProgram.rows[0].name}.`, true,
      ],
    );
    const productId = product.rows[0].id;

    await client.query(
      `INSERT INTO product_cost_recipes (
         product_id, material_source_id, tile_size_cm, tiles_per_kit,
         labour_minutes, labour_rate_cents_per_hour, equipment_cost_cents, equipment_cost_note,
         design_cost_cents, design_amortization_units, packaging_components,
         operations_overhead_cents, giving_tiles_per_kit, giving_program_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        productId, ms.id, tileSizeCm, tilesPerKit, labourMinutes, labourRateCentsPerHour,
        equipmentCostCents, "$75/mo membership apportioned per kit", designCostCents,
        designAmortizationUnits, JSON.stringify(packagingComponents), operationsOverheadCents,
        givingTilesPerKit, givingProgramId,
      ],
    );

    const drop = await client.query(
      `INSERT INTO drops (product_id, drop_code, total_units, status, made_location, made_year, release_at)
       VALUES ($1, $2, $3, 'LIVE', 'Melbourne', 2026, now()) RETURNING id, drop_code, total_units`,
      [productId, "D001", 10],
    );
    const dropId = drop.rows[0].id;

    for (let i = 1; i <= drop.rows[0].total_units; i++) {
      const serial = `UX-D001-${String(i).padStart(3, "0")}`;
      await client.query(
        `INSERT INTO units (serial, qr_slug, drop_id, product_id, edition_number, status)
         VALUES ($1, $1, $2, $3, $4, 'IN_STOCK')`,
        [serial, dropId, productId, i],
      );
    }

    await client.query(
      `INSERT INTO delivery_zones (name, method, min_distance_km, max_distance_km, pricing_method, fee_cents, is_estimate, eta_days, active)
       VALUES
        ('Local delivery (0-5km)', 'SELF_DELIVERY', 0, 5, 'FLAT', 300, false, 3, true),
        ('Local delivery (5-10km)', 'SELF_DELIVERY', 5, 10, 'FLAT', 500, false, 3, true),
        ('Australia Post — beyond 10km', 'AUSPOST', 10, NULL, 'DYNAMIC', 1675, true, 6, true),
        ('Pickup / drop-box (coming soon)', 'PICKUP', NULL, NULL, 'FLAT', 0, false, 0, false)`,
    );

    console.log(`Seeded product "${product.rows[0].name}" (${product.rows[0].sku})`);
    console.log(
      `Cost calculator: ${costCalc.effectiveTilesPerSheet} tiles/sheet, total cost $${(costCalc.totalCostCents / 100).toFixed(2)}/kit, price $${(basePriceCents / 100).toFixed(2)}`,
    );
    console.log(`Seeded drop ${drop.rows[0].drop_code} with ${drop.rows[0].total_units} units`);
    console.log("Seeded 4 delivery zones.");
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });
