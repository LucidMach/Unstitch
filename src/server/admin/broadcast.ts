// api/admin/broadcast.js
// GET  -> stats for the Broadcasts admin tab: how many subscribers are
//         eligible for the general newsletter, and (per product) how many
//         are waiting on that product's "notify me" waitlist.
// POST { mode: "general", subject, message, ... }
//         -> sends to every Subscriber with unsubscribedAt = null. Not
//            capped like send-email.js's custom/bulk send (that cap exists
//            to bound a manual paste mistake's blast radius -- this is a
//            deliberate "send my newsletter" action against the real
//            subscriber list), but still sent in small batches rather than
//            all at once, to stay under Resend's rate limit; see
//            BATCH_SIZE/BATCH_DELAY_MS below if that needs tuning.
// POST { mode: "waitlist", productId, subject, message, ... }
//         -> sends only to Subscribers with that productId, notifiedAt =
//            null, unsubscribedAt = null (src/server/subscribe.js sets
//            productId when a "notify me" form is for a specific drop --
//            see src/pages/shop-countdown.astro's NEXT_DROP_PRODUCT_SLUG).
//            Each successful send sets that subscriber's notifiedAt, so a
//            second click only reaches anyone new since the last one.
//
// Both send modes personalize {name} per recipient (src/lib/emailTemplate.js's
// fillMessageVars, same as send-email.js's custom/bulk send) and add a
// per-recipient signed unsubscribe link (src/server/unsubscribe.js) to
// every email -- this is marketing mail, unlike the order-confirmation
// sends in send-email.js, which never carry one.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { sign } from '../../lib/signedToken.js';
import { getSiteOrigin } from '../../lib/siteOrigin.js';
import prisma from '../../lib/prisma.js';
import { renderPersonalizedEmail, GENERAL_FROM_EMAIL } from '../../lib/emailTemplate.js';

// A signed unsubscribe link needs to keep working for as long as someone
// might still have the email sitting in their inbox -- long enough that
// "it expired" is never the reason an unsubscribe click fails.
const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 2 * 365 * 24 * 60 * 60; // ~2 years

// Resend's own rate limit isn't hardcoded here -- if real sends start
// getting 429s back, lower BATCH_SIZE and/or raise BATCH_DELAY_MS.
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300;
// Defensive sanity cap, not a real expected ceiling -- catches a runaway
// query rather than a deliberately large but legitimate send.
const MAX_SEND = 5000;

const BroadcastGeneralSchema = z.object({
  mode: z.literal('general'),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10000),
  gifUrl: z.string().trim().url().max(2000).optional(),
  signatureName: z.string().trim().max(100).optional(),
  signatureRole: z.string().trim().max(150).optional(),
  preview: z.boolean().optional().default(false),
});

const BroadcastWaitlistSchema = z.object({
  mode: z.literal('waitlist'),
  productId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10000),
  gifUrl: z.string().trim().url().max(2000).optional(),
  signatureName: z.string().trim().max(100).optional(),
  signatureRole: z.string().trim().max(150).optional(),
  preview: z.boolean().optional().default(false),
});

function nameForSubscriber(sub: { name?: string | null; email: string }) {
  return sub.name || sub.email.split('@')[0];
}

function unsubscribeUrlFor(req: any, subscriberId: string) {
  const token = sign({ kind: 'unsubscribe', subscriberId }, UNSUBSCRIBE_TOKEN_TTL_SECONDS);
  return `${getSiteOrigin(req)}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Renders this send for one recipient — {name} filled, plus an
 * unsubscribe link built from their own id (the one real difference from
 * send-email.js's transactional sends — see renderPersonalizedEmail). */
function renderFor({
  req,
  subject,
  message,
  gifUrl,
  signatureName,
  signatureRole,
  name,
  subscriberId,
}: {
  req: any;
  subject: string;
  message: string;
  gifUrl?: string;
  signatureName?: string;
  signatureRole?: string;
  name: string;
  subscriberId?: string;
}) {
  const unsubscribeUrl = subscriberId != null ? unsubscribeUrlFor(req, subscriberId) : undefined;
  return renderPersonalizedEmail({ subject, message, gifUrl, signatureName, signatureRole, name, unsubscribeUrl });
}

/** Sequential small batches rather than one giant Promise.all, so a large
 * list doesn't fire everything at Resend at once. */
async function sendInBatches<T, R>(recipients: T[], sendOne: (recipient: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(sendOne));
    results.push(...batchResults);
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  return results;
}

export default async function handler(req: any, res: any): Promise<any> {
  if (!requireAdmin(req, res)) return;
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'GET') {
    try {
      const [generalCount, pending] = await Promise.all([
        prisma.subscriber.count({ where: { unsubscribedAt: null } }),
        prisma.subscriber.groupBy({
          by: ['productId'],
          where: { productId: { not: null }, notifiedAt: null, unsubscribedAt: null },
          _count: { _all: true },
        }),
      ]);

      const productIds = pending.map((p: any) => p.productId).filter(Boolean);
      const products = productIds.length
        ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
        : [];
      const nameById = new Map(products.map((p: any) => [p.id, p.name]));

      const waitlists = pending
        .map((p: any) => ({
          productId: p.productId,
          productName: nameById.get(p.productId) || 'Unknown product',
          pendingCount: p._count._all,
        }))
        .sort((a: any, b: any) => b.pendingCount - a.pendingCount);

      return sendJson(res, 200, { generalCount, waitlists });
    } catch (err) {
      console.error('[admin/broadcast] GET failed:', err);
      return sendJson(res, 500, { error: 'Failed to load broadcast stats.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const rateResult = checkRateLimit(req, { limit: 10, windowMs: 60000, prefix: 'admin-broadcast' });
  if (!rateResult.success) {
    return sendJson(res, 429, { error: 'Too many broadcast actions recently. Please wait a moment.' });
  }

  const body = parseRequestBody(req);
  const isPreview = body && body.preview === true;
  if (!isPreview && !process.env.RESEND_API_KEY) {
    return sendJson(res, 503, { error: 'RESEND_API_KEY is not configured.' });
  }

  try {
    const resend = isPreview ? null : new (await import('resend')).Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || GENERAL_FROM_EMAIL;

    if (body.mode === 'general') {
      const parseResult = BroadcastGeneralSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const { subject, message, gifUrl, signatureName, signatureRole } = parseResult.data;

      if (isPreview) {
        const sample = await prisma.subscriber.findFirst({ where: { unsubscribedAt: null }, select: { id: true, name: true, email: true } });
        const { html, text } = renderFor({
          req,
          subject,
          message,
          gifUrl,
          signatureName,
          signatureRole,
          name: sample ? nameForSubscriber(sample) : 'there',
          subscriberId: sample?.id,
        });
        return sendJson(res, 200, { ok: true, preview: true, html, text });
      }

      const recipients = await prisma.subscriber.findMany({
        where: { unsubscribedAt: null },
        select: { id: true, name: true, email: true },
      });
      if (recipients.length === 0) {
        return sendJson(res, 400, { error: 'No subscribers to send to yet.' });
      }
      if (recipients.length > MAX_SEND) {
        return sendJson(res, 400, { error: `Subscriber list (${recipients.length}) is larger than this endpoint's safety cap (${MAX_SEND}) — get in touch before sending a list this size.` });
      }

      const results = await sendInBatches(recipients, async (sub: any) => {
        const { subject: filledSubject, html, text } = renderFor({
          req,
          subject,
          message,
          gifUrl,
          signatureName,
          signatureRole,
          name: nameForSubscriber(sub),
          subscriberId: sub.id,
        });
        try {
          if (!resend) throw new Error('Resend is not configured');
          const result = await resend.emails.send({ from: fromEmail, to: sub.email, subject: filledSubject, html, text });
          if (result.error) {
            return { email: sub.email, ok: false, error: result.error.message || result.error.name || 'unknown reason' };
          }
          return { email: sub.email, ok: true };
        } catch (err) {
          return { email: sub.email, ok: false, error: err instanceof Error ? err.message : 'Send failed' };
        }
      });

      const failed = results.filter((r) => !r.ok);
      const sent = results.filter((r) => r.ok);
      if (failed.length > 0) console.error('[admin/broadcast] Some general-send emails failed:', failed);

      return sendJson(res, 200, { ok: true, sent: sent.length, failed: failed.map((f) => ({ email: f.email, error: f.error })), total: recipients.length });
    }

    if (body.mode === 'waitlist') {
      const parseResult = BroadcastWaitlistSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const { productId, subject, message, gifUrl, signatureName, signatureRole } = parseResult.data;

      const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
      if (!product) return sendJson(res, 404, { error: 'Product not found.' });

      const where = { productId, notifiedAt: null, unsubscribedAt: null };

      if (isPreview) {
        const sample = await prisma.subscriber.findFirst({ where, select: { id: true, name: true, email: true } });
        const { html, text } = renderFor({
          req,
          subject,
          message,
          gifUrl,
          signatureName,
          signatureRole,
          name: sample ? nameForSubscriber(sample) : 'there',
          subscriberId: sample?.id,
        });
        return sendJson(res, 200, { ok: true, preview: true, html, text, productName: product.name });
      }

      const recipients = await prisma.subscriber.findMany({ where, select: { id: true, name: true, email: true } });
      if (recipients.length === 0) {
        return sendJson(res, 400, { error: `No one on ${product.name}'s waitlist to notify.` });
      }
      if (recipients.length > MAX_SEND) {
        return sendJson(res, 400, { error: `Waitlist (${recipients.length}) is larger than this endpoint's safety cap (${MAX_SEND}) — get in touch before sending a list this size.` });
      }

      const results = await sendInBatches(recipients, async (sub: any) => {
        const { subject: filledSubject, html, text } = renderFor({
          req,
          subject,
          message,
          gifUrl,
          signatureName,
          signatureRole,
          name: nameForSubscriber(sub),
          subscriberId: sub.id,
        });
        try {
          if (!resend) throw new Error('Resend is not configured');
          const result = await resend.emails.send({ from: fromEmail, to: sub.email, subject: filledSubject, html, text });
          if (result.error) {
            return { email: sub.email, id: sub.id, ok: false, error: result.error.message || result.error.name || 'unknown reason' };
          }
          return { email: sub.email, id: sub.id, ok: true };
        } catch (err) {
          return { email: sub.email, id: sub.id, ok: false, error: err instanceof Error ? err.message : 'Send failed' };
        }
      });

      const failed = results.filter((r) => !r.ok);
      const sent = results.filter((r) => r.ok);
      // Marked notified only for confirmed-sent emails, so a failed send
      // leaves that subscriber eligible for the next attempt rather than
      // silently skipping them forever. One updateMany instead of one
      // update() per recipient inside the batch loop above.
      if (sent.length > 0) {
        await prisma.subscriber.updateMany({ where: { id: { in: sent.map((r) => r.id) } }, data: { notifiedAt: new Date() } });
      }
      if (failed.length > 0) console.error('[admin/broadcast] Some waitlist-notify emails failed:', failed);

      return sendJson(res, 200, {
        ok: true,
        sent: sent.length,
        failed: failed.map((f) => ({ email: f.email, error: f.error })),
        total: recipients.length,
        productName: product.name,
      });
    }

    return sendJson(res, 400, { error: 'Unknown mode.' });
  } catch (err) {
    console.error('[admin/broadcast] POST failed:', err);
    return sendJson(res, 500, { error: 'Something went wrong sending the broadcast.' });
  }
}
