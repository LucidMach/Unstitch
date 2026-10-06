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
import {
  brandedEmailHtml,
  orderConfirmationEmail,
  esc,
  fillMessageVars,
  DEFAULT_SIGNATURE_NAME,
  DEFAULT_SIGNATURE_ROLE,
  plainTextSignature,
} from '../../lib/emailTemplate.js';
import { deliveryMethodLabel } from '../../lib/shipping.js';
import { getDefaultOrderMessage } from '../../lib/settings.js';

// Matches api/stripe-webhook.js and api/order-lookup-request.js, so a
// resent confirmation carries the same style of link as the original.
const ORDER_LOOKUP_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// Bulk sends are still one admin action, but cap the fan-out so a bad
// paste (or a "select all" on a large customer list) can't turn into an
// unbounded number of outbound Resend calls from a single request.
const MAX_RECIPIENTS = 50;

const EmailAddressSchema = z.string().trim().toLowerCase().email();

// DEFAULT_SIGNATURE_NAME/ROLE and plainTextSignature now live in
// src/lib/emailTemplate.js, shared with src/server/admin/broadcast.js.

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
  // Normally required, but a preview renders the email without sending it,
  // so there's nothing to validate recipients against — see the preview
  // branch below, which checks this before recipients are parsed.
  to: z.string().trim().optional().default(''),
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
  // When true, renders and returns {html, text} instead of actually
  // sending anything — powers the admin panel's "Preview email" button.
  preview: z.boolean().optional().default(false),
});

const ResendConfirmationSchema = z.object({
  mode: z.literal('resend-confirmation'),
  orderId: z.string().min(1),
  // Optional — lets the admin write a one-off note for this specific
  // resend from the order detail panel, same as api/admin/manual-order.js
  // already allows at order-creation time. Falls back to the saved/default
  // made-to-order copy when left blank (see emailTemplate.js's
  // DEFAULT_ORDER_MESSAGE and the Setting-backed override in getSetting()).
  message: z.string().trim().max(10000).optional(),
  signatureName: z.string().trim().max(100).optional(),
  signatureRole: z.string().trim().max(150).optional(),
  // Same preview flag as the custom mode above.
  preview: z.boolean().optional().default(false),
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

  const body = parseRequestBody(req);
  const isPreview = body && body.preview === true;

  // A preview only renders the template — nothing is sent, so it doesn't
  // need Resend configured at all (handy in local dev without a real key).
  if (!isPreview && !process.env.RESEND_API_KEY) {
    return sendJson(res, 503, { error: 'RESEND_API_KEY is not configured.' });
  }

  try {
    const resend = isPreview ? null : new (await import('resend')).Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';

    if (body.mode === 'custom') {
      const parseResult = CustomEmailSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const { to, subject, message, gifUrl, signatureName, signatureRole, preview } = parseResult.data;
      const finalSignatureName = signatureName || DEFAULT_SIGNATURE_NAME;
      const finalSignatureRole = signatureRole || DEFAULT_SIGNATURE_ROLE;

      // Parsed up front -- even for a preview -- so a {name} in the
      // message can be previewed against a real address instead of only
      // resolving once the send actually happens.
      const { valid: recipients, invalid: skippedInvalid } = parseRecipients(to);

      // One batched lookup covers every recipient who's an existing
      // customer; anyone not found (a one-off contact, not a customer
      // yet) falls back to the part of their address before the @, same
      // fallback the single-order sends use.
      const customersByEmail = recipients.length && prisma
        ? new Map(
            (
              await prisma.customer.findMany({
                where: { email: { in: recipients } },
                select: { email: true, name: true },
              })
            ).map((c) => [c.email, c.name]),
          )
        : new Map();
      const nameForRecipient = (email) => customersByEmail.get(email) || email.split('@')[0];

      // Renders this send for one specific recipient name -- {name} (in
      // either the subject or the message) is filled in before the
      // signature is appended and the HTML is built, so each recipient's
      // copy is personalized rather than one shared render reused for
      // everyone.
      function renderFor(name) {
        const filledSubject = fillMessageVars(subject, { name });
        const filledMessage = fillMessageVars(message, { name });
        const fullMessage = `${filledMessage}${plainTextSignature(finalSignatureName, finalSignatureRole)}`;
        // message may be multiple \n\n-separated paragraphs — keep that
        // structure in the HTML version rather than collapsing it to one block.
        const bodyHtml = filledMessage
          .split(/\n{2,}/)
          .map((para) => `<p style="margin:0 0 14px;">${esc(para).replace(/\n/g, '<br/>')}</p>`)
          .join('');
        const html = brandedEmailHtml({
          heading: filledSubject,
          bodyHtml,
          gifUrl,
          signatureName: finalSignatureName,
          signatureRole: finalSignatureRole,
        });
        return { subject: filledSubject, html, text: fullMessage };
      }

      if (preview) {
        // Preview as it'll actually render for the first recognized
        // recipient, so a {name} placeholder shows a real resolved value;
        // with no recipients typed yet, fall back to a generic "there"
        // rather than failing the preview.
        const sampleName = recipients.length ? nameForRecipient(recipients[0]) : 'there';
        const { html, text } = renderFor(sampleName);
        return sendJson(res, 200, { ok: true, preview: true, html, text });
      }

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

      const results = await Promise.all(
        recipients.map(async (recipient) => {
          const { subject: recipientSubject, html, text } = renderFor(nameForRecipient(recipient));
          try {
            const result = await resend.emails.send({ from: fromEmail, to: recipient, subject: recipientSubject, html, text });
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

      const { message, signatureName, signatureRole, preview } = parseResult.data;
      const lookupToken = sign({ kind: 'order-lookup', orderId: order.id }, ORDER_LOOKUP_TOKEN_TTL_SECONDS);
      const lookupLink = `${getSiteOrigin(req)}/order/lookup?token=${encodeURIComponent(lookupToken)}`;
      // No custom message typed for this resend -> falls back to the
      // admin-editable default (Send Email tab -> Email templates), which
      // itself falls back to the hardcoded DEFAULT_ORDER_MESSAGE constant
      // if nothing's been saved yet. See src/lib/settings.js.
      // Shipping recipient can differ from the account holder (a gift
      // bought under one name, sent to another) -> prefer that, then the
      // customer's own saved name, then fall back to their email's local
      // part so {name} never renders as literally empty.
      const recipientName =
        order.deliveryAddress?.recipientName || order.customer?.name || order.customer.email.split('@')[0];
      const resolvedMessage = fillMessageVars(message || (await getDefaultOrderMessage()), { name: recipientName });
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
        message: resolvedMessage,
        ...(signatureName ? { signatureName } : {}),
        ...(signatureRole ? { signatureRole } : {}),
      });

      if (preview) {
        return sendJson(res, 200, { ok: true, preview: true, html, text });
      }

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
      // See api/stripe-webhook.js's matching update for why this is here
      // — same "sent, when, Resend's id" metadata as the original send,
      // so a resend shows up on the order detail panel too.
      await prisma.order
        .update({
          where: { id: order.id },
          data: { lastEmailSentAt: new Date(), lastEmailId: result.data?.id || null, lastEmailType: 'resend' },
        })
        .catch((err) => console.warn('[admin/send-email] Failed to record email send metadata:', err));
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: 'Unknown mode.' });
  } catch (err) {
    console.error('[admin/send-email] Failed:', err);
    return sendJson(res, 500, { error: 'Failed to send email.' });
  }
}
