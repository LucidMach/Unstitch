// api/order-status.js
// Vercel Serverless Function — lets the static `/order/success` page verify
// payment status server-side instead of trusting the redirect alone. The
// Stripe webhook (api/stripe-webhook.js) is the authoritative writer of
// order state; this endpoint just reads it back (falling back to asking
// Stripe directly for a session that hasn't been webhook-processed yet,
// since webhook delivery can lag a few seconds behind the browser redirect).

import { checkRateLimit } from '../lib/rateLimit.js';
import { sendJson } from '../lib/apiHelper.js';
import prisma from '../lib/prisma.js';
import stripe from '../lib/stripe.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const rateResult = checkRateLimit(req, { limit: 30, windowMs: 60000, prefix: 'order-status' });
  if (!rateResult.success) {
    return sendJson(res, 429, { status: 'error', error: 'Too many requests.' });
  }

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const sessionId = searchParams.get('session_id');
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return sendJson(res, 400, { status: 'error', error: 'Missing or invalid session_id' });
  }

  if (!prisma || !stripe) {
    return sendJson(res, 503, { status: 'error', error: 'Not configured' });
  }

  try {
    // The webhook writes Order.idempotencyKey = the Checkout Session id, so
    // this is the authoritative check.
    const order = await prisma.order.findUnique({
      where: { idempotencyKey: sessionId },
      select: { orderNumber: true, totalCents: true, currency: true, status: true },
    });

    if (order) {
      return sendJson(res, 200, { status: 'paid', order });
    }

    // No order yet — ask Stripe directly so we can tell the difference
    // between "still processing" (worth polling again) and "never paid".
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      return sendJson(res, 200, { status: 'processing' });
    }
    if (session.status === 'expired') {
      return sendJson(res, 200, { status: 'expired' });
    }
    return sendJson(res, 200, { status: 'not_paid' });
  } catch (err) {
    console.error('[order-status] Lookup failed:', err);
    return sendJson(res, 500, { status: 'error', error: 'Unable to look up order status.' });
  }
}
