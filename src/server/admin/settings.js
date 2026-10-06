// api/admin/settings.js
// GET  /api/admin/settings  -> current admin-editable settings (right now:
//                              just the default order-confirmation message).
// POST /api/admin/settings  -> { defaultOrderMessage } saves it; an empty/
//                              whitespace-only value resets back to the
//                              hardcoded fallback (src/lib/emailTemplate.js's
//                              DEFAULT_ORDER_MESSAGE) by deleting the row
//                              rather than saving a blank override.
//
// Backs the admin "Send Email" tab's "Email templates" section. Every send
// that uses the default order-confirmation copy (a real Stripe checkout via
// api/stripe-webhook.js, a manual order with no custom message, or a
// "resend confirmation" with no custom message typed) reads through
// src/lib/settings.js's getDefaultOrderMessage(), so a save here takes
// effect on the very next send — no deploy needed.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';
import { DEFAULT_ORDER_MESSAGE, orderConfirmationEmail } from '../../lib/emailTemplate.js';
import { SETTING_KEYS, getSetting, setSetting } from '../../lib/settings.js';

const UpdateSettingsSchema = z.object({
  defaultOrderMessage: z.string().max(10000).optional().default(''),
});

const PreviewSettingsSchema = z.object({
  // Renders a sample order-confirmation email with this message, without
  // saving anything — powers the "Preview" button on the Email templates
  // card. Sample/placeholder order data stands in for a real order since
  // this isn't tied to one.
  previewMessage: z.string().max(10000),
});

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'GET') {
    try {
      const value = await getSetting(SETTING_KEYS.DEFAULT_ORDER_MESSAGE, DEFAULT_ORDER_MESSAGE);
      return sendJson(res, 200, {
        defaultOrderMessage: value,
        isCustom: value !== DEFAULT_ORDER_MESSAGE,
        fallback: DEFAULT_ORDER_MESSAGE,
      });
    } catch (err) {
      console.error('[admin/settings] Failed to load settings:', err);
      return sendJson(res, 500, { error: 'Unable to load settings.' });
    }
  }

  if (req.method === 'POST') {
    const body = parseRequestBody(req);

    if (typeof body?.previewMessage === 'string') {
      const previewParse = PreviewSettingsSchema.safeParse(body);
      if (!previewParse.success) {
        const formatted = formatZodError(previewParse.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const { html, text } = orderConfirmationEmail({
        orderNumber: 'UX-2026-000000',
        totalCents: 2900,
        currency: 'AUD',
        lookupLink: 'https://unstitchx.com/order/lookup',
        items: [{ name: 'Slow Bloom', quantity: 1 }],
        deliveryMethodLabel: 'Self-delivery',
        deliveryFeeCents: 0,
        deliveryAddress: {
          line1: '123 Example Street',
          suburb: 'Southbank',
          state: 'VIC',
          postcode: '3006',
        },
        message: previewParse.data.previewMessage,
      });
      return sendJson(res, 200, { ok: true, preview: true, html, text });
    }

    const parseResult = UpdateSettingsSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    try {
      await setSetting(SETTING_KEYS.DEFAULT_ORDER_MESSAGE, parseResult.data.defaultOrderMessage);
      const value = await getSetting(SETTING_KEYS.DEFAULT_ORDER_MESSAGE, DEFAULT_ORDER_MESSAGE);
      return sendJson(res, 200, {
        defaultOrderMessage: value,
        isCustom: value !== DEFAULT_ORDER_MESSAGE,
        fallback: DEFAULT_ORDER_MESSAGE,
      });
    } catch (err) {
      console.error('[admin/settings] Failed to save settings:', err);
      return sendJson(res, 500, { error: 'Unable to save settings.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}
