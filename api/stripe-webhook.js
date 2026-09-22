// api/stripe-webhook.js
// Vercel Serverless Function — the authoritative source of truth for order
// state. Stripe Checkout only tells the customer's browser "it worked"; this
// webhook is what actually marks an order PAID and flips units to SOLD (or
// releases them back to stock if the customer never completes payment).
//
// IMPORTANT — raw body handling: Stripe's signature verification
// (`stripe.webhooks.constructEvent`) needs the exact, unparsed request
// bytes. Vercel's classic `(req, res)` Node function helpers auto-parse
// `req.body` for `application/json` requests, which would corrupt the byte
// string needed here. We deliberately never touch `req.body` in this file —
// instead we read the raw stream ourselves via `getRawBody()` below, which
// also transparently supports the local `astro dev` middleware (see
// `astro.config.mjs`), which stashes the unparsed bytes on `req.rawBody`
// for this one route instead of JSON-parsing them.

import prisma from '../src/lib/prisma.js';
import stripe from '../src/lib/stripe.js';
import { releaseUnits, markUnitsSold } from '../src/lib/inventory.js';
import { sendJson } from '../src/lib/apiHelper.js';
import { sign } from '../src/lib/signedToken.js';
import { getSiteOrigin } from '../src/lib/siteOrigin.js';
import { computeExpectedShipDate, deliveryMethodLabel } from '../src/lib/shipping.js';
import { generateOrderNumber } from '../src/lib/orderNumber.js';
import { resolveDeliveryZone, OutOfDeliveryAreaError } from '../src/lib/deliveryZones.js';
import { orderConfirmationEmail } from '../src/lib/emailTemplate.js';

// How long an order's magic link (mailed in the confirmation email) stays
// valid — matches the link issued by api/order-lookup-request.js so both
// paths into api/order-lookup.js behave consistently.
const ORDER_LOOKUP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** @param {any} req @returns {Promise<Buffer>} */
function getRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody);
  if (typeof req.rawBody === 'string') return Promise.resolve(Buffer.from(req.rawBody));
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (/** @type {Buffer} */ chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function sendOrderConfirmationEmail({
  email,
  orderId,
  orderNumber,
  totalCents,
  currency,
  items,
  deliveryMethodLabel: methodLabel,
  deliveryFeeCents,
  deliveryAddress,
}) {
  // Every order gets a magic link back to its own status page — no
  // account/password needed (see api/order-lookup.js). Reuses the same
  // signed-token format as api/order-lookup-request.js's email-based flow.
  const lookupToken = sign({ kind: 'order-lookup', orderId }, ORDER_LOOKUP_TOKEN_TTL_SECONDS);
  const lookupLink = `${getSiteOrigin()}/order/lookup?token=${encodeURIComponent(lookupToken)}`;

  if (!process.env.RESEND_API_KEY) {
    console.log('[stripe-webhook] Dev/mock order confirmation email:', { email, orderNumber, lookupLink });
    return;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';

    const { html, text } = orderConfirmationEmail({
      orderNumber,
      totalCents,
      currency,
      lookupLink,
      items,
      deliveryMethodLabel: methodLabel,
      deliveryFeeCents,
      deliveryAddress,
    });

    const send = (from) =>
      resend.emails.send({
        from,
        to: email,
        subject: `Your Unstitch order ${orderNumber} is confirmed`,
        html,
        text,
      });

    let result = await send(fromEmail);
    if (
      result.error &&
      (result.error.message?.toLowerCase().includes('not verified') ||
        result.error.statusCode === 403 ||
        result.error.name === 'validation_error')
    ) {
      result = await send('Unstitch Studio <onboarding@resend.dev>');
    }
    if (result.error) {
      console.warn('[stripe-webhook] Order confirmation email failed to send:', result.error);
    }
  } catch (err) {
    console.warn('[stripe-webhook] Order confirmation email threw:', err);
  }
}

/**
 * Handles `checkout.session.completed` — payment succeeded. Creates the
 * Customer (find-or-create by email), the Order + OrderItems (one per
 * reserved unit, matching the schema's one-unit-per-OrderItem shape via the
 * unique `OrderItem.unitId`), and the Payment record, then flips the
 * reserved Units to SOLD. Idempotent on `Payment.providerPaymentId`, so a
 * Stripe retry of the same event is a safe no-op.
 */
async function handleCheckoutCompleted(session) {
  const metadata = session.metadata || {};
  const unitIds = metadata.unitIds ? JSON.parse(metadata.unitIds) : [];
  const productId = metadata.productId;
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

  if (!paymentIntentId) {
    console.error('[stripe-webhook] checkout.session.completed with no payment_intent id, session:', session.id);
    return;
  }

  // Idempotency guard: if we've already recorded this PaymentIntent, this is
  // a Stripe webhook retry (or a race with another delivery) — do nothing.
  const existingPayment = await prisma.payment.findUnique({ where: { providerPaymentId: paymentIntentId } });
  if (existingPayment) {
    console.log('[stripe-webhook] Payment already recorded, skipping:', paymentIntentId);
    return;
  }

  const customerDetails = session.customer_details;
  const email = customerDetails?.email || session.customer_email;
  if (!email) {
    console.error('[stripe-webhook] checkout.session.completed with no customer email, session:', session.id);
    return;
  }

  const shipping = session.collected_information?.shipping_details;
  const totalCents = session.amount_total ?? 0;
  const currency = (session.currency || 'aud').toUpperCase();
  // Set by create-checkout-session.js from the postcode-resolved zone (see
  // src/lib/deliveryZones.js). amount_total already includes this fee —
  // subtotalCents below backs it back out so the two numbers add up.
  const deliveryFeeCents = metadata.deliveryFeeCents ? parseInt(metadata.deliveryFeeCents, 10) : 0;
  const deliveryZoneId = metadata.deliveryZoneId || null;
  const subtotalCents = totalCents - deliveryFeeCents;

  // The zone's `method` (SELF_DELIVERY/AUSPOST/PICKUP) drives the expected
  // ship date (see src/lib/shipping.js); fall back to a conservative default
  // if the zone can't be looked up for some reason rather than leaving the
  // order with no estimate at all.
  const deliveryZoneRow = deliveryZoneId
    ? await prisma.deliveryZone.findUnique({ where: { id: deliveryZoneId }, select: { method: true } })
    : null;
  const createdAt = new Date();
  const expectedShipAt = computeExpectedShipDate(createdAt, deliveryZoneRow?.method);

  // Stripe's own hosted page collects a full shipping address *after* the
  // delivery fee was already locked in from the postcode entered in the
  // cart (see src/lib/deliveryZones.js and create-checkout-session.js). If
  // the customer typed a different postcode here — enough to land in a
  // different zone, or even outside Victoria entirely — this order was
  // priced (and validated) against the wrong address. Rather than silently
  // shipping it or blocking the webhook, flag it for a human to check.
  let postcodeMismatchNote = null;
  const shippingPostcode = shipping?.address?.postal_code;
  if (shippingPostcode) {
    try {
      const actualZone = await resolveDeliveryZone(prisma, shippingPostcode);
      if (!actualZone || actualZone.id !== deliveryZoneId) {
        postcodeMismatchNote = `⚠️ Shipping address postcode (${shippingPostcode}) entered on Stripe doesn't match the zone this order was priced/quoted for — check the delivery fee before shipping.`;
      }
    } catch (err) {
      if (err instanceof OutOfDeliveryAreaError) {
        postcodeMismatchNote = `⚠️ Shipping address postcode (${shippingPostcode}) is outside Victoria — this order may need a refund or manual arrangement rather than standard shipping.`;
      } else {
        console.error('[stripe-webhook] Failed to re-check delivery zone for shipping postcode:', err);
      }
    }
  }

  // Captured inside the transaction below (product name isn't known until
  // then) so the confirmation email can show an item breakdown.
  let orderItemsForEmail = [];

  const order = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { email },
      update: { name: customerDetails?.name || undefined },
      create: { email, name: customerDetails?.name || null },
    });

    let deliveryAddressId = null;
    if (shipping?.address) {
      const address = await tx.address.create({
        data: {
          customerId: customer.id,
          recipientName: shipping.name || customerDetails?.name || 'Unknown',
          line1: shipping.address.line1 || '',
          line2: shipping.address.line2 || null,
          suburb: shipping.address.city || '',
          state: shipping.address.state || '',
          postcode: shipping.address.postal_code || '',
          country: shipping.address.country || 'AU',
        },
      });
      deliveryAddressId = address.id;
    }

    const order = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerId: customer.id,
        channel: 'ONLINE',
        status: 'PAID',
        subtotalCents,
        deliveryFeeCents,
        totalCents,
        currency,
        deliveryAddressId,
        deliveryZoneId,
        expectedShipAt,
        internalNote: postcodeMismatchNote,
        idempotencyKey: session.id,
      },
    });

    if (productId && unitIds.length > 0) {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (product) {
        orderItemsForEmail = [{ name: product.name, quantity: unitIds.length }];
        const unitPriceCents = Math.round(totalCents / unitIds.length);
        for (const unitId of unitIds) {
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: product.id,
              unitId,
              quantity: 1,
              unitPriceCents,
              lineTotalCents: unitPriceCents,
            },
          });
        }
        await markUnitsSold(tx, unitIds, customer.id);
      }
    }

    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: 'STRIPE',
        providerPaymentId: paymentIntentId,
        status: 'SUCCEEDED',
        amountCents: totalCents,
        currency,
        rawPayload: session,
      },
    });

    return order;
  });

  await sendOrderConfirmationEmail({
    email,
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalCents,
    currency,
    items: orderItemsForEmail,
    deliveryMethodLabel: deliveryMethodLabel(deliveryZoneRow?.method),
    deliveryFeeCents,
    deliveryAddress: shipping?.address
      ? {
          line1: shipping.address.line1 || '',
          line2: shipping.address.line2 || null,
          suburb: shipping.address.city || '',
          state: shipping.address.state || '',
          postcode: shipping.address.postal_code || '',
        }
      : null,
  }).catch(() => {});
}

/**
 * Handles `checkout.session.expired` — the customer never completed
 * payment within the hold window. Releases the reserved units back to
 * IN_STOCK so they can be sold to someone else.
 */
async function handleCheckoutExpired(session) {
  const metadata = session.metadata || {};
  const unitIds = metadata.unitIds ? JSON.parse(metadata.unitIds) : [];
  if (unitIds.length === 0) return;
  await releaseUnits(unitIds);
  console.log(`[stripe-webhook] Released ${unitIds.length} unit(s) from expired session ${session.id}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!stripe) {
    console.error('[stripe-webhook] Stripe is not configured (missing STRIPE_SECRET_KEY).');
    return sendJson(res, 503, { error: 'Not configured' });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set.');
    return sendJson(res, 503, { error: 'Not configured' });
  }
  if (!prisma) {
    console.error('[stripe-webhook] Prisma is not configured (missing DATABASE_URL).');
    return sendJson(res, 503, { error: 'Not configured' });
  }

  const signature = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err instanceof Error ? err.message : err);
    return sendJson(res, 400, { error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object);
        break;
      default:
        // Unhandled event types are fine to ignore — Stripe considers a
        // 2xx response "delivered" regardless of whether we acted on it.
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err);
    // Return 500 so Stripe retries — the DB write may be transiently down.
    return sendJson(res, 500, { error: 'Webhook handler error' });
  }

  return sendJson(res, 200, { received: true });
}
