// api/delivery-quote.js
// Public GET ?postcode=XXXX -> the delivery zone/fee that postcode resolves
// to, so the bag drawer can show a real shipping estimate before the
// customer ever reaches Stripe. The actual charge is always re-resolved
// server-side in create-checkout-session.js — this endpoint is read-only
// and never trusted for the real charge.

import { sendJson } from '../src/lib/apiHelper.js';
import { checkRateLimit } from '../src/lib/rateLimit.js';
import { resolveDeliveryZone, OutOfDeliveryAreaError } from '../src/lib/deliveryZones.js';
import prisma from '../src/lib/prisma.js';

const POSTCODE_RE = /^[0-9]{4}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const rateResult = checkRateLimit(req, { limit: 60, windowMs: 60000, prefix: 'delivery-quote' });
  if (!rateResult.success) {
    return sendJson(res, 429, { error: 'Too many requests.' });
  }

  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const postcode = searchParams.get('postcode') || '';
  if (!POSTCODE_RE.test(postcode)) {
    return sendJson(res, 400, { error: 'Enter a valid 4-digit postcode.' });
  }

  try {
    const zone = await resolveDeliveryZone(prisma, postcode);
    if (!zone) {
      return sendJson(res, 503, { error: 'Delivery pricing is not configured yet.' });
    }
    return sendJson(res, 200, {
      zoneName: zone.name,
      feeCents: zone.feeCents,
      etaDays: zone.etaDays,
      isEstimate: zone.isEstimate,
    });
  } catch (err) {
    if (err instanceof OutOfDeliveryAreaError) {
      return sendJson(res, 400, {
        error: "We currently deliver within Victoria only. If you're interstate, email eshop@unstitchx.com and we'll see what we can arrange.",
      });
    }
    console.error('[delivery-quote] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to calculate delivery.' });
  }
}
