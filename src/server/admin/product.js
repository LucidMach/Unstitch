// api/admin/product.js
// GET  -> the Slow Bloom product + its cost recipe + material source, for
//         the admin panel's pricing form.
// POST -> one of three independent edits, chosen by `section`:
//   "price"  { basePriceCents }                — override the retail price directly, no recalculation.
//   "copy"   { tagline?, description? }         — edit customer-facing text.
//   "recipe" { recipe: {...} }                  — edit the underlying cost inputs (material cost/size/waste,
//                                                  labour, equipment, operations overhead, giving tiles) plus a
//                                                  target margin, recompute the full cost breakdown the same way
//                                                  prisma/seed.ts originally did, and write the result back to
//                                                  both Product (basePriceCents/costBreakdown/lastCostCalculationCents)
//                                                  and ProductCostRecipe/MaterialSource.
//
// Only handles the single "slow-bloom" product — this site sells one SKU
// at a time, so there's nothing to select between yet.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../src/lib/apiHelper.js';
import { requireAdmin } from '../../src/lib/adminAuth.js';
import prisma from '../../src/lib/prisma.js';
import { computeCostBreakdown, ALLOWED_TILE_SIZES_CM } from '../../src/lib/costCalculator.js';

const SLUG = 'slow-bloom';

const RecipeSchema = z.object({
  materialCostCents: z.number().int().min(0),
  materialWidthCm: z.number().int().positive(),
  materialHeightCm: z.number().int().positive(),
  materialWastePercent: z.number().min(0).max(100),
  tileSizeCm: z
    .number()
    .int()
    .refine((v) => ALLOWED_TILE_SIZES_CM.includes(v), {
      message: `tileSizeCm must be one of ${ALLOWED_TILE_SIZES_CM.join(', ')}`,
    }),
  tilesPerKit: z.number().int().positive(),
  labourMinutes: z.number().min(0),
  labourRateCentsPerHour: z.number().int().min(0),
  equipmentCostCents: z.number().int().min(0),
  operationsOverheadCents: z.number().int().min(0),
  givingTilesPerKit: z.number().int().min(0),
  marginCents: z.number().int(),
});

export default async function handler(req, res) {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const product = await prisma.product.findUnique({
      where: { slug: SLUG },
      include: { costRecipe: { include: { materialSource: true } } },
    });
    if (!product) return sendJson(res, 404, { error: 'Product not found.' });
    return sendJson(res, 200, { product });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = parseRequestBody(req);

  try {
    if (body.section === 'price') {
      const basePriceCents = Math.round(Number(body.basePriceCents));
      if (!Number.isFinite(basePriceCents) || basePriceCents <= 0) {
        return sendJson(res, 400, { error: 'Invalid price.' });
      }
      const product = await prisma.product.update({ where: { slug: SLUG }, data: { basePriceCents } });
      return sendJson(res, 200, { product });
    }

    if (body.section === 'copy') {
      const data = {};
      if (typeof body.tagline === 'string') data.tagline = body.tagline.trim().slice(0, 280);
      if (typeof body.description === 'string') data.description = body.description.trim();
      const product = await prisma.product.update({ where: { slug: SLUG }, data });
      return sendJson(res, 200, { product });
    }

    if (body.section === 'recipe') {
      const parseResult = RecipeSchema.safeParse(body.recipe);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const r = parseResult.data;

      const existing = await prisma.product.findUnique({
        where: { slug: SLUG },
        include: { costRecipe: { include: { materialSource: true } } },
      });
      if (!existing || !existing.costRecipe) {
        return sendJson(res, 404, { error: 'Cost recipe not found.' });
      }

      // Two-pass, matching prisma/seed.ts exactly: the giving line item
      // needs a per-tile internal value, which we only know after
      // computing the breakdown once without it.
      const baseInput = {
        materialSource: {
          costCents: r.materialCostCents,
          widthCm: r.materialWidthCm,
          heightCm: r.materialHeightCm,
          wastePercent: r.materialWastePercent,
        },
        tileSizeCm: r.tileSizeCm,
        tilesPerKit: r.tilesPerKit,
        labourMinutes: r.labourMinutes,
        labourRateCentsPerHour: r.labourRateCentsPerHour,
        equipmentCostCents: r.equipmentCostCents,
        designCostCents: existing.costRecipe.designCostCents,
        designAmortizationUnits: existing.costRecipe.designAmortizationUnits,
        otherMaterialComponents: existing.costRecipe.otherMaterialComponents,
        packagingComponents: existing.costRecipe.packagingComponents,
        operationsOverheadCents: r.operationsOverheadCents,
        givingTilesPerKit: r.givingTilesPerKit,
        givingInternalValueCentsPerTile: 0,
      };
      const firstPass = computeCostBreakdown(baseInput);
      const givingInternalValueCentsPerTile = Math.round(firstPass.costPerTileCents);
      const costCalc = computeCostBreakdown({ ...baseInput, givingInternalValueCentsPerTile });

      const basePriceCents = Math.ceil((costCalc.totalCostCents + r.marginCents) / 50) * 50;

      const [product] = await prisma.$transaction([
        prisma.product.update({
          where: { slug: SLUG },
          data: {
            basePriceCents,
            costBreakdown: costCalc.breakdown,
            lastCostCalculationCents: costCalc.totalCostCents,
            givingTilesPerKit: r.givingTilesPerKit,
            givingInternalValueCentsPerTile,
          },
        }),
        prisma.productCostRecipe.update({
          where: { productId: existing.id },
          data: {
            tileSizeCm: r.tileSizeCm,
            tilesPerKit: r.tilesPerKit,
            labourMinutes: r.labourMinutes,
            labourRateCentsPerHour: r.labourRateCentsPerHour,
            equipmentCostCents: r.equipmentCostCents,
            operationsOverheadCents: r.operationsOverheadCents,
            givingTilesPerKit: r.givingTilesPerKit,
          },
        }),
        prisma.materialSource.update({
          where: { id: existing.costRecipe.materialSourceId },
          data: {
            costCents: r.materialCostCents,
            widthCm: r.materialWidthCm,
            heightCm: r.materialHeightCm,
            wastePercent: r.materialWastePercent,
          },
        }),
      ]);

      return sendJson(res, 200, { product, costCalc });
    }

    return sendJson(res, 400, { error: 'Unknown section.' });
  } catch (err) {
    console.error('[admin/product] Update failed:', err);
    return sendJson(res, 500, { error: 'Update failed.' });
  }
}
