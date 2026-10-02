// api/admin/product.js
// GET  -> the Slow Bloom product + its cost recipe + material source, for
//         the admin panel's pricing form.
// POST -> one of five independent edits, chosen by `section`:
//   "price"    { basePriceCents }                — override the retail price directly, no recalculation.
//   "copy"     { tagline?, description? }         — edit customer-facing text.
//   "recipe"   { recipe: {...} }                  — edit the underlying cost inputs (material cost/size/waste,
//                                                    labour, equipment, operations overhead, giving tiles) plus a
//                                                    target margin, recompute the full cost breakdown the same way
//                                                    prisma/seed.ts originally did, and write the result back to
//                                                    both Product (basePriceCents/costBreakdown/lastCostCalculationCents)
//                                                    and ProductCostRecipe/MaterialSource.
//   "passport" { ...fields }                      — edit the digital passport's content (src/pages/passport.astro):
//                                                    kit specs, assembly/care steps, safety notes, snap & share
//                                                    copy, and the editable-copy fields. See PassportSchema below
//                                                    for the exact shape; every field is optional so the admin
//                                                    form can save one card at a time.
//   "drop"     { madeLocation?, madeYear? }       — edit the *active* drop's made-location/year (Drop.status
//                                                    'LIVE', falling back to the most recently created drop if
//                                                    none is LIVE). Lives here rather than in api/admin/inventory.js
//                                                    since it's passport copy, not stock management.
//   "passport-design" { design, passportDesign } | { design, clear: true } — upload (or remove) one named
//                                                    design's interactive step-by-step build viewer package,
//                                                    exported from the Unstitch passport-viewer tool as a single
//                                                    "unstitch-instructions" JSON file ("design" must match one of
//                                                    the product's Passport.designs entries, e.g. "Turtle"). Each
//                                                    upload is merged into Product.passportDesigns (a JSON object
//                                                    keyed by design name) rather than replacing the whole field,
//                                                    so uploading one design's package never clears the others.
//                                                    Rendered live by src/pages/passport.astro, which lets the
//                                                    visitor pick a design when more than one is uploaded;
//                                                    { clear: true } removes just that one design's entry, falling
//                                                    back to the designsGuidePdfUrl link once none remain.
//
// Only handles the single "slow-bloom" product — this site sells one SKU
// at a time, so there's nothing to select between yet.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';
import { computeCostBreakdown, ALLOWED_TILE_SIZES_CM } from '../../lib/costCalculator.js';

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

// Every field optional: the admin Passport tab saves whichever card was
// edited, not the whole form at once. Array fields (designs, techniques,
// careSteps, safetyNotes, snapShareHashtags) come in as a single field
// split on newlines client-side, one item per line — see admin/index.astro.
const PassportSchema = z.object({
  colourPalette: z.array(z.string()).optional(),
  tileMaterial: z.string().nullable().optional(),
  materialRigidity: z.string().nullable().optional(),
  kitContents: z.array(z.string()).optional(),
  wrapBuildDimensions: z.string().nullable().optional(),
  designs: z.array(z.string()).optional(),
  techniques: z.array(z.string()).optional(),
  careSteps: z.array(z.string()).optional(),
  careVideoUrl: z.string().nullable().optional(),
  carePdfUrl: z.string().nullable().optional(),
  safetyNotes: z.array(z.string()).optional(),
  designsGuidePdfUrl: z.string().nullable().optional(),
  snapShareCopy: z.string().nullable().optional(),
  snapShareHashtags: z.array(z.string()).optional(),
  registerIntroCopy: z.string().nullable().optional(),
  reviewCopyTemplate: z.string().nullable().optional(),
  scanAgainCopy: z.string().nullable().optional(),
});

const DropContentSchema = z.object({
  madeLocation: z.string().trim().min(1).max(120).optional(),
  madeYear: z.number().int().min(2000).max(2100).optional(),
});

// Loose on purpose: this is an opaque export from a separate design tool
// (steps carry nested SVG strings, cues, etc. that evolve independently of
// this API) — we only check the envelope is actually a passport-viewer
// package, not every field inside it, and store it as-is.
const PassportDesignSchema = z.object({
  design: z.string().trim().min(1).max(120),
  passportDesign: z
    .object({
      format: z.literal('unstitch-instructions'),
      steps: z.array(z.record(z.any())).min(1),
    })
    .passthrough(),
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

    // Included so the Passport tab's "Made" field can prefill from the
    // actual active drop, same lookup used by the "drop" section above.
    let activeDrop = await prisma.drop.findFirst({ where: { productId: product.id, status: 'LIVE' } });
    if (!activeDrop) {
      activeDrop = await prisma.drop.findFirst({ where: { productId: product.id }, orderBy: { createdAt: 'desc' } });
    }

    return sendJson(res, 200, { product, activeDrop });
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

    if (body.section === 'passport') {
      const parseResult = PassportSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const p = parseResult.data;
      const data = {};
      // Scalars: only touch a field if the caller actually sent it (matches
      // the "copy" section's pattern above), so saving one card never wipes
      // fields that belong to a different card.
      for (const key of [
        'tileMaterial', 'materialRigidity', 'wrapBuildDimensions', 'careVideoUrl',
        'carePdfUrl', 'designsGuidePdfUrl', 'snapShareCopy', 'registerIntroCopy',
        'reviewCopyTemplate', 'scanAgainCopy',
      ]) {
        if (key in body) data[key] = p[key] === '' ? null : (p[key] ?? null);
      }
      for (const key of ['colourPalette', 'kitContents', 'designs', 'techniques', 'careSteps', 'safetyNotes', 'snapShareHashtags']) {
        if (key in body && p[key] !== undefined) data[key] = p[key];
      }
      const product = await prisma.product.update({ where: { slug: SLUG }, data });
      return sendJson(res, 200, { product });
    }

    if (body.section === 'drop') {
      const parseResult = DropContentSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const product = await prisma.product.findUnique({ where: { slug: SLUG } });
      if (!product) return sendJson(res, 404, { error: 'Product not found.' });

      // "Active" drop mirrors the convention already used in
      // api/admin/manual-order.js: the single LIVE drop for this product,
      // falling back to the most recently created one so there's still
      // somewhere for "Made" to land before a drop is officially live.
      let drop = await prisma.drop.findFirst({ where: { productId: product.id, status: 'LIVE' } });
      if (!drop) {
        drop = await prisma.drop.findFirst({ where: { productId: product.id }, orderBy: { createdAt: 'desc' } });
      }
      if (!drop) return sendJson(res, 404, { error: 'No drop found for this product yet.' });

      const data = {};
      if (parseResult.data.madeLocation !== undefined) data.madeLocation = parseResult.data.madeLocation;
      if (parseResult.data.madeYear !== undefined) data.madeYear = parseResult.data.madeYear;
      const updated = await prisma.drop.update({ where: { id: drop.id }, data });
      return sendJson(res, 200, { drop: updated });
    }

    if (body.section === 'passport-design') {
      const existing = await prisma.product.findUnique({ where: { slug: SLUG } });
      if (!existing) return sendJson(res, 404, { error: 'Product not found.' });
      const current =
        existing.passportDesigns && typeof existing.passportDesigns === 'object' && !Array.isArray(existing.passportDesigns)
          ? { ...existing.passportDesigns }
          : {};

      if (body.clear === true) {
        const design = typeof body.design === 'string' ? body.design.trim() : '';
        if (!design) return sendJson(res, 400, { error: 'Missing design name.' });
        delete current[design];
        const product = await prisma.product.update({
          where: { slug: SLUG },
          data: { passportDesigns: Object.keys(current).length ? current : null },
        });
        return sendJson(res, 200, { product });
      }

      const parseResult = PassportDesignSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message || 'That does not look like a valid passport-viewer package.', fieldErrors: formatted.fieldErrors });
      }
      current[parseResult.data.design] = parseResult.data.passportDesign;
      const product = await prisma.product.update({
        where: { slug: SLUG },
        data: { passportDesigns: current },
      });
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
