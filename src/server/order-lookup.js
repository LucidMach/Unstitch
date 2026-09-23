// api/order-lookup.js
// GET ?token=... -> verifies a signed magic-link token (src/lib/signedToken.js)
// and returns sanitized order detail. No password or account involved.
//
// Two token shapes are accepted, both stamped with kind: 'order-lookup':
//   { orderId }    — one specific order, embedded directly in the
//                     confirmation email (api/stripe-webhook.js) or a
//                     resend from the admin panel (api/admin/send-email.js).
//   { customerId } — every order for that customer, issued by
//                     api/order-lookup-request.js's email-based flow.

import { sendJson } from '../lib/apiHelper.js';
import { verify } from '../lib/signedToken.js';
import prisma from '../lib/prisma.js';

const ORDER_INCLUDE = {
  items: { include: { product: { select: { name: true } } } },
  deliveryAddress: true,
};

/** @param {any} order */
function sanitizeOrder(order) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt,
    items: order.items.map((it) => ({
      productName: it.product?.name || 'Item',
      quantity: it.quantity,
      lineTotalCents: it.lineTotalCents,
    })),
    deliveryAddress: order.deliveryAddress
      ? {
          recipientName: order.deliveryAddress.recipientName,
          line1: order.deliveryAddress.line1,
          line2: order.deliveryAddress.line2,
          suburb: order.deliveryAddress.suburb,
          state: order.deliveryAddress.state,
          postcode: order.deliveryAddress.postcode,
          country: order.deliveryAddress.country,
        }
      : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const token = searchParams.get('token');
  if (!token) return sendJson(res, 400, { error: 'Missing token.' });

  const payload = verify(token);
  if (!payload || payload.kind !== 'order-lookup') {
    return sendJson(res, 401, { error: 'This link has expired or is invalid. Request a new one.' });
  }

  try {
    if (payload.orderId) {
      const order = await prisma.order.findUnique({ where: { id: payload.orderId }, include: ORDER_INCLUDE });
      if (!order) return sendJson(res, 404, { error: 'Order not found.' });
      return sendJson(res, 200, { orders: [sanitizeOrder(order)] });
    }
    if (payload.customerId) {
      const orders = await prisma.order.findMany({
        where: { customerId: payload.customerId },
        orderBy: { createdAt: 'desc' },
        include: ORDER_INCLUDE,
      });
      return sendJson(res, 200, { orders: orders.map(sanitizeOrder) });
    }
    return sendJson(res, 401, { error: 'Invalid link.' });
  } catch (err) {
    console.error('[order-lookup] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load order.' });
  }
}
