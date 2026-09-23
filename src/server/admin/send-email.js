// api/admin/send-email.js
// Two modes:
//   { mode: "resend-confirmation", orderId }   — re-sends the standard order-confirmation email for a real order.
//   { mode: "custom", to, subject, message }   — sends an arbitrary plain-text message to one or more addresses
//                                                 (delays, thank-yous, anything not worth its own template).
//                                                 `to` is a free-text blob (comma and/or newline separated, as
//                                                 typed into the admin panel's textarea, possibly built from the
//                                                 Orders/Customers tab's bulk-select) — parsed, validated and
//                                                 deduped below. Each recipient gets their own Resend call so
//                                                 nobody's address is ever exposed to another via CC/BCC.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { sign } from '../../lib/signedToken.js';
import { getSiteOrigin } from '../../lib/siteOrigin.js';
import prisma from '../../lib/prisma.js';
import { brandedEmailHtml, orderConfirmationEmail, esc } from '../../lib/emailTemplate.js';
import { deliveryMethodLabel } from '../../lib/shipping.js';

// Matches api/stripe-webhook.js and api/order-lookup-request.js, so a
// resent confirmation carries the same style of link as the original.
const ORDER_LOOKUP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// Bulk sends are still one admin action, but cap the fan-out so a bad
// paste (or a "select all" on a large customer list) can't turn into an
// unbounded number of outbound Resend calls from a single request.
const MAX_RECIPIENTS = 50;

const EmailAddressSchema = z.string().trim().toLowerCase().email();

// Default sign-off for every custom send — overridable per-send via
// signatureName/signatureRole (e.g. someone other than Astra signing a
// particular workshop follow-up). Not applied to resend-confirmation,
// which already closes with its own business sign-off.
const DEFAULT_SIGNATURE_NAME = 'Astra';
const DEFAULT_SIGNATURE_ROLE = 'Designer at Unstitch';

function plainTextSignature(name, role) {
  return [
    '',
    '',
    'Warm regards,',
    name,
    role,
    '',
    'unstitchx.com',
    'linkedin.com/company/unstitchx',
    '@unstitchxfactory (instagram.com/unstitchxfactory)',
  ].join('\n');
}

/** Splits a comma/newline-separated blob into deduped, validated addresses. */
function parseRecipients(raw) {
  const parts = raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const valid = [];
  const invalid = [];
  for (const part of parts) {
    const result = EmailAddressSchema.safeParse(part);
    if (!result.success) {
      invalid.push(part);
      continue;
    }
    if (seen.has(result.data)) continue;
    seen.add(result.data);
    valid.push(result.data);
  }
  return { valid, invalid };
}

const CustomEmailSchema = z.object({
  mode: z.literal('custom'),
  to: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10000),
  // Optional — e.g. for a workshop/school follow-up or a new-contact
  // welcome note, not every send. Must be a public URL (Resend doesn't
  // accept inline attachment images here); shown just above the sign-off.
  gifUrl: z.string().trim().url().max(2000).optional(),
  // Both optional — override the default Astra/Designer sign-off for this
  // one send (e.g. a different team member replying to a specific thread).
  signatureName: z.string().trim().max(100).optional(),
  signatureRole: z.string().trim().max(150).optional(),
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
      const { to, subject, message, gifUrl, signatureName, signatureRole } = parseResult.data;
      const finalSignatureName = signatureName || DEFAULT_SIGNATURE_NAME;
      const finalSignatureRole = signatureRole || DEFAULT_SIGNATURE_ROLE;
      const { valid: recipients, invalid: skippedInvalid } = parseRecipients(to);

      if (recipients.length === 0) {
        return sendJson(res, 400, {
          error: skippedInvalid.length
            ? `Couldn't recognize any valid email addresses in: ${skippedInvalid.join(', ')}`
            : 'Enter at least one recipient.',
        });
      }
      if (recipients.length > MAX_RECIPIENTS) {
        return sendJson(res, 400, { error: `Too many recipients — max ${MAX_RECIPIENTS} per send.` });
      }

      const fullMessage = `${message}${plainTextSignature(finalSignatureName, finalSignatureRole)}`;
      // message may be multiple \n\n-separated paragraphs — keep that
      // structure in the HTML version rather than collapsing it to one block.
      const bodyHtml = message
        .split(/\n{2,}/)
        .map((para) => `<p style="margin:0 0 14px;">${esc(para).replace(/\n/g, '<br/>')}</p>`)
        .join('');
      const html = brandedEmailHtml({
        heading: subject,
        bodyHtml,
        gifUrl,
        signatureName: finalSignatureName,
        signatureRole: finalSignatureRole,
      });

      const results = await Promise.all(
        recipients.map(async (recipient) => {
          try {
            const result = await resend.emails.send({ from: fromEmail, to: recipient, subject, html, text: fullMessage });
            if (result.error) {
              return { email: recipient, ok: false, error: result.error.message || result.error.name || 'unknown reason' };
            }
            return { email: recipient, ok: true };
          } catch (err) {
            return { email: recipient, ok: false, error: err instanceof Error ? err.message : 'Send failed' };
          }
        }),
      );

      const failed = results.filter((r) => !r.ok);
      const sent = results.filter((r) => r.ok);

      if (sent.length === 0) {
        console.error('[admin/send-email] All custom-email sends failed:', failed);
        return sendJson(res, 502, {
          error: `Resend rejected all ${failed.length} email(s): ${failed.map((f) => `${f.email} (${f.error})`).join('; ')}`,
        });
      }

      if (failed.length > 0) {
        console.error('[admin/send-email] Some custom-email sends failed:', failed);
      }

      return sendJson(res, 200, {
        ok: true,
        sent: sent.length,
        failed: failed.map((f) => ({ email: f.email, error: f.error })),
        skippedInvalid,
      });
    }

    if (body.mode === 'resend-confirmation') {
      const parseResult = ResendConfirmationSchema.safeParse(body);
      if (!parseResult.success) {
        return sendJson(res, 400, { error: 'orderId is required.' });
      }
      if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

      const order = await prisma.order.findUnique({
        where: { id: parseResult.data.orderId },
        include: {
          customer: true,
          deliveryAddress: true,
          deliveryZone: { select: { method: true } },
          items: { include: { product: { select: { name: true } } } },
        },
      });
      if (!order) return sendJson(res, 404, { error: 'Order not found.' });

      // Collapse OrderItems (one row per reserved unit) down to a
      // per-product breakdown — same shape the confirmation template
      // expects, whether the order came through Stripe or admin/manual-order.
      const itemCounts = new Map();
      for (const item of order.items) {
        const name = item.product?.name || 'Item';
        itemCounts.set(name, (itemCounts.get(name) || 0) + item.quantity);
      }
      const items = Array.from(itemCounts, ([name, quantity]) => ({ name, quantity }));

      const lookupToken = sign({ kind: 'order-lookup', orderId: order.id }, ORDER_LOOKUP_TOKEN_TTL_SECONDS);
      const lookupLink = `${getSiteOrigin(req)}/order/lookup?token=${encodeURIComponent(lookupToken)}`;
      const { html, text } = orderConfirmationEmail({
        orderNumber: order.orderNumber,
        totalCents: order.totalCents,
        currency: order.currency,
        lookupLink,
        items,
        deliveryMethodLabel: deliveryMethodLabel(order.deliveryZone?.method),
        deliveryFeeCents: order.deliveryFeeCents,
        deliveryAddress: order.deliveryAddress
          ? {
              line1: order.deliveryAddress.line1,
              line2: order.deliveryAddress.line2,
              suburb: order.deliveryAddress.suburb,
              state: order.deliveryAddress.state,
              postcode: order.deliveryAddress.postcode,
            }
          : null,
      });
      const result = await resend.emails.send({
        from: fromEmail,
        to: order.customer.email,
        subject: `Your Unstitch order ${order.orderNumber} is confirmed`,
        html,
        text,
      });
      if (result.error) {
        console.error('[admin/send-email] Resend-confirmation failed:', result.error);
        return sendJson(res, 502, { error: `Resend rejected the email: ${result.error.message || result.error.name || 'unknown reason'}` });
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: 'Unknown mode.' });
  } catch (err) {
    console.error('[admin/send-email] Failed:', err);
    return sendJson(res, 500, { error: 'Failed to send email.' });
  }
}
