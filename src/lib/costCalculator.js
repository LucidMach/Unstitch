/**
 * Cost calculator — turns a product's cost recipe (material source + tile
 * size + labour + design + packaging + giving inputs) into the per-kit
 * cost breakdown shown on the product page and receipt.
 *
 * This is a pure function deliberately kept independent of the database and
 * of any admin UI framework, so it can be called from an API route (see
 * api/admin/product.js), a script (prisma/seed.ts), or a test
 * (tests/lib/costCalculator.test.ts).
 *
 * (Originally written as `costCalculator.ts`; converted to plain JS with
 * JSDoc types so it can be imported directly, with a plain extensionless
 * or `.js` relative specifier, from the root-level `api/*.js` Vercel
 * functions without depending on a bundler's TS-to-JS extension-rewriting
 * behavior at build time — same reasoning as `inventory.js`.)
 */

export const ALLOWED_TILE_SIZES_CM = [7, 8, 9, 10, 11];

/**
 * @typedef {{ costCents: number, widthCm: number, heightCm: number, wastePercent: number }} MaterialSourceInput
 *
 * @typedef {Object} CostRecipeInput
 * @property {MaterialSourceInput} materialSource
 * @property {number} tileSizeCm
 * @property {number} tilesPerKit
 * @property {number} labourMinutes
 * @property {number} labourRateCentsPerHour
 * @property {number} equipmentCostCents - Cutting/production equipment time (e.g. a laser cutter makerspace membership) — a machine-time cost, distinct from labour wages.
 * @property {number} designCostCents
 * @property {number} designAmortizationUnits - e.g. drop size — spreads a one-off design cost across the batch
 * @property {{label: string, amountCents: number}[]} otherMaterialComponents - Named material costs that aren't cut from the tile sheet (so don't fit the tilesPerSheet/costPerTile math above) but are still materials, not packaging — e.g. the furoshiki wrap itself.
 * @property {{label: string, amountCents: number}[]} packagingComponents - e.g. postcard, glassine sleeve (protective/shipping materials, not part of the kit itself)
 * @property {number} operationsOverheadCents
 * @property {number} givingTilesPerKit
 * @property {number} givingInternalValueCentsPerTile
 *
 * @typedef {{ label: string, amountCents: number, note?: string }} CostBreakdownLine
 *
 * @typedef {Object} CostCalculationResult
 * @property {number} tilesPerSheet
 * @property {number} effectiveTilesPerSheet
 * @property {number} costPerTileCents
 * @property {number} materialCostCents
 * @property {number} otherMaterialsCostCents
 * @property {number} labourCostCents
 * @property {number} equipmentCostCents
 * @property {number} designCostPerUnitCents
 * @property {number} packagingCostCents
 * @property {number} operationsOverheadCents
 * @property {number} givingValueCents
 * @property {number} totalCostCents
 * @property {CostBreakdownLine[]} breakdown
 */

export class CostCalculatorError extends Error {}

/**
 * How many square tiles of `tileSizeCm` can be cut from a sheet of
 * `widthCm` x `heightCm`, after allowing `wastePercent` for cutting loss,
 * seam allowance, and unusable offcuts.
 * @param {number} widthCm @param {number} heightCm @param {number} tileSizeCm @param {number} wastePercent
 * @returns {{ raw: number, effective: number }}
 */
export function tilesPerSheet(widthCm, heightCm, tileSizeCm, wastePercent) {
  if (tileSizeCm <= 0) throw new CostCalculatorError('tileSizeCm must be positive');
  const raw = Math.floor(widthCm / tileSizeCm) * Math.floor(heightCm / tileSizeCm);
  const effective = Math.floor(raw * (1 - wastePercent / 100));
  return { raw, effective };
}

/**
 * @param {CostRecipeInput} input
 * @returns {CostCalculationResult}
 */
export function computeCostBreakdown(input) {
  if (!ALLOWED_TILE_SIZES_CM.includes(input.tileSizeCm)) {
    throw new CostCalculatorError(
      `tileSizeCm must be one of ${ALLOWED_TILE_SIZES_CM.join(', ')}cm — got ${input.tileSizeCm}`,
    );
  }
  if (input.tilesPerKit <= 0) {
    throw new CostCalculatorError('tilesPerKit must be greater than 0');
  }

  const { raw, effective } = tilesPerSheet(
    input.materialSource.widthCm,
    input.materialSource.heightCm,
    input.tileSizeCm,
    input.materialSource.wastePercent,
  );

  if (effective <= 0) {
    throw new CostCalculatorError(
      'This material source yields 0 usable tiles at this size/waste allowance — check dimensions.',
    );
  }

  const costPerTileCents = input.materialSource.costCents / effective;
  const materialCostCents = round(costPerTileCents * input.tilesPerKit);

  const otherMaterialsCostCents = input.otherMaterialComponents.reduce((sum, c) => sum + c.amountCents, 0);

  const labourCostCents = round((input.labourMinutes / 60) * input.labourRateCentsPerHour);

  const designCostPerUnitCents = round(input.designCostCents / Math.max(1, input.designAmortizationUnits));

  const packagingCostCents = input.packagingComponents.reduce((sum, c) => sum + c.amountCents, 0);

  const givingValueCents = round(input.givingTilesPerKit * input.givingInternalValueCentsPerTile);

  const totalCostCents =
    materialCostCents +
    otherMaterialsCostCents +
    labourCostCents +
    input.equipmentCostCents +
    designCostPerUnitCents +
    packagingCostCents +
    input.operationsOverheadCents +
    givingValueCents;

  /** @type {CostBreakdownLine[]} */
  const breakdown = [
    {
      label: 'Materials',
      amountCents: materialCostCents,
      note: `${input.tilesPerKit} × ${input.tileSizeCm}cm tiles (${effective} tiles/sheet after ${input.materialSource.wastePercent}% waste allowance)`,
    },
  ];

  for (const component of input.otherMaterialComponents) {
    breakdown.push({ label: component.label, amountCents: component.amountCents });
  }

  breakdown.push({ label: 'Melbourne-based labour & craft', amountCents: labourCostCents });

  if (input.equipmentCostCents > 0) {
    breakdown.push({ label: 'Equipment / machine time', amountCents: input.equipmentCostCents });
  }

  breakdown.push({ label: 'Design (amortised)', amountCents: designCostPerUnitCents });

  for (const component of input.packagingComponents) {
    breakdown.push({ label: component.label, amountCents: component.amountCents });
  }

  breakdown.push({ label: 'Operations & platform costs', amountCents: input.operationsOverheadCents });

  if (input.givingTilesPerKit > 0) {
    breakdown.push({
      label: 'Tile for Change contribution',
      amountCents: givingValueCents,
      note: `${input.givingTilesPerKit} piece(s) donated per kit`,
    });
  }

  return {
    tilesPerSheet: raw,
    effectiveTilesPerSheet: effective,
    costPerTileCents,
    materialCostCents,
    otherMaterialsCostCents,
    labourCostCents,
    equipmentCostCents: input.equipmentCostCents,
    designCostPerUnitCents,
    packagingCostCents,
    operationsOverheadCents: input.operationsOverheadCents,
    givingValueCents,
    totalCostCents,
    breakdown,
  };
}

/** @param {number} n @returns {number} */
function round(n) {
  return Math.round(n);
}
