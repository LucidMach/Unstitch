// api/drop-status.js
// Public GET ?slug=slow-bloom -> live stock status for that product's
// current drop, so static pages (shop.astro, shop-all.astro) can reflect
// real sold-out state without being server-rendered per request.
//
// Also returns the product/drop display fields shop.astro renders (name,
// tagline, price, colour palette, feel, ages, kit contents, drop ref) —
// the site builds statically (no SSR adapter), so this is how admin edits
// made in the Pricing/Passport tabs (src/server/admin/product.js) reach
// the live page without a redeploy: shop.astro ships a static fallback,
// then overwrites it with this endpoint's response on load. Still
// read-only: the real stock check that actually prevents overselling
// happens server-side in create-checkout-session.js (this endpoint is
// never trusted for that) — this only controls what the page *shows*.

import { sendJson } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';

export default async function handler(req: any, res: any): Promise<any> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const rateResult = checkRateLimit(req, { limit: 60, windowMs: 60000, prefix: 'drop-status' });
  if (!rateResult.success) {
    return sendJson(res, 429, { error: 'Too many requests.' });
  }

  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const isListQuery = searchParams.get('all') === 'true' || searchParams.get('list') === 'true';

  try {
    if (isListQuery) {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        include: {
          costRecipe: { select: { tilesPerKit: true } },
          drops: {
            where: { status: { in: ['LIVE', 'SOLD_OUT', 'UPCOMING', 'ARCHIVED'] } },
            orderBy: [{ status: 'asc' }, { releaseAt: 'desc' }],
            take: 1,
          },
        },
      });

      const dropsList = await Promise.all(
        products.map(async (product: any) => {
          const drop = product.drops[0] || null;
          let inStock = 0;
          if (drop && drop.status === 'LIVE') {
            inStock = await prisma.unit.count({
              where: { dropId: drop.id, status: 'IN_STOCK' },
            });
          }

          let clientStatus = 'archived';
          if (drop) {
            if (drop.status === 'LIVE') {
              clientStatus = inStock > 0 ? 'live' : 'sold-out';
            } else if (drop.status === 'SOLD_OUT') {
              clientStatus = 'sold-out';
            } else if (drop.status === 'UPCOMING') {
              clientStatus = 'upcoming';
            }
          }

          return {
            slug: product.slug,
            sku: product.sku,
            name: product.name,
            tagline: product.tagline,
            eyebrow: product.tagline || (drop?.dropCode ? `Drop ${drop.dropCode}` : 'Unstitch'),
            priceCents: product.basePriceCents,
            imageUrl: product.imageUrl || '/SlowBloom.png',
            status: clientStatus,
            dropStatus: drop?.status ?? 'NONE',
            available: clientStatus === 'live',
            inStock,
            totalUnits: drop?.totalUnits ?? 0,
            dropCode: drop?.dropCode ?? '',
          };
        })
      );

      return sendJson(res, 200, { drops: dropsList });
    }

    const slug = searchParams.get('slug') || '';
    let targetSlug = slug;

    if (!targetSlug) {
      // Find current live drop product, or fallback to earliest active product
      const liveDrop = await prisma.drop.findFirst({
        where: { status: 'LIVE', product: { isActive: true } },
        include: { product: { select: { slug: true } } },
        orderBy: { releaseAt: 'desc' },
      });
      if (liveDrop?.product?.slug) {
        targetSlug = liveDrop.product.slug;
      } else {
        const defaultProduct = await prisma.product.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { slug: true },
        });
        targetSlug = defaultProduct?.slug || 'slow-bloom';
      }
    }

    const product = await prisma.product.findUnique({
      where: { slug: targetSlug },
      include: { costRecipe: { select: { tilesPerKit: true } } },
    });
    if (!product || !product.isActive) {
      return sendJson(res, 200, { available: false, status: 'NONE', inStock: 0 });
    }

    // Most relevant drop for this product: prefer a LIVE one; otherwise the
    // most recently released, so a genuinely sold-out drop still reports
    // SOLD_OUT rather than silently finding an old ARCHIVED one instead.
    const drop = await prisma.drop.findFirst({
      where: { productId: product.id, status: { in: ['LIVE', 'SOLD_OUT'] } },
      orderBy: [{ status: 'asc' }, { releaseAt: 'desc' }], // 'LIVE' < 'SOLD_OUT' alphabetically
    });

    if (!drop) {
      return sendJson(res, 200, {
        available: false,
        status: 'NONE',
        inStock: 0,
        totalUnits: 0,
        dropCode: '',
        slug: product.slug,
        sku: product.sku,
        name: product.name,
        tagline: product.tagline,
        description: product.description,
        imageUrl: product.imageUrl || '/SlowBloom.png',
        basePriceCents: product.basePriceCents,
        currency: product.currency,
        colourPalette: product.colourPalette,
        materialRigidity: product.materialRigidity,
        ageRangeMin: product.ageRangeMin,
        ageRangeMax: product.ageRangeMax,
        kitContents: product.kitContents,
        tilesPerKit: product.costRecipe?.tilesPerKit ?? null,
      });
    }

    const inStock = await prisma.unit.count({ where: { dropId: drop.id, status: 'IN_STOCK' } });

    return sendJson(res, 200, {
      available: drop.status === 'LIVE' && inStock > 0,
      status: drop.status,
      inStock,
      totalUnits: drop.totalUnits,
      dropCode: drop.dropCode,
      slug: product.slug,
      sku: product.sku,
      // Display fields — see header comment above.
      name: product.name,
      tagline: product.tagline,
      description: product.description,
      imageUrl: product.imageUrl || '/SlowBloom.png',
      basePriceCents: product.basePriceCents,
      currency: product.currency,
      colourPalette: product.colourPalette,
      materialRigidity: product.materialRigidity,
      ageRangeMin: product.ageRangeMin,
      ageRangeMax: product.ageRangeMax,
      kitContents: product.kitContents,
      tilesPerKit: product.costRecipe?.tilesPerKit ?? null,
    });
  } catch (err) {
    console.error('[drop-status] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to check stock.' });
  }
}
