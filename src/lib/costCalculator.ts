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

export interface MaterialSourceInput {
  costCents: number;
  widthCm: number;
  heightCm: number;
  wastePercent: number;
}

export interface CostComponent {
  label: string;
  amountCents: number;
}

export interface CostRecipeInput {
  materialSource: MaterialSourceInput;
  tileSizeCm: number;
  tilesPerKit: number;
  labourMinutes: number;
  labourRateCentsPerHour: number;
  equipmentCostCents: number;
  designCostCents: number;
  designAmortizationUnits: number;
  otherMaterialComponents: CostComponent[];
  packagingComponents: CostComponent[];
  operationsOverheadCents: number;
  givingTilesPerKit: number;
  givingInternalValueCentsPerTile: number;
}

export interface CostBreakdownLine {
  label: string;
  amountCents: number;
  note?: string;
}

export interface CostCalculationResult {
  tilesPerSheet: number;
  effectiveTilesPerSheet: number;
  costPerTileCents: number;
  materialCostCents: number;
  otherMaterialsCostCents: number;
  labourCostCents: number;
  equipmentCostCents: number;
  designCostPerUnitCents: number;
  packagingCostCents: number;
  operationsOverheadCents: number;
  givingValueCents: number;
  totalCostCents: number;
  breakdown: CostBreakdownLine[];
}

export class CostCalculatorError extends Error {}

/**
 * How many square tiles of `tileSizeCm` can be cut from a sheet of
 * `widthCm` x `heightCm`, after allowing `wastePercent` for cutting loss,
 * seam allowance, and unusable offcuts.
 */
export function tilesPerSheet(
  widthCm: number,
  heightCm: number,
  tileSizeCm: number,
  wastePercent: number
): { raw: number; effective: number } {
  if (tileSizeCm <= 0) throw new CostCalculatorError('tileSizeCm must be positive');
  const raw = Math.floor(widthCm / tileSizeCm) * Math.floor(heightCm / tileSizeCm);
  const effective = Math.floor(raw * (1 - wastePercent / 100));
  return { raw, effective };
}

export function computeCostBreakdown(input: CostRecipeInput): CostCalculationResult {
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

  const breakdown: CostBreakdownLine[] = [
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

function round(n: number): number {
  return Math.round(n);
}

