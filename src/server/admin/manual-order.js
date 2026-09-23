// api/admin/manual-order.js
// POST -> record a sale that didn't go through Stripe Checkout at all — a
// cash sale, a bank transfer, a comp'd/giveaway kit (e.g. a workshop prize),
// or a custom commission. Gets the same expected-ship-date tracking as a
// real Stripe order.
//
// `type` changes what actually happens, not just a label:
//   DROP_SALE / WORKSHOP — still a real numbered kit from the live drop, so
//     this reserves + sells an actual Unit row (same locking logic as a real
//     checkout — see src/lib/inventory.js) exactly like before. The two
//     differ only in the internalNote tag they leave for reporting.
//   COMMISSION / OTHER — a custom, one-off, or otherwise non-catalog sale
//     that was never part of a numbered drop at all. No drop lookup, no
//     Unit reserved — OrderItem.unitId is left null (the schema already
//     allows this — see the "assigned specific passport unit once paid"
//     comment on OrderItem.unitId), so it can't accidentally consume real
//     numbered stock that doesn't apply to it.
//
// Deliberately admin-only and deliberately simple: there's exactly one
// product/SKU right now, so nothing here needs a product/slug picker —
// `type` covers "what kind of sale is this", which is the distinction that
// was actually missing.
//
// Delivery fee: resolved from the same postcode-based zones real checkout
// uses (src/lib/deliveryZones.js) whenever a postcode is given and the
// method is SELF_DELIVERY/AUSPOST — so this stops silently charging $0 for
// shipping. `deliveryFeeOverrideCents` always wins when set, which is the
// escape hatch for anything the flat zone rate doesn't cover (an
// oversized/heavier commission piece, a rate you've agreed with the
// customer directly, etc.) — there's no size/weight dimension anywhere in
// the schema yet, so this is a manual override rather than a real tiered
// rate table.
//
// Shipping address: optional — filling in line1/suburb/state/postcode
// creates a real Address row linked to the order, same as a Stripe
// checkout would, so it shows up in the order detail panel and (if
// sendEmail is on) in the confirmation email's "Shipping to" line.
//
// Expected ship date: auto-computed from today (see src/lib/shipping.js)
// unless expectedShipAtOverride is set — useful for a commission that's
// agreed to take longer than the standard estimate. Always floored at
// MIN_PRODUCTION_DAYS business days out, same floor used when editing an
// existing order's date from the order detail panel.
//
// Customer email: off by default (sendEmail: false) — most manual orders
// (a cash sale at a market, a straightforward giveaway) don't need one.
// When on, emailMessage/emailSignatureName/emailSignatureRole let the
// admin write a fully custom note + sign-off instead of the standard
// "made to order" confirmation copy (see emailTemplate.js's
// orderConfirmationEmail `message` param).

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';
import { reserveUnitsForDrop, releaseUnits, markUnitsSold, InsufficientStockError } from '../../lib/inventory.js';
import { computeExpectedShipDate, addBusinessDays, MIN_PRODUCTION_DAYS, deliveryMethodLabel } from '../../lib/shipping.js';
import { generateOrderNumber } from '../../lib/orderNumber.js';
import { resolveDeliveryZone, OutOfDeliveryAreaError } from '../../lib/deliveryZones.js';
import { sign } from '../../lib/signedToken.js';
import { getSiteOrigin } from '../../lib/siteOrigin.js';
import { orderConfirmationEmail } from '../../lib/emailTemplate.js';

const ORDER_LOOKUP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Best-effort — logs and returns false rather than throwing, so a Resend
 * hiccup never stops the order itself from being created. Only called when
 * the admin explicitly checked "email the customer" on the form; most
 * manual orders (a cash sale at a market, a straightforward giveaway) don't
 * send one at all.
 */
async function sendManualOrderEmail({ email, orderId, orderNumber, totalCents, currency, items, deliveryMethodLabel: methodLabel, deliveryFeeCents, deliveryAddress, message, signatureName, signatureRole }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[admin/manual-order] Dev/mock order email:', { email, orderNumber });
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';
    const lookupToken = sign({ kind: 'order-lookup', orderId }, ORDER_LOOKUP_TOKEN_TTL_SECONDS);
    const lookupLink = `${getSiteOrigin()}/order/lookup?token=${encodeURIComponent(lookupToken)}`;
    const { html, text } = orderConfirmationEmail({
      orderNumber,
      totalCents,
      currency,
      lookupLink,
      items,
      deliveryMethodLabel: methodLabel,
      deliveryFeeCents,
      deliveryAddress,
      message,
      signatureName,
      signatureRole,
    });
    const result = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `Your Unstitch order ${orderNumber} is confirmed`,
      html,
      text,
    });
    if (result.error) {
      console.warn('[admin/manual-order] Order email failed to send:', result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[admin/manual-order] Order email threw:', err);
    return false;
  }
}

const SLUG = 'slow-bloom';

// Types that draw a real numbered unit from the live drop vs. types that
// don't. Kept as a plain code constant (not a schema enum) so this ships
// with a normal file sync/git push, no separate DB migration needed.
const NUMBERED_STOCK_TYPES = new Set(['DROP_SALE', 'WORKSHOP']);

// Shown as a tag on internalNote so the type is visible in the admin order
// list/detail without adding a new column (the Order model has no `type`
// or `deliveryMethod` field — tagging the note avoids a schema migration,
// which nothing in this session's sandboxed shells can run anyway; see the
// project doc for why `npx prisma generate`/`db push` has to happen in the
// user's own terminal).
const TYPE_NOTE_TAGS = {
  DROP_SALE: '[Drop sale]',
  WORKSHOP: '[Workshop]',
  COMMISSION: '[Commission]',
  OTHER: '[Other]',
};

// Same idea for delivery method — chosen in the form but otherwise only
// ever used transiently to compute expectedShipAt, then discarded. Tagging
// it here is what makes "which delivery method did I pick for this order"
// answerable from the order detail panel. NONE isn't tagged — there's
// nothing informative to show when no method was chosen.
const DELIVERY_METHOD_TAGS = {
  SELF_DELIVERY: '[Self-delivery]',
  AUSPOST: '[Australia Post]',
  PICKUP: '[Pickup]',
};

const ManualOrderSchema = z.object({
  email: z.string().email('Enter a valid email'),
  name: z.string().trim().max(200).optional(),
  type: z.enum(['DROP_SALE', 'WORKSHOP', 'COMMISSION', 'OTHER']).default('DROP_SALE'),
  quantity: z.number().int().min(1).max(20),
  // Overrides the product's current retail price for this order only (e.g.
  // $0 for a genuine giveaway, or a custom commission price). Leave unset
  // to charge the normal price.
  unitPriceCents: z.number().int().min(0).optional(),
  deliveryMethod: z.enum(['NONE', 'SELF_DELIVERY', 'AUSPOST', 'PICKUP']).optional().default('NONE'),
  // Used to resolve the real delivery fee for SELF_DELIVERY/AUSPOST (see
  // above) — optional because PICKUP/NONE don't need one, and because an
  // admin can always fall back to deliveryFeeOverrideCents if they'd rather
  // not look up a postcode for a quick cash sale.
  postcode: z.string().trim().max(10).optional(),
  // Always wins over the resolved zone fee when set (including 0, to
  // explicitly waive delivery). Leave unset to use the resolved/zero fee.
  deliveryFeeOverrideCents: z.number().int().min(0).optional(),
  // Full shipping address — all optional, but when line1/suburb/state are
  // given alongside postcode an Address row is created and linked to the
  // order (same shape a real Stripe checkout produces), so the order detail
  // panel and the confirmation email can both show where it's actually
  // going. A manual order with only a postcode (no full address) still gets
  // its delivery fee resolved as before, just with nothing to ship to yet.
  recipientName: z.string().trim().max(200).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  suburb: z.string().trim().max(120).optional(),
  state: z.string().trim().max(10).optional(),
  note: z.string().trim().max(500).optional(),
  // Most manual orders (cash sale, bank transfer already received) are
  // paid the moment they're entered — that's the default. A commission or
  // workshop booking is often just a quote at this point: set this to
  // UNPAID to record it as PENDING_PAYMENT with no Payment row, then use
  // the "Mark as paid" action on the order once payment actually arrives.
  paymentStatus: z.enum(['PAID', 'UNPAID']).default('PAID'),
  // Leave unset to auto-compute from today + the studio's production time
  // (src/lib/shipping.js). Set to override for a specific order (e.g. a
  // commission that'll genuinely take longer) — still floored at
  // MIN_PRODUCTION_DAYS business days from today, same as editing an
  // existing order's date from the order detail panel.
  expectedShipAtOverride: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD form.')
    .optional(),
  // When true, sends the customer a branded order-confirmation-style email
  // on creation — off by default, since plenty of manual orders (a cash
  // sale at a market, a straightforward giveaway) don't need one at all.
  sendEmail: z.boolean().optional().default(false),
  // Optional — replaces the default "made to order" paragraph with this
  // text (e.g. commission-specific details). Falls back to the standard
  // copy when sendEmail is on but this is left blank.
  emailMessage: z.string().trim().max(10000).optional(),
  emailSignatureName: z.string().trim().max(100).optional(),
  emailSignatureRole: z.string().trim().max(150).optional(),
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const body = parseRequestBody(req);
  const parseResult = ManualOrderSchema.safeParse(body);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
  }
  const {
    email,
    name,
    type,
    quantity,
    unitPriceCents: unitPriceOverride,
    deliveryMethod,
    postcode,
    deliveryFeeOverrideCents,
    recipientName,
    addressLine1,
    addressLine2,
    suburb,
    state,
    note,
    paymentStatus,
    expectedShipAtOverride,
    sendEmail,
    emailMessage,
    emailSignatureName,
    emailSignatureRole,
  } = parseResult.data;
  const needsNumberedStock = NUMBERED_STOCK_TYPES.has(type);
  const hasFullAddress = !!(addressLine1 && suburb && state && postcode);

  let resolvedShipDate = null;
  if (expectedShipAtOverride) {
    const candidate = new Date(`${expectedShipAtOverride}T12:00:00`);
    if (Number.isNaN(candidate.getTime())) {
      return sendJson(res, 400, { error: 'Invalid expected ship date.' });
    }
    const minDate = addBusinessDays(new Date(), MIN_PRODUCTION_DAYS);
    if (candidate.getTime() < minDate.getTime()) {
      return sendJson(res, 400, {
        error: `Expected ship date must be at least ${MIN_PRODUCTION_DAYS} business days out (${minDate.toLocaleDateString('en-AU')} or later).`,
      });
    }
    resolvedShipDate = candidate;
  }

  const product = await prisma.product.findUnique({ where: { slug: SLUG } });
  if (!product || !product.isActive) {
    return sendJson(res, 404, { error: 'Product not available.' });
  }

  // Only DROP_SALE/WORKSHOP touch the live drop's real numbered units — a
  // COMMISSION or OTHER sale isn't part of any drop, so it's fine (and
  // correct) to record one even with no drop currently live.
  let unitIds = [];
  if (needsNumberedStock) {
    const drop = await prisma.drop.findFirst({
      where: { productId: product.id, status: 'LIVE' },
      orderBy: { releaseAt: 'asc' },
    });
    if (!drop) {
      return sendJson(res, 409, { error: 'No drop is currently live to sell units from.' });
    }

    let reserved;
    try {
      reserved = await reserveUnitsForDrop(drop.id, quantity);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return sendJson(res, 409, {
          error: err.available > 0 ? `Only ${err.available} unit(s) left in this drop.` : 'This drop is sold out.',
        });
      }
      console.error('[admin/manual-order] Reservation failed:', err);
      return sendJson(res, 500, { error: 'Unable to reserve stock. Please try again.' });
    }
    unitIds = reserved.map((u) => u.id);
  }

  // Resolve the real delivery fee from the same zones real checkout uses,
  // when there's a postcode to look one up by. Deliberately best-effort:
  // an unresolvable/out-of-area postcode just leaves the fee at 0 rather
  // than blocking order creation — a manual order is being entered by a
  // human who can see the error and use deliveryFeeOverrideCents instead.
  let resolvedZone = null;
  if (postcode && (deliveryMethod === 'SELF_DELIVERY' || deliveryMethod === 'AUSPOST')) {
    try {
      resolvedZone = await resolveDeliveryZone(prisma, postcode);
    } catch (err) {
      if (!(err instanceof OutOfDeliveryAreaError)) {
        console.error('[admin/manual-order] Delivery zone lookup failed:', err);
      }
      // OutOfDeliveryAreaError and "no matching zone configured" both just
      // fall through with resolvedZone left null.
    }
  }
  const deliveryFeeCents = deliveryFeeOverrideCents ?? resolvedZone?.feeCents ?? 0;

  try {
    const unitPriceCents = unitPriceOverride ?? product.basePriceCents;
    const subtotalCents = unitPriceCents * quantity;
    const grandTotalCents = subtotalCents + deliveryFeeCents;
    const idempotencyKey = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const expectedShipAt = resolvedShipDate || computeExpectedShipDate(new Date(), deliveryMethod === 'NONE' ? null : deliveryMethod);
    const tag = TYPE_NOTE_TAGS[type];
    const deliveryTag = DELIVERY_METHOD_TAGS[deliveryMethod];
    const feeNote = deliveryFeeCents > 0 ? `(delivery $${(deliveryFeeCents / 100).toFixed(2)})` : null;
    const internalNote = [tag, deliveryTag, feeNote, note].filter(Boolean).join(' ') || null;

    const order = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { email },
        update: { name: name || undefined },
        create: { email, name: name || null },
      });

      let deliveryAddressId = null;
      if (hasFullAddress) {
        const address = await tx.address.create({
          data: {
            customerId: customer.id,
            recipientName: recipientName || name || email,
            line1: addressLine1,
            line2: addressLine2 || null,
            suburb,
            state,
            postcode,
            country: 'AU',
          },
        });
        deliveryAddressId = address.id;
      }

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: customer.id,
          channel: 'IN_PERSON',
          status: paymentStatus === 'PAID' ? 'PAID' : 'PENDING_PAYMENT',
          subtotalCents,
          deliveryFeeCents,
          deliveryAddressId,
          deliveryZoneId: resolvedZone?.id,
          totalCents: grandTotalCents,
          currency: product.currency,
          expectedShipAt,
          internalNote,
          idempotencyKey,
        },
      });

      if (needsNumberedStock) {
        // One row per numbered unit, same as a real checkout — each row
        // carries the specific serial that was sold. Units are marked SOLD
        // here regardless of paymentStatus: an unpaid quote still commits
        // this exact physical piece to this customer (so it can't be
        // double-booked and won't get swept up by the "release stuck
        // reservations" 30-minute cleanup) even though the order itself
        // stays PENDING_PAYMENT until "Mark as paid" is used.
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
      } else {
        // COMMISSION/OTHER: a single aggregate line, no unit to assign —
        // unitId stays null (the schema supports this — see the comment on
        // OrderItem.unitId) so this can never be confused with real
        // numbered stock in inventory counts.
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: product.id,
            unitId: null,
            quantity,
            unitPriceCents,
            lineTotalCents: subtotalCents,
          },
        });
      }

      // Only record a Payment row once money has actually changed hands —
      // an UNPAID quote has none yet (see "Mark as paid" in
      // api/admin/orders.js for when it does). Charged amount includes the
      // delivery fee, matching what the order's own totalCents now reflects.
      if (paymentStatus === 'PAID') {
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: 'MANUAL',
            providerPaymentId: idempotencyKey,
            status: 'SUCCEEDED',
            amountCents: grandTotalCents,
            currency: product.currency,
          },
        });
      }

      return order;
    });

    let emailSent = false;
    if (sendEmail) {
      emailSent = await sendManualOrderEmail({
        email,
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalCents: grandTotalCents,
        currency: product.currency,
        items: [{ name: product.name, quantity }],
        deliveryMethodLabel: deliveryMethodLabel(deliveryMethod === 'NONE' ? null : deliveryMethod),
        deliveryFeeCents,
        deliveryAddress: hasFullAddress
          ? { line1: addressLine1, line2: addressLine2 || null, suburb, state, postcode }
          : null,
        message: emailMessage,
        signatureName: emailSignatureName,
        signatureRole: emailSignatureRole,
      });
    }

    return sendJson(res, 200, { order, emailSent });
  } catch (err) {
    // Something failed after the units were locked (RESERVED) — put them
    // back rather than leaving them stuck, same as create-checkout-session.js.
    // A no-op for COMMISSION/OTHER, which never reserved anything.
    if (unitIds.length > 0) {
      await releaseUnits(unitIds).catch((releaseErr) => {
        console.error('[admin/manual-order] Failed to release units after error:', releaseErr);
      });
    }
    console.error('[admin/manual-order] Order creation failed:', err);
    return sendJson(res, 500, { error: 'Failed to create order.' });
  }
}
