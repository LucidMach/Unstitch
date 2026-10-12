// src/server/reviews.js — wired in at /api/reviews via api/[...route].js's
// dispatcher, same pattern as every other handler in this directory.
//
// POST  -> submit a review. Verified against a real order the same way
//          order-lookup-by-number.js verifies one (orderNumber + email
//          pair) — see that file's comment for why that pair, and not the
//          order number alone, counts as proof of ownership. The unit
//          serial printed on a kit's QR tag is deliberately NOT accepted
//          here on its own: unlike an order number, a serial is meant to
//          be scanned by anyone (that's how passport registration works),
//          so it can't double as a secret. Reviews additionally require
//          the order to be DELIVERED and to actually contain the product
//          being reviewed, and are capped at one review per order+product
//          (checked at the application level — see note on the schema's
//          lack of a @@unique for this below). New reviews always land as
//          PENDING; nothing posted here appears publicly until an admin
//          publishes it (see src/server/admin/reviews.js).
//
// GET   -> public, no auth: published reviews for one product (?product=
//          slug), newest first. Only ever returns PUBLISHED rows, and
//          only ever a reviewer's first name (never the full name/email),
//          mirroring how sanitizeOrder-style handlers keep PII out of
//          anything that isn't already proof-gated.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';

const SubmitSchema = z.object({
  productSlug: z.string().trim().min(1).max(160),
  orderNumber: z.string().trim().toUpperCase().min(1).max(30),
  email: z.string().trim().toLowerCase().email(),
  ratingPlay: z.number().int().min(1).max(5),
  ratingBuild: z.number().int().min(1).max(5),
  ratingValue: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  wouldRecommend: z.boolean().optional(),
  // Whether the reviewer opted to show their kit's edition number (the
  // "Verified Owner — Slow Bloom #7 of 40" badge). Only honoured if their
  // order actually has a specific unit assigned to this product's line
  // item — otherwise there's nothing to show regardless of this flag.
  showUnit: z.boolean().optional().default(true),
});

const ORDER_NOT_FOUND_MESSAGE =
  "We couldn't find an order with that number and email. Double-check both — it's on your order confirmation email.";

// A review's single star-average, stored once so listing queries don't
// have to recompute it (see Review.rating's comment in schema.prisma).
function averageRating(play: number, build: number, value: number): number {
  return Math.round((play + build + value) / 3);
}

function firstName(name: string | null | undefined): string {
  if (!name) return 'Verified Owner';
  const trimmed = name.trim();
  if (!trimmed) return 'Verified Owner';
  return trimmed.split(/\s+/)[0];
}

async function handlePost(req: any, res: any) {
  const rateResult = checkRateLimit(req, { limit: 5, windowMs: 10 * 60000, prefix: 'reviews-submit' });
  if (!rateResult.success) {
    return sendJson(res, 429, { error: 'Too many requests. Please wait a few minutes and try again.' });
  }

  const body = parseRequestBody(req);
  const parseResult = SubmitSchema.safeParse(body);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
  }
  const { productSlug, orderNumber, email, ratingPlay, ratingBuild, ratingValue, title, body: reviewBody, wouldRecommend, showUnit } =
    parseResult.data;

  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  try {
    const product = await prisma.product.findUnique({ where: { slug: productSlug }, select: { id: true } });
    if (!product) {
      return sendJson(res, 404, { error: 'Unknown product.' });
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        customer: { select: { id: true, email: true } },
        items: { include: { unit: { select: { id: true, editionNumber: true } } } },
      },
    });
    if (!order || order.customer?.email?.toLowerCase() !== email) {
      return sendJson(res, 404, { error: ORDER_NOT_FOUND_MESSAGE });
    }

    if (order.status !== 'DELIVERED') {
      return sendJson(res, 409, {
        error: "This order isn't marked as delivered yet, so we can't verify a review from it. Try again once it's arrived.",
      });
    }

    const matchingItem = order.items.find((item: any) => item.productId === product.id);
    if (!matchingItem) {
      return sendJson(res, 409, { error: "That order doesn't include this product, so we can't verify a review for it." });
    }

    // One review per order+product. No @@unique(orderId, productId) exists
    // on Review (see schema.prisma) because an order can in principle
    // contain the same product more than once across different line
    // items/units, and a future "review each unit separately" design
    // might want that — enforced here instead, scoped to this order.
    const existing = await prisma.review.findFirst({
      where: { orderId: order.id, productId: product.id },
      select: { id: true },
    });
    if (existing) {
      return sendJson(res, 409, { error: "You've already reviewed this product from this order." });
    }

    const unitId = showUnit && matchingItem.unitId ? matchingItem.unitId : null;

    await prisma.review.create({
      data: {
        productId: product.id,
        customerId: order.customer!.id,
        orderId: order.id,
        unitId,
        rating: averageRating(ratingPlay, ratingBuild, ratingValue),
        ratingPlay,
        ratingBuild,
        ratingValue,
        title: title || null,
        body: reviewBody || null,
        wouldRecommend: wouldRecommend ?? null,
      },
    });

    return sendJson(res, 201, {
      ok: true,
      status: 'PENDING',
      message: 'Thanks! Your review is in — we check each one before it goes live.',
    });
  } catch (err: any) {
    console.error('[reviews] Submit failed:', err);
    return sendJson(res, 500, { error: 'Something went wrong. Please try again shortly.' });
  }
}

async function handleGet(req: any, res: any) {
  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const productSlug = searchParams.get('product');
  if (!productSlug) return sendJson(res, 400, { error: 'Missing product.' });

  const limitParam = Number(searchParams.get('limit'));
  const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 20;
  const cursor = searchParams.get('cursor') || undefined;

  if (!prisma) return sendJson(res, 200, { reviews: [], nextCursor: null });

  try {
    const product = await prisma.product.findUnique({
      where: { slug: productSlug },
      select: { id: true, totalUnits: true },
    });
    if (!product) return sendJson(res, 404, { error: 'Unknown product.' });

    const reviews = await prisma.review.findMany({
      where: { productId: product.id, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        customer: { select: { name: true } },
        unit: { select: { editionNumber: true } },
      },
    });

    const hasMore = reviews.length > take;
    const page = hasMore ? reviews.slice(0, take) : reviews;

    return sendJson(res, 200, {
      reviews: page.map((review: any) => ({
        id: review.id,
        rating: review.rating,
        ratingPlay: review.ratingPlay,
        ratingBuild: review.ratingBuild,
        ratingValue: review.ratingValue,
        title: review.title,
        body: review.body,
        wouldRecommend: review.wouldRecommend,
        createdAt: review.createdAt,
        reviewerFirstName: firstName(review.customer?.name),
        unitBadge: review.unit
          ? { editionNumber: review.unit.editionNumber, totalUnits: product.totalUnits }
          : null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err: any) {
    console.error('[reviews] List failed:', err);
    return sendJson(res, 500, { error: 'Unable to load reviews.' });
  }
}

export default async function handler(req: any, res: any): Promise<any> {
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'GET') return handleGet(req, res);
  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}
