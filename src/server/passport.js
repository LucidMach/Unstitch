// api/passport.js
// GET  /api/passport?serial=<serial>          -> public unit + drop +
//   product info for the customer-facing digital passport page
//   (src/pages/passport.astro). No admin auth — this is meant to be hit by
//   anyone who scans the QR code printed on a physical kit. Returns only
//   customer-safe fields: nothing about pricing, cost breakdown, or other
//   customers' data. `serial` is matched against both Unit.serial and
//   Unit.qrSlug (normally identical — see api/admin/inventory.js — but
//   matching both means a future divergence doesn't quietly 404 real codes).
//   Never includes `registeredOwnerName` — this endpoint is unauthenticated
//   and hit by anyone with the (low-entropy, sequential) serial, so the
//   current registrant's name is never handed to an anonymous scanner.
// POST /api/passport { serial, email, name? }  -> "Register this kit":
//   claims ownership for the scanning customer (find-or-create Customer by
//   email), sets Unit.currentOwnerCustomerId + registeredAt, and bumps
//   status to REGISTERED. Only allowed once the unit has actually been
//   sold (SOLD/SHIPPED/DELIVERED/already REGISTERED) — not IN_STOCK or
//   RESERVED — so registering isn't a way to claim a unit nobody's bought
//   yet.
//
// Deliberately no order-code/proof-of-purchase check here (unlike Review
// submission, which verifies against a delivered order) — registering an
// unregistered unit is just "this is mine, personalize my passport", not a
// legal ownership claim, so the bar there is intentionally low and stays
// that way.
//
// Re-registering an already-REGISTERED unit (a resold/gifted kit) is also
// allowed on purpose — the passport should follow the object to its new
// owner — but it's split into two cases so a stranger who merely learns/
// guesses a sequential serial can't silently take over (or just read the
// name on) someone else's already-claimed kit:
//   - same email as the current registrant (case-insensitive): treated as
//     the owner editing their own details — direct write, no email round
//     trip, exactly as frictionless as before.
//   - a different email: NOT applied immediately. A confirmation link is
//     minted (src/lib/signedToken.js, kind: 'passport-transfer') and
//     emailed to the *current* registrant's address — the same pattern
//     api/order-lookup.js uses for magic links, and the same "kind"
//     discriminator convention. Only clicking that link (handled by
//     api/passport-confirm-transfer.js) actually reassigns ownership. This
//     preserves the "no proof of purchase" low-friction spirit for the
//     common resale/gift case (the seller/giver just needs to click a link
//     they receive) while closing the hijack: nobody can silently overwrite
//     or read another customer's existing registration just by knowing the
//     serial.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { sign } from '../lib/signedToken.js';
import { getSiteOrigin } from '../lib/siteOrigin.js';
import { passportTransferConfirmationEmail } from '../lib/emailTemplate.js';
import prisma from '../lib/prisma.js';

const REGISTERABLE_STATUSES = new Set(['SOLD', 'SHIPPED', 'DELIVERED', 'REGISTERED']);

// How long a "confirm this transfer" link mailed to the current registrant
// stays valid. Short-ish on purpose — unlike an order magic-link (which
// just needs to keep working for customer support), this one authorizes a
// state change (reassigning ownership), so it shouldn't stay live for
// weeks. 7 days comfortably covers someone checking email a bit late.
const PASSPORT_TRANSFER_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * @param {any} unit
 * @param {{ includeOwnerName?: boolean }} [opts] - `includeOwnerName` must
 *   only be `true` for a response going back to someone who is already
 *   authorized to see it (the person who just took the registration
 *   action themselves). The public, unauthenticated GET always omits it.
 */
function serializeUnit(unit, { includeOwnerName = false } = {}) {
  return {
    serial: unit.serial,
    editionNumber: unit.editionNumber,
    status: unit.status,
    registered: !!unit.registeredAt,
    registeredOwnerName: includeOwnerName && unit.registeredAt ? unit.currentOwner?.name || null : null,
    drop: {
      dropCode: unit.drop.dropCode,
      totalUnits: unit.drop.totalUnits,
      madeLocation: unit.drop.madeLocation,
      madeYear: unit.drop.madeYear,
    },
    product: {
      name: unit.product.name,
      slug: unit.product.slug,
      tagline: unit.product.tagline,
      colourPalette: unit.product.colourPalette,
      tileMaterial: unit.product.tileMaterial,
      materialRigidity: unit.product.materialRigidity,
      kitContents: unit.product.kitContents,
      imageUrl: unit.product.imageUrl,
    },
  };
}

const RegisterSchema = z.object({
  serial: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  name: z.string().trim().max(200).optional(),
});

/** Emails the current registrant a link to confirm (or ignore) a transfer request from a different email. Best-effort — mirrors api/stripe-webhook.js's send pattern (dev-mode console.log fallback when RESEND_API_KEY isn't set, Resend's shared onboarding sender as a fallback if the configured from-address isn't verified). */
async function sendPassportTransferEmail({ toEmail, productName, unitSerial, newOwnerEmail, confirmLink }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[passport] Dev/mock transfer confirmation email:', { toEmail, unitSerial, newOwnerEmail, confirmLink });
    return;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';

    const { html, text } = passportTransferConfirmationEmail({ productName, unitSerial, newOwnerEmail, confirmLink });

    const send = (from) =>
      resend.emails.send({
        from,
        to: toEmail,
        subject: `Confirm: someone wants to claim your Unstitch kit (${unitSerial})`,
        html,
        text,
      });

    let result = await send(fromEmail);
    if (
      result.error &&
      (result.error.message?.toLowerCase().includes('not verified') ||
        result.error.statusCode === 403 ||
        result.error.name === 'validation_error')
    ) {
      result = await send('Unstitch Studio <onboarding@resend.dev>');
    }
    if (result.error) {
      console.warn('[passport] Transfer confirmation email failed to send:', result.error);
    }
  } catch (err) {
    console.warn('[passport] Transfer confirmation email threw:', err);
  }
}

export default async function handler(req, res) {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'GET') {
    const { searchParams } = new URL(req.url, 'http://placeholder.local');
    const serial = (searchParams.get('serial') || '').trim();
    if (!serial) return sendJson(res, 400, { error: 'Missing serial.' });
    try {
      // No `currentOwner` include here on purpose — this is the
      // unauthenticated public lookup, so there's nothing to serialize an
      // owner name from even if serializeUnit were called wrong below.
      const unit = await prisma.unit.findFirst({
        where: { OR: [{ serial }, { qrSlug: serial }] },
        include: { drop: true, product: true },
      });
      if (!unit) return sendJson(res, 404, { error: "We couldn't find a kit with that passport code." });
      return sendJson(res, 200, { unit: serializeUnit(unit, { includeOwnerName: false }) });
    } catch (err) {
      console.error('[passport] Lookup failed:', err);
      return sendJson(res, 500, { error: 'Unable to load this passport right now.' });
    }
  }

  if (req.method === 'POST') {
    const rateResult = checkRateLimit(req, { limit: 10, windowMs: 60000, prefix: 'passport-register' });
    if (!rateResult.success) {
      return sendJson(res, 429, { error: 'Too many attempts. Please wait a moment and try again.' });
    }
    const body = parseRequestBody(req);
    const parseResult = RegisterSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { serial, email, name } = parseResult.data;
    try {
      const unit = await prisma.unit.findFirst({
        where: { OR: [{ serial }, { qrSlug: serial }] },
        include: { drop: true, product: true, currentOwner: { select: { id: true, email: true, name: true } } },
      });
      if (!unit) return sendJson(res, 404, { error: "We couldn't find a kit with that passport code." });
      if (!REGISTERABLE_STATUSES.has(unit.status)) {
        return sendJson(res, 409, {
          error:
            unit.status === 'VOID' || unit.status === 'RETURNED'
              ? 'This passport code is no longer valid.'
              : "This kit hasn't been marked sold yet, so it can't be registered.",
        });
      }

      // Already registered to someone: this is either the owner touching
      // up their own details (free, immediate) or a claim from a different
      // email (a resale/gift, or someone who merely guessed the serial) —
      // which requires the current owner's confirmation before anything
      // changes. First-time registration (unit.status !== 'REGISTERED',
      // i.e. no currentOwner yet) skips all of this and falls through to
      // the direct-write path below, unchanged from before.
      if (unit.status === 'REGISTERED' && unit.currentOwner) {
        const sameOwner = unit.currentOwner.email.toLowerCase() === email;
        if (!sameOwner) {
          const transferToken = sign(
            {
              kind: 'passport-transfer',
              unitId: unit.id,
              currentOwnerCustomerId: unit.currentOwner.id,
              newOwnerEmail: email,
              newOwnerName: name || null,
            },
            PASSPORT_TRANSFER_TOKEN_TTL_SECONDS,
          );
          const confirmLink = `${getSiteOrigin()}/passport/confirm?token=${encodeURIComponent(transferToken)}`;

          await sendPassportTransferEmail({
            toEmail: unit.currentOwner.email,
            productName: unit.product.name,
            unitSerial: unit.serial,
            newOwnerEmail: email,
            confirmLink,
          });

          const message = "We've emailed the current owner to confirm this transfer.";
          // `error` mirrors `message` here (this isn't really a failure —
          // nothing was rejected, a confirmation step was kicked off) so
          // that any caller which only reads the conventional `error`
          // field on a non-2xx response still surfaces the right, friendly
          // copy instead of falling back to a generic message.
          return sendJson(res, 409, { pending: true, message, error: message });
        }
      }

      const customer = await prisma.customer.upsert({
        where: { email },
        update: { name: name || undefined },
        create: { email, name: name || null },
      });

      const updated = await prisma.unit.update({
        where: { id: unit.id },
        data: { currentOwnerCustomerId: customer.id, registeredAt: new Date(), status: 'REGISTERED' },
        include: { drop: true, product: true, currentOwner: { select: { name: true } } },
      });

      // includeOwnerName: true is safe here — this response goes straight
      // back to the person who just performed the registration/self-update
      // themselves, not to an anonymous scanner.
      return sendJson(res, 200, { unit: serializeUnit(updated, { includeOwnerName: true }) });
    } catch (err) {
      console.error('[passport] Registration failed:', err);
      return sendJson(res, 500, { error: 'Unable to register this kit right now.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}
