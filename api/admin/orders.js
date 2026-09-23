// api/admin/orders.js
// GET  /api/admin/orders                -> recent orders, summarized
// GET  /api/admin/orders?id=<uuid>      -> one order, full detail (for the
//                                          "resend confirmation" action and
//                                          for just seeing what a customer
//                                          bought)
// POST /api/admin/orders {orderId,      -> "mark as shipped": sets
//   action:'mark-shipped'}                 shippedAt=now() and, if the order
//                                          hasn't moved past PAID yet, bumps
//                                          status to OUT_FOR_DELIVERY. Manual
//                                          click for now — see the project
//                                          doc for why this isn't automated
//                                          against Australia Post yet. Also
//                                          best-effort sends the customer a
//                                          "your order has shipped" email —
//                                          a failure here never blocks the
//                                          shipped status itself from being
//                                          recorded, it just comes back as
//                                          emailSent: false in the response.
// POST /api/admin/orders {orderId,      -> "mark as paid": moves a manual
//   action:'mark-paid'}                    order out of PENDING_PAYMENT
//                                          (see api/admin/manual-order.js's
//                                          UNPAID/quote option) to PAID and
//                                          records the Payment row that
//                                          wasn't created at quote time.
//                                          Only valid from PENDING_PAYMENT —
//                                          a real Stripe order is already
//                                          PAID via the webhook, never this.
// POST /api/admin/orders {orderId,      -> "delete test order": permanently
//   action:'delete-test-order'}            deletes the order (and its items/
//                                          payments) and reverts any real
//                                          numbered units it sold back to
//                                          IN_STOCK with ownership cleared —
//                                          i.e. undoes the sale entirely,
//                                          as opposed to "void" (inventory.js),
//                                          which marks a physically-damaged
//                                          unit unsellable but keeps its
//                                          sale history. For cleaning up
//                                          orders created while testing the
//                                          admin panel, not for real orders.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../src/lib/apiHelper.js';
import { requireAdmin } from '../../src/lib/adminAuth.js';
import prisma from '../../src/lib/prisma.js';
import { sign } from '../../src/lib/signedToken.js';
import { getSiteOrigin } from '../../src/lib/siteOrigin.js';
import { orderShippedEmail } from '../../src/lib/emailTemplate.js';
import { addBusinessDays, MIN_PRODUCTION_DAYS } from '../../src/lib/shipping.js';
import { revertUnitsToStock } from '../../src/lib/inventory.js';

// Matches api/stripe-webhook.js / api/admin/send-email.js, so the "shipped"
// email's tracking link behaves the same as the original confirmation's.
const ORDER_LOOKUP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Best-effort — logs and returns false rather than throwing, so a Resend
 * hiccup never stops "mark as shipped" from recording the shipped status. */
async function sendShippedEmail({ orderId, orderNumber, email }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[admin/orders] Dev/mock shipped email:', { orderId, orderNumber, email });
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';
    const lookupToken = sign({ kind: 'order-lookup', orderId }, ORDER_LOOKUP_TOKEN_TTL_SECONDS);
    const lookupLink = `${getSiteOrigin()}/order/lookup?token=${encodeURIComponent(lookupToken)}`;
    const { html, text } = orderShippedEmail({ orderNumber, lookupLink });
    const result = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `Your Unstitch order ${orderNumber} has shipped`,
      html,
      text,
    });
    if (result.error) {
      console.warn('[admin/orders] Shipped email failed to send:', result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[admin/orders] Shipped email threw:', err);
    return false;
  }
}

const MarkShippedSchema = z.object({
  action: z.literal('mark-shipped'),
  orderId: z.string().uuid(),
});

const MarkPaidSchema = z.object({
  action: z.literal('mark-paid'),
  orderId: z.string().uuid(),
});

const DeleteTestOrderSchema = z.object({
  action: z.literal('delete-test-order'),
  orderId: z.string().uuid(),
});

const UpdateShipDateSchema = z.object({
  action: z.literal('update-ship-date'),
  orderId: z.string().uuid(),
  // A plain "YYYY-MM-DD" from a <input type="date">, not a full ISO
  // timestamp — parsed against noon below so timezone rounding can't push
  // it to the wrong calendar day.
  expectedShipAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD form.'),
});

// "Edit order details" from the order detail panel: lets an admin fix a
// mistyped delivery address or add/change the internal note after the
// order was already placed (unlike the manual-order form, which only sets
// these at creation time). Every field is optional/blank-tolerant on the
// wire — the frontend always sends all of them together (trimmed, "" for
// empty), and this only touches the address if at least one address field
// is non-empty; sending every address field blank clears nothing on
// purpose, since accidentally wiping a real customer's address is worse
// than a no-op. To actually remove an address entirely, an admin would
// need a dedicated "clear address" control, which doesn't exist yet.
const UpdateOrderDetailsSchema = z.object({
  action: z.literal('update-order-details'),
  orderId: z.string().uuid(),
  recipientName: z.string().trim().max(200).optional().default(''),
  addressLine1: z.string().trim().max(200).optional().default(''),
  addressLine2: z.string().trim().max(200).optional().default(''),
  suburb: z.string().trim().max(120).optional().default(''),
  state: z.string().trim().max(10).optional().default(''),
  postcode: z.string().trim().max(10).optional().default(''),
  internalNote: z.string().trim().max(500).optional().default(''),
});

export default async function handler(req, res) {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const body = parseRequestBody(req);

    if (body.action === 'mark-paid') {
      const parseResult = MarkPaidSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      try {
        const existing = await prisma.order.findUnique({ where: { id: parseResult.data.orderId } });
        if (!existing) return sendJson(res, 404, { error: 'Order not found.' });
        if (existing.status !== 'PENDING_PAYMENT') {
          return sendJson(res, 400, { error: `This order is already ${existing.status}, not awaiting payment.` });
        }
        const [order] = await prisma.$transaction([
          // `customer` is included so the admin panel can patch this order's
          // table row in place (see patchOrderRow in admin/index.astro)
          // instead of refetching and rebuilding the entire orders list.
          prisma.order.update({
            where: { id: existing.id },
            data: { status: 'PAID' },
            include: { customer: { select: { email: true, name: true } } },
          }),
          prisma.payment.create({
            data: {
              orderId: existing.id,
              provider: 'MANUAL',
              providerPaymentId: `MANUAL-PAID-${Date.now()}`,
              status: 'SUCCEEDED',
              amountCents: existing.totalCents,
              currency: existing.currency,
            },
          }),
        ]);
        return sendJson(res, 200, { order });
      } catch (err) {
        console.error('[admin/orders] Mark-paid failed:', err);
        return sendJson(res, 500, { error: 'Failed to mark as paid.' });
      }
    }

    if (body.action === 'delete-test-order') {
      const parseResult = DeleteTestOrderSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      try {
        const existing = await prisma.order.findUnique({
          where: { id: parseResult.data.orderId },
          include: { items: { include: { unit: { select: { id: true, dropId: true } } } } },
        });
        if (!existing) return sendJson(res, 404, { error: 'Order not found.' });

        const unitIds = existing.items.filter((it) => it.unitId).map((it) => it.unitId);
        const dropIds = [...new Set(existing.items.filter((it) => it.unit).map((it) => it.unit.dropId))];

        await prisma.$transaction(async (tx) => {
          await revertUnitsToStock(tx, unitIds);
          // Delete everything else that has a foreign key pointing at this
          // order before the order row itself — Prisma's default is
          // onDelete: Restrict, so any of these left behind (a review left
          // on a since-"shipped" test order, a refund recorded against its
          // payment, a giving-ledger entry) would otherwise make
          // tx.order.delete() below fail with a foreign-key violation. A
          // real customer order rarely has these, but a test order that
          // was clicked through the full flow (shipped, reviewed, refunded
          // while testing) can.
          await tx.refund.deleteMany({ where: { payment: { orderId: existing.id } } });
          await tx.review.deleteMany({ where: { orderId: existing.id } });
          await tx.givingLedgerEntry.deleteMany({ where: { orderId: existing.id } });
          await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
          await tx.payment.deleteMany({ where: { orderId: existing.id } });
          await tx.order.delete({ where: { id: existing.id } });

          // If deleting this order's sale brought a sold-out drop back
          // into stock, reflect that immediately rather than leaving it
          // showing SOLD_OUT with units actually sitting IN_STOCK.
          for (const dropId of dropIds) {
            const drop = await tx.drop.findUnique({ where: { id: dropId } });
            if (drop?.status === 'SOLD_OUT') {
              const inStockCount = await tx.unit.count({ where: { dropId, status: 'IN_STOCK' } });
              if (inStockCount > 0) {
                await tx.drop.update({ where: { id: dropId }, data: { status: 'LIVE' } });
              }
            }
          }
        });

        return sendJson(res, 200, { deleted: true, unitsReverted: unitIds.length });
      } catch (err) {
        console.error('[admin/orders] Delete-test-order failed:', err);
        return sendJson(res, 500, { error: 'Failed to delete order.' });
      }
    }

    if (body.action === 'update-ship-date') {
      const parseResult = UpdateShipDateSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      try {
        const existing = await prisma.order.findUnique({ where: { id: parseResult.data.orderId } });
        if (!existing) return sendJson(res, 404, { error: 'Order not found.' });

        const candidate = new Date(`${parseResult.data.expectedShipAt}T12:00:00`);
        if (Number.isNaN(candidate.getTime())) {
          return sendJson(res, 400, { error: 'Invalid date.' });
        }
        // Every kit is made to order — this floor is the studio's own
        // minimum turnaround, so an admin can push the date out (a
        // commission running long) but never promise something sooner
        // than can actually be built.
        const minDate = addBusinessDays(existing.createdAt, MIN_PRODUCTION_DAYS);
        if (candidate.getTime() < minDate.getTime()) {
          return sendJson(res, 400, {
            error: `Ship date must be at least ${MIN_PRODUCTION_DAYS} business days from the order date (${minDate.toLocaleDateString('en-AU')} or later).`,
          });
        }
        // `customer` included for the same reason as mark-paid above — lets
        // the admin panel patch the order row in place rather than
        // refetching the whole list.
        const order = await prisma.order.update({
          where: { id: existing.id },
          data: { expectedShipAt: candidate },
          include: { customer: { select: { email: true, name: true } } },
        });
        return sendJson(res, 200, { order });
      } catch (err) {
        console.error('[admin/orders] Update-ship-date failed:', err);
        return sendJson(res, 500, { error: 'Failed to update ship date.' });
      }
    }

    if (body.action === 'update-order-details') {
      const parseResult = UpdateOrderDetailsSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const { orderId, recipientName, addressLine1, addressLine2, suburb, state, postcode, internalNote } =
        parseResult.data;
      try {
        const existing = await prisma.order.findUnique({
          where: { id: orderId },
          include: { deliveryAddress: true },
        });
        if (!existing) return sendJson(res, 404, { error: 'Order not found.' });

        // Only touch the address if the admin actually filled in at least
        // one address field — an all-blank submission (e.g. the note-only
        // case) leaves whatever address is already on the order alone.
        const touchingAddress = !!(recipientName || addressLine1 || suburb || state || postcode);
        let deliveryAddressId = existing.deliveryAddressId;
        if (touchingAddress) {
          const merged = {
            recipientName: recipientName || existing.deliveryAddress?.recipientName || '',
            line1: addressLine1 || existing.deliveryAddress?.line1 || '',
            line2: addressLine2 || existing.deliveryAddress?.line2 || null,
            suburb: suburb || existing.deliveryAddress?.suburb || '',
            state: state || existing.deliveryAddress?.state || '',
            postcode: postcode || existing.deliveryAddress?.postcode || '',
          };
          if (!merged.recipientName || !merged.line1 || !merged.suburb || !merged.state || !merged.postcode) {
            return sendJson(res, 400, {
              error: 'Recipient name, address line 1, suburb, state, and postcode are all required together.',
            });
          }
          if (existing.deliveryAddressId) {
            const address = await prisma.address.update({
              where: { id: existing.deliveryAddressId },
              data: merged,
            });
            deliveryAddressId = address.id;
          } else {
            const address = await prisma.address.create({
              data: { customerId: existing.customerId, country: 'AU', ...merged },
            });
            deliveryAddressId = address.id;
          }
        }

        // `customer` included alongside `deliveryAddress` for the same
        // in-place row-patch reason as the other admin order actions above.
        const order = await prisma.order.update({
          where: { id: existing.id },
          data: { deliveryAddressId, internalNote: internalNote || null },
          include: { deliveryAddress: true, customer: { select: { email: true, name: true } } },
        });
        return sendJson(res, 200, { order });
      } catch (err) {
        console.error('[admin/orders] Update-order-details failed:', err);
        return sendJson(res, 500, { error: 'Failed to save order details.' });
      }
    }

    const parseResult = MarkShippedSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    try {
      const existing = await prisma.order.findUnique({
        where: { id: parseResult.data.orderId },
        include: { customer: { select: { email: true } } },
      });
      if (!existing) return sendJson(res, 404, { error: 'Order not found.' });
      const alreadyShipped = !!existing.shippedAt;
      // `customer` included so the admin panel can patch this order's table
      // row in place instead of refetching the whole orders list.
      const order = await prisma.order.update({
        where: { id: existing.id },
        data: {
          shippedAt: new Date(),
          // Only advance status forward, never backward over a state an
          // admin (or a refund) has already moved it to (CANCELLED, etc.).
          status: existing.status === 'PAID' || existing.status === 'PACKED' ? 'OUT_FOR_DELIVERY' : existing.status,
        },
        include: { customer: { select: { email: true, name: true } } },
      });
      // Only email on the first "mark as shipped" for this order — clicking
      // it again (there's no real "already shipped" guard on the button,
      // but belt-and-braces here) shouldn't re-notify the customer.
      const emailSent = alreadyShipped
        ? false
        : await sendShippedEmail({ orderId: order.id, orderNumber: order.orderNumber, email: existing.customer.email });
      return sendJson(res, 200, { order, emailSent });
    } catch (err) {
      console.error('[admin/orders] Mark-shipped failed:', err);
      return sendJson(res, 500, { error: 'Failed to mark as shipped.' });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const id = searchParams.get('id');

  try {
    if (id) {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          customer: true,
          deliveryAddress: true,
          items: { include: { product: { select: { name: true } }, unit: { select: { serial: true } } } },
          payments: { select: { provider: true, status: true, amountCents: true, createdAt: true } },
        },
      });
      if (!order) return sendJson(res, 404, { error: 'Order not found.' });
      return sendJson(res, 200, { order });
    }

    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        expectedShipAt: true,
        shippedAt: true,
        internalNote: true,
        customer: { select: { email: true, name: true } },
        items: { select: { id: true } },
        payments: { select: { status: true } },
      },
    });
    return sendJson(res, 200, { orders });
  } catch (err) {
    console.error('[admin/orders] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load orders.' });
  }
}
