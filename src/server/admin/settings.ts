// api/admin/settings.js
// GET  /api/admin/settings  -> the order-confirmation email template library:
//                              { templates: [{id, name, message}], defaultId }
// POST /api/admin/settings  -> one of two shapes:
//   { templates, defaultId }   saves the whole library (add/edit/delete/
//                              reorder/change-default all go through this
//                              one wholesale save — the admin UI holds the
//                              full list client-side).
//   { previewMessage }         renders a sample order-confirmation email
//                              with this message, without saving anything
//                              — powers the "Preview" button on any one
//                              template.
//
// Backs the admin "Send Email" tab's "Email templates" section. The
// template marked `defaultId` is what every order-confirmation send uses
// when nothing more specific is typed for that send (a real Stripe
// checkout, a manual order with no custom message, or a "resend
// confirmation" with no custom message typed) — see
// src/lib/settings.js's getDefaultOrderMessage(). A save here takes effect
// on the very next send — no deploy needed.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';
import { orderConfirmationEmail } from '../../lib/emailTemplate.js';
import { getEmailTemplates, setEmailTemplates } from '../../lib/settings.js';

const TemplateSchema = z.object({
  id: z.string().max(100).optional(),
  name: z.string().trim().min(1, 'Name is required.').max(200),
  message: z.string().max(10000),
});

const SaveTemplatesSchema = z.object({
  templates: z.array(TemplateSchema).min(1, 'At least one template is required.'),
  defaultId: z.string().max(100),
});

const PreviewSettingsSchema = z.object({
  // Renders a sample order-confirmation email with this message, without
  // saving anything — powers the "Preview" button on the Email templates
  // card. Sample/placeholder order data stands in for a real order since
  // this isn't tied to one.
  previewMessage: z.string().max(10000),
});

export default async function handler(req: any, res: any): Promise<any> {
  if (!requireAdmin(req, res)) return;
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'GET') {
    try {
      const { templates, defaultId } = await getEmailTemplates();
      return sendJson(res, 200, { templates, defaultId });
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

    const parseResult = SaveTemplatesSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    try {
      const saved = await setEmailTemplates(parseResult.data.templates, parseResult.data.defaultId);
      return sendJson(res, 200, saved);
    } catch (err) {
      console.error('[admin/settings] Failed to save settings:', err);
      return sendJson(res, 500, { error: 'Unable to save settings.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}
