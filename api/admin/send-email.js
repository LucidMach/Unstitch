// api/admin/send-email.js
// Two modes:
//   { mode: "resend-confirmation", orderId }        — re-sends the standard order-confirmation email for a real order.
//   { mode: "custom", email, subject, message }      — sends an arbitrary plain-text message to any address
//                                                       (delays, thank-yous, anything not worth its own template).

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../src/lib/apiHelper.js';
import { requireAdmin } from '../../src/lib/adminAuth.js';
import { checkRateLimit } from '../../src/lib/rateLimit.js';
import { sign } from '../../src/lib/signedToken.js';
import { getSiteOrigin } from '../../src/lib/siteOrigin.js';
import prisma from '../../src/lib/prisma.js';

// Matches api/stripe-webhook.js and api/order-lookup-request.js, so a
// resent confirmation carries the same style of link as the original.
const ORDER_LOOKUP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const CustomEmailSchema = z.object({
  mode: z.literal('custom'),
  email: z.string().trim().toLowerCase().email(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10000),
});

const ResendConfirmationSchema = z.object({
  mode: z.literal('resend-confirmation'),
  orderId: z.string().min(1),
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const rateResult = checkRateLimit(req, { limit: 20, windowMs: 60000, prefix: 'admin-send-email' });
  if (!rateResult.success) {
    return sendJson(res, 429, { error: 'Too many emails sent recently. Please wait a moment.' });
  }

  if (!process.env.RESEND_API_KEY) {
    return sendJson(res, 503, { error: 'RESEND_API_KEY is not configured.' });
  }

  const body = parseRequestBody(req);

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';

    if (body.mode === 'custom') {
      const parseResult = CustomEmailSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const { email, subject, message } = parseResult.data;
      const result = await resend.emails.send({ from: fromEmail, to: email, subject, text: message });
      if (result.error) {
        console.error('[admin/send-email] Custom email failed:', result.error);
        return sendJson(res, 502, { error: 'Resend rejected the email.' });
      }
      return sendJson(res, 200, { ok: true });
    }

    if (body.mode === 'resend-confirmation') {
      const parseResult = ResendConfirmationSchema.safeParse(body);
      if (!parseResult.success) {
        return sendJson(res, 400, { error: 'orderId is required.' });
      }
      if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

      const order = await prisma.order.findUnique({
        where: { id: parseResult.data.orderId },
        include: { customer: true },
      });
      if (!order) return sendJson(res, 404, { error: 'Order not found.' });

      const amount = (order.totalCents / 100).toFixed(2);
      const lookupToken = sign({ kind: 'order-lookup', orderId: order.id }, ORDER_LOOKUP_TOKEN_TTL_SECONDS);
      const lookupLink = `${getSiteOrigin(req)}/order/lookup?token=${encodeURIComponent(lookupToken)}`;
      const result = await resend.emails.send({
        from: fromEmail,
        to: order.customer.email,
        subject: `Your Unstitch order ${order.orderNumber} is confirmed`,
        text: [
          'Thanks for your order!',
          '',
          `Order number: ${order.orderNumber}`,
          `Total: ${order.currency} $${amount}`,
          '',
          "We'll be in touch with shipping details soon.",
          '',
          'Track your order any time:',
          lookupLink,
          '',
          'Unstitch — Naarm, Melbourne Australia',
        ].join('\n'),
      });
      if (result.error) {
        console.error('[admin/send-email] Resend-confirmation failed:', result.error);
        return sendJson(res, 502, { error: 'Resend rejected the email.' });
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: 'Unknown mode.' });
  } catch (err) {
    console.error('[admin/send-email] Failed:', err);
    return sendJson(res, 500, { error: 'Failed to send email.' });
  }
}
