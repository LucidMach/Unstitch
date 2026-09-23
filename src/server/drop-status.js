// api/drop-status.js
// Public GET ?slug=slow-bloom -> live stock status for that product's
// current drop, so static pages (shop.astro, shop-all.astro) can reflect
// real sold-out state without being server-rendered per request.
//
// Read-only and deliberately minimal: just enough for the storefront to
// disable "Add to Bag" and show "Sold out" when it's actually true. The
// real stock check that actually prevents overselling still happens
// server-side in create-checkout-session.js (this endpoint is never
// trusted for that) — this only controls what the page *shows*.

import { sendJson } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';

export default async function handler(req, res) {
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
  const slug = searchParams.get('slug') || '';
  if (!slug) {
    return sendJson(res, 400, { error: 'Missing slug.' });
  }

  try {
    const product = await prisma.product.findUnique({ where: { slug } });
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
      return sendJson(res, 200, { available: false, status: 'NONE', inStock: 0 });
    }

    const inStock = await prisma.unit.count({ where: { dropId: drop.id, status: 'IN_STOCK' } });

    return sendJson(res, 200, {
      available: drop.status === 'LIVE' && inStock > 0,
      status: drop.status,
      inStock,
      totalUnits: drop.totalUnits,
    });
  } catch (err) {
    console.error('[drop-status] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to check stock.' });
  }
}
