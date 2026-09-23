// api/order-lookup-request.js
// Public, passwordless order lookup: a customer submits their email, and
// if we find any orders under it, we email a signed magic link that shows
// their order status — no account or password needed (this is the "guest
// checkout + magic-link order lookup" v1 scope, deliberately lighter than
// full customer accounts).
//
// Always returns the same generic response whether or not the email
// matches anything, so this endpoint can't be used to check who has (or
// hasn't) ordered from the site.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { sign } from '../lib/signedToken.js';
import { getSiteOrigin } from '../lib/siteOrigin.js';
import prisma from '../lib/prisma.js';

const RequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

// A token issued this way covers every order under the email, unlike the
// single-order link embedded in the confirmation email — see
// api/order-lookup.js, which accepts either shape.
const LOOKUP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const GENERIC_RESPONSE = {
  ok: true,
  message: "If we found an order under that email, we've sent a link to check its status.",
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Keyed by IP (checkRateLimit's default), not email — this is the public
  // endpoint most likely to be probed/spammed.
  const rateResult = checkRateLimit(req, { limit: 5, windowMs: 10 * 60000, prefix: 'order-lookup-request' });
  if (!rateResult.success) {
    return sendJson(res, 429, { error: 'Too many requests. Please wait a few minutes and try again.' });
  }

  const body = parseRequestBody(req);
  const parseResult = RequestSchema.safeParse(body);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
  }
  const { email } = parseResult.data;

  // Fail generically even when the DB isn't configured — never let this
  // endpoint's response shape hint at server state to an outside caller.
  if (!prisma) return sendJson(res, 200, GENERIC_RESPONSE);

  try {
    const customer = await prisma.customer.findUnique({ where: { email } });
    if (customer) {
      const orderCount = await prisma.order.count({ where: { customerId: customer.id } });
      if (orderCount > 0 && process.env.RESEND_API_KEY) {
        const token = sign({ kind: 'order-lookup', customerId: customer.id }, LOOKUP_TOKEN_TTL_SECONDS);
        const link = `${getSiteOrigin(req)}/order/lookup?token=${encodeURIComponent(token)}`;

        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';

        await resend.emails
          .send({
            from: fromEmail,
            to: email,
            subject: 'Check your Unstitch order',
            text: [
              "Here's your link to check your order status:",
              '',
              link,
              '',
              'This link works for 30 days. If you did not request this, you can ignore this email.',
              '',
              'Unstitch — Naarm, Melbourne Australia',
            ].join('\n'),
          })
          .catch((err) => console.error('[order-lookup-request] Email send failed:', err));
      }
    }
  } catch (err) {
    console.error('[order-lookup-request] Lookup failed:', err);
    // Fall through to the generic response regardless — an internal error
    // here shouldn't be distinguishable from "no orders found" either.
  }

  return sendJson(res, 200, GENERIC_RESPONSE);
}
