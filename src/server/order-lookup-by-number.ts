// src/server/order-lookup-by-number.js — wired in at /api/order-lookup-by-number
// via api/[...route].js's dispatcher, same pattern as every other handler
// in this directory.
// POST { orderNumber, email } -> if the pair matches a real order,
// returns its sanitized detail directly (same shape as api/order-lookup.js
// — see sanitizeOrder there). The alternative to the email-only flow in
// api/order-lookup-request.js: no magic-link round trip, because knowing
// the exact order number *and* the email it was placed under is already
// enough proof of ownership — a stranger can't guess both ("UX-2026-"
// plus six random digits, see src/lib/orderNumber.js) for a real order.
//
// Deliberately generic on any mismatch (wrong number, wrong email, or
// order simply doesn't exist) — same "fail generically" posture as
// order-lookup-request.js, so this can't be used to enumerate order
// numbers or confirm which emails have ordered.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';
import { ORDER_INCLUDE, sanitizeOrder } from './order-lookup.js';

const RequestSchema = z.object({
  orderNumber: z.string().trim().toUpperCase().min(1).max(30),
  email: z.string().trim().toLowerCase().email(),
});

const NOT_FOUND_MESSAGE = "We couldn't find an order with that number and email. Double-check both, or request a link by email instead.";

export default async function handler(req: any, res: any): Promise<any> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const rateResult = checkRateLimit(req, { limit: 8, windowMs: 10 * 60000, prefix: 'order-lookup-by-number' });
  if (!rateResult.success) {
    return sendJson(res, 429, { error: 'Too many requests. Please wait a few minutes and try again.' });
  }

  const body = parseRequestBody(req);
  const parseResult = RequestSchema.safeParse(body);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
  }
  const { orderNumber, email } = parseResult.data;

  if (!prisma) return sendJson(res, 404, { error: NOT_FOUND_MESSAGE });

  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { ...ORDER_INCLUDE, customer: { select: { email: true } } },
    });
    if (!order || order.customer?.email?.toLowerCase() !== email) {
      return sendJson(res, 404, { error: NOT_FOUND_MESSAGE });
    }
    return sendJson(res, 200, { orders: [sanitizeOrder(order)] });
  } catch (err) {
    console.error('[order-lookup-by-number] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load order.' });
  }
}
