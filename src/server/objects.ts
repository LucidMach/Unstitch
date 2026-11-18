// src/server/objects.ts -- public, read-only. Wired in at /api/objects via
// api/[...route].ts (and the dev middleware in astro.config.ts).
//
// GET /api/objects                  -> { objects: [...] } the objects added
//                                      from Admin > Objects (visible ones only)
// GET /api/objects?image=<slug>&v=n -> the photo's bytes. `v` is the row's
//                                      updatedAt, so the URL changes whenever
//                                      the photo does and can be cached forever.
//
// The /how-it-works page already renders the built-in objects at build time
// and appends these in the browser, so adding one never needs a redeploy.

import { sendJson } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';

export default async function handler(req: any, res: any): Promise<any> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const rate = checkRateLimit(req, { limit: 120, windowMs: 60000, prefix: 'objects' });
  if (!rate.success) return sendJson(res, 429, { error: 'Too many requests.' });

  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const imageSlug = searchParams.get('image');

  try {
    if (imageSlug) {
      const row = await prisma.designObject.findUnique({
        where: { slug: imageSlug },
        select: { imageData: true, imageMime: true, hidden: true },
      });
      if (!row || row.hidden || !row.imageData || !row.imageMime) {
        return sendJson(res, 404, { error: 'Not found' });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', row.imageMime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.end(Buffer.from(row.imageData));
      return res;
    }

    const rows = await prisma.designObject.findMany({
      where: { hidden: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        slug: true,
        name: true,
        tagline: true,
        summary: true,
        objectType: true,
        tiles: true,
        materials: true,
        buildTime: true,
        credits: true,
        imageAlt: true,
        imageMime: true,
        imageWidth: true,
        imageHeight: true,
        sortOrder: true,
        updatedAt: true,
      },
    });

    // Slugs hidden in the admin: the page also drops a built-in object with the same slug.
    const hidden = await prisma.designObject.findMany({ where: { hidden: true }, select: { slug: true } });

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
    return sendJson(res, 200, {
      hiddenSlugs: hidden.map((h: any) => h.slug),
      objects: rows.map((r: any) => ({
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        summary: r.summary,
        objectType: r.objectType,
        tiles: r.tiles,
        materials: r.materials,
        buildTime: r.buildTime,
        credits: r.credits,
        imageAlt: r.imageAlt,
        imageWidth: r.imageWidth,
        imageHeight: r.imageHeight,
        sortOrder: r.sortOrder,
        imageUrl: r.imageMime
          ? `/api/objects?image=${encodeURIComponent(r.slug)}&v=${new Date(r.updatedAt).getTime()}`
          : null,
      })),
    });
  } catch (err) {
    console.error('[objects] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load objects.' });
  }
}
