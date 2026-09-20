import { describe, it, expect } from 'vitest';
import {
  ALLOWED_TILE_SIZES_CM,
  CostCalculatorError,
  computeCostBreakdown,
  tilesPerSheet,
} from '../../src/lib/costCalculator';

const baseInput = {
  materialSource: { costCents: 0, widthCm: 140, heightCm: 200, wastePercent: 12 },
  tileSizeCm: 9,
  tilesPerKit: 22,
  labourMinutes: 20,
  labourRateCentsPerHour: 3000,
  equipmentCostCents: 197,
  designCostCents: 50000,
  designAmortizationUnits: 40,
  otherMaterialComponents: [],
  packagingComponents: [
    { label: 'A5 postcard (with passport QR code)', amountCents: 131 },
    { label: 'Glassine protective sleeve', amountCents: 30 },
  ],
  operationsOverheadCents: 200,
  givingTilesPerKit: 3,
  givingInternalValueCentsPerTile: 0,
};

describe('tilesPerSheet', () => {
  it('computes raw and waste-adjusted tile yield from sheet dimensions', () => {
    // floor(140/9) * floor(200/9) = 15 * 22 = 330 raw tiles
    const { raw, effective } = tilesPerSheet(140, 200, 9, 12);
    expect(raw).toBe(330);
    // 330 * (1 - 0.12) = 290.4 -> floor -> 290
    expect(effective).toBe(290);
  });

  it('throws for a non-positive tile size', () => {
    expect(() => tilesPerSheet(140, 200, 0, 10)).toThrow(CostCalculatorError);
  });
});

describe('computeCostBreakdown', () => {
  it('rejects a tile size outside the allowed set', () => {
    expect(() => computeCostBreakdown({ ...baseInput, tileSizeCm: 12 })).toThrow(
      CostCalculatorError,
    );
    for (const size of ALLOWED_TILE_SIZES_CM) {
      expect(() => computeCostBreakdown({ ...baseInput, tileSizeCm: size })).not.toThrow();
    }
  });

  it('rejects a non-positive tilesPerKit', () => {
    expect(() => computeCostBreakdown({ ...baseInput, tilesPerKit: 0 })).toThrow(
      CostCalculatorError,
    );
  });

  it('rejects a material source that yields zero usable tiles', () => {
    expect(() =>
      computeCostBreakdown({
        ...baseInput,
        materialSource: { costCents: 500, widthCm: 5, heightCm: 5, wastePercent: 90 },
      }),
    ).toThrow(CostCalculatorError);
  });

  it('computes a full breakdown matching the known-good Slow Bloom cost numbers', () => {
    const result = computeCostBreakdown(baseInput);

    expect(result.tilesPerSheet).toBe(330);
    expect(result.effectiveTilesPerSheet).toBe(290);
    // $0 material cost -> free tiles
    expect(result.materialCostCents).toBe(0);
    // 20 minutes at $30/hr = 1000 cents
    expect(result.labourCostCents).toBe(1000);
    expect(result.equipmentCostCents).toBe(197);
    // 50000 / 40 = 1250
    expect(result.designCostPerUnitCents).toBe(1250);
    // 131 + 30
    expect(result.packagingCostCents).toBe(161);
    expect(result.operationsOverheadCents).toBe(200);
    // giving value uses whatever internal per-tile value was passed in (0 here)
    expect(result.givingValueCents).toBe(0);

    const expectedTotal =
      result.materialCostCents +
      result.labourCostCents +
      result.equipmentCostCents +
      result.designCostPerUnitCents +
      result.packagingCostCents +
      result.operationsOverheadCents +
      result.givingValueCents;
    expect(result.totalCostCents).toBe(expectedTotal);
  });

  it('values the Tile for Change contribution when an internal per-tile value is set', () => {
    const result = computeCostBreakdown({ ...baseInput, givingInternalValueCentsPerTile: 50 });
    // 3 tiles * 50 cents
    expect(result.givingValueCents).toBe(150);
    const givingLine = result.breakdown.find((l) => l.label === 'Tile for Change contribution');
    expect(givingLine).toBeDefined();
    expect(givingLine?.amountCents).toBe(150);
  });

  it('omits the giving line item entirely when givingTilesPerKit is 0', () => {
    const result = computeCostBreakdown({ ...baseInput, givingTilesPerKit: 0 });
    const givingLine = result.breakdown.find((l) => l.label === 'Tile for Change contribution');
    expect(givingLine).toBeUndefined();
  });

  it('omits the equipment line item entirely when equipmentCostCents is 0', () => {
    const result = computeCostBreakdown({ ...baseInput, equipmentCostCents: 0 });
    const equipmentLine = result.breakdown.find((l) => l.label === 'Equipment / machine time');
    expect(equipmentLine).toBeUndefined();
    expect(result.equipmentCostCents).toBe(0);
  });

  it('includes one breakdown line per packaging component, in order', () => {
    const result = computeCostBreakdown(baseInput);
    const labels = result.breakdown.map((l) => l.label);
    expect(labels).toContain('A5 postcard (with passport QR code)');
    expect(labels).toContain('Glassine protective sleeve');
    expect(labels.indexOf('A5 postcard (with passport QR code)')).toBeLessThan(
      labels.indexOf('Glassine protective sleeve'),
    );
  });

  it('adds named "other material" components (e.g. the furoshiki wrap) to cost and breakdown, separately from packaging', () => {
    const result = computeCostBreakdown({
      ...baseInput,
      otherMaterialComponents: [{ label: 'Furoshiki wrap', amountCents: 450 }],
    });
    expect(result.otherMaterialsCostCents).toBe(450);
    const wrapLine = result.breakdown.find((l) => l.label === 'Furoshiki wrap');
    expect(wrapLine).toBeDefined();
    expect(wrapLine?.amountCents).toBe(450);

    const withoutWrap = computeCostBreakdown(baseInput);
    expect(result.totalCostCents).toBe(withoutWrap.totalCostCents + 450);
  });

  it('defaults otherMaterialsCostCents to 0 when no other material components are given', () => {
    const result = computeCostBreakdown(baseInput);
    expect(result.otherMaterialsCostCents).toBe(0);
  });
});
