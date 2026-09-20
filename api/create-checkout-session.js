// api/create-checkout-session.js
// Vercel Serverless Function — starts a Stripe Checkout (hosted) session for
// the current live drop. Never trusts a client-sent price: the amount
// charged always comes from Product.basePriceCents in the database, looked
// up by slug, at the moment the session is created.

import { CreateCheckoutSessionSchema } from '../src/lib/schemas/checkout.js';
import { checkRateLimit } from '../src/lib/rateLimit.js';
import { formatZodError, sendJson, parseRequestBody } from '../src/lib/apiHelper.js';
import prisma from '../src/lib/prisma.js';
import stripe from '../src/lib/stripe.js';
import { reserveUnitsForDrop, releaseUnits, InsufficientStockError } from '../src/lib/inventory.js';
import { getSiteOrigin } from '../src/lib/siteOrigin.js';

// Checkout Sessions get a 30-minute hold on the reserved units — Stripe's
// documented minimum for `expires_at`. Long enough for someone to actually
// enter card details, short enough that a walked-away customer doesn't tie
// up real stock on a 10-unit drop for long.
const SESSION_HOLD_SECONDS = 30 * 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Rate limit checkout attempts per IP — generous enough for a genuine
  // customer retrying after a card decline, tight enough to blunt scripted
  // attempts to exhaust a 10-unit drop's stock via repeated reservations.
  const rateResult = checkRateLimit(req, { limit: 12, windowMs: 60000, prefix: 'checkout' });
  if (!rateResult.success) {
    res.setHeader('Retry-After', Math.ceil((rateResult.resetTime - Date.now()) / 1000).toString());
    return sendJson(res, 429, { error: 'Too many requests. Please wait a moment before trying again.' });
  }

  if (!prisma) {
    console.error('[create-checkout-session] Prisma is not configured (missing DATABASE_URL).');
    return sendJson(res, 503, { error: 'The store is temporarily unavailable. Please try again shortly.' });
  }

  if (!stripe) {
    console.error('[create-checkout-session] Stripe is not configured (missing STRIPE_SECRET_KEY).');
    return sendJson(res, 503, { error: 'Checkout is temporarily unavailable. Please try again shortly.' });
  }

  const rawBody = parseRequestBody(req);
  const parseResult = CreateCheckoutSessionSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
  }

  const { slug, quantity, email } = parseResult.data;

  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product || !product.isActive) {
    return sendJson(res, 404, { error: 'That product is not available.' });
  }

  const drop = await prisma.drop.findFirst({
    where: { productId: product.id, status: 'LIVE' },
    orderBy: { releaseAt: 'asc' },
  });
  if (!drop) {
    return sendJson(res, 409, { error: 'This drop is not currently live.' });
  }

  let reserved;
  try {
    reserved = await reserveUnitsForDrop(drop.id, quantity);
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return sendJson(res, 409, {
        error:
          err.available > 0
            ? `Only ${err.available} unit(s) left in this drop.`
            : 'This drop is sold out.',
      });
    }
    console.error('[create-checkout-session] Reservation failed:', err);
    return sendJson(res, 500, { error: 'Unable to reserve stock. Please try again.' });
  }

  const unitIds = reserved.map((u) => u.id);
  const origin = getSiteOrigin(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: product.currency.toLowerCase(),
            product_data: {
              name: product.name,
              description: product.tagline || undefined,
            },
            unit_amount: product.basePriceCents,
          },
          quantity,
        },
      ],
      customer_email: email,
      shipping_address_collection: { allowed_countries: ['AU'] },
      expires_at: Math.floor(Date.now() / 1000) + SESSION_HOLD_SECONDS,
      success_url: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/order/cancelled`,
      metadata: {
        productId: product.id,
        productSlug: product.slug,
        dropId: drop.id,
        unitIds: JSON.stringify(unitIds),
        quantity: String(quantity),
      },
    });

    return sendJson(res, 200, { url: session.url });
  } catch (err) {
    // The Checkout Session was never created (or Stripe rejected it) — the
    // units we just locked would otherwise sit RESERVED forever. Put them
    // straight back into IN_STOCK rather than waiting on the 30-minute
    // `checkout.session.expired` webhook, since that event will never fire
    // for a session that doesn't exist.
    await releaseUnits(unitIds).catch((releaseErr) => {
      console.error('[create-checkout-session] Failed to release units after Stripe error:', releaseErr);
    });
    console.error('[create-checkout-session] Stripe session creation failed:', err);
    return sendJson(res, 500, { error: 'Unable to start checkout. Please try again.' });
  }
}
