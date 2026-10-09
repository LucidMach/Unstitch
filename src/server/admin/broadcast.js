// api/admin/broadcast.js
// GET  -> stats for the Broadcasts admin tab: how many subscribers are
//         eligible for the general newsletter, how many are waiting on
//         each product's "notify me" waitlist, and the active product
//         list (id/name/tagline/price/image/kit contents) the composer's
//         "Kit announcement" block picks from.
// POST { mode: "general", blocks, ... }
//         -> sends to every Subscriber with unsubscribedAt = null. Not
//            capped like send-email.js's custom/bulk send (that cap exists
//            to bound a manual paste mistake's blast radius -- this is a
//            deliberate "send my newsletter" action against the real
//            subscriber list), but still sent in small batches rather than
//            all at once, to stay under Resend's rate limit; see
//            BATCH_SIZE/BATCH_DELAY_MS below if that needs tuning.
// POST { mode: "waitlist", productId, blocks, ... }
//         -> sends only to Subscribers with that productId, notifiedAt =
//            null, unsubscribedAt = null (src/server/subscribe.js sets
//            productId when a "notify me" form is for a specific drop --
//            see src/pages/shop-countdown.astro's NEXT_DROP_PRODUCT_SLUG).
//            Each successful send sets that subscriber's notifiedAt, so a
//            second click only reaches anyone new since the last one.
//
// `blocks` is an ordered array of content blocks (see BlockSchema below) --
// this replaced a single free-text `message` field so one send can mix a
// drop announcement, a photo, a raffle-winner shoutout and a call-to-action
// in any order, each still fully editable copy rather than locked-in
// generated text. Both send modes personalize {name} per recipient
// (src/lib/emailTemplate.js's fillMessageVars/fillBlockVars, same as
// send-email.js's custom/bulk send) and add a per-recipient signed
// unsubscribe link (src/server/unsubscribe.js) to every email -- this is
// marketing mail, unlike the order-confirmation sends in send-email.js,
// which never carry one.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { sign } from '../../lib/signedToken.js';
import { getSiteOrigin } from '../../lib/siteOrigin.js';
import prisma from '../../lib/prisma.js';
import {
  brandedEmailHtml,
  fillMessageVars,
  fillBlockVars,
  renderBlocksHtml,
  renderBlocksText,
  DEFAULT_SIGNATURE_NAME,
  DEFAULT_SIGNATURE_ROLE,
  plainTextSignature,
} from '../../lib/emailTemplate.js';
import {
  getGeneralBroadcastDraft,
  setGeneralBroadcastDraft,
  clearGeneralBroadcastDraft,
  getAllWaitlistBroadcastDrafts,
  setWaitlistBroadcastDraft,
  clearWaitlistBroadcastDraft,
} from '../../lib/settings.js';

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

// --- Content blocks -------------------------------------------------
// Every block type's own copy fields (heading/body/headline/caption/
// buttonLabel) are plain admin-written text -- nothing here is
// auto-generated-and-locked, so the "kit" block's headline/body are
// editable overrides of the product's real tagline, not the tagline
// itself, and the admin can rewrite them freely per send.
const TextBlockSchema = z.object({
  type: z.literal('text'),
  heading: z.string().trim().max(200).optional(),
  body: z.string().trim().max(10000).optional(),
  imageUrl: z.string().trim().min(1).max(2000).optional(),
  imageAlt: z.string().trim().max(200).optional(),
  highlightColor: z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour like #f6f4f1').optional(),
});

const ImageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.string().trim().min(1).max(2000),
  alt: z.string().trim().max(200).optional(),
  caption: z.string().trim().max(300).optional(),
  highlightColor: z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour like #f6f4f1').optional(),
});

const KitBlockSchema = z.object({
  type: z.literal('kit'),
  productId: z.string().uuid(),
  headline: z.string().trim().max(200).optional(),
  body: z.string().trim().max(2000).optional(),
  showImage: z.boolean().optional().default(true),
  showPrice: z.boolean().optional().default(true),
  showKitContents: z.boolean().optional().default(false),
  // The button lives on the card itself -- see emailTemplate.js's "kit"
  // case -- rather than needing a separate cta block stacked underneath
  // to put any call-to-action next to the product it's actually about.
  // buttonUrl may be a site-relative path (e.g. "/shop"); resolved to an
  // absolute URL alongside the product photo in resolveBlockImageUrls
  // below, the same way an image block's `url` is.
  buttonLabel: z.string().trim().max(60).optional(),
  buttonUrl: z.string().trim().min(1).max(2000).optional(),
  // Composer's newBlock('kit') pre-fills this with the default card colour
  // so a kit announcement keeps its existing boxed look unless the admin
  // clears it -- the schema itself treats it the same as any other block.
  highlightColor: z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour like #f6f4f1').optional(),
});

const CtaBlockSchema = z.object({
  type: z.literal('cta'),
  heading: z.string().trim().max(200).optional(),
  body: z.string().trim().max(2000).optional(),
  buttonLabel: z.string().trim().max(60).optional(),
  buttonUrl: z.string().trim().url().max(2000).optional(),
  highlightColor: z.string().trim().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour like #f6f4f1').optional(),
});

const BlockSchema = z.discriminatedUnion('type', [TextBlockSchema, ImageBlockSchema, KitBlockSchema, CtaBlockSchema]);

const BroadcastGeneralSchema = z.object({
  mode: z.literal('general'),
  subject: z.string().trim().min(1).max(200),
  blocks: z.array(BlockSchema).min(1).max(20),
  gifUrl: z.string().trim().url().max(2000).optional(),
  signatureName: z.string().trim().max(100).optional(),
  signatureRole: z.string().trim().max(150).optional(),
  preview: z.boolean().optional().default(false),
});

const BroadcastWaitlistSchema = z.object({
  mode: z.literal('waitlist'),
  productId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  blocks: z.array(BlockSchema).min(1).max(20),
  gifUrl: z.string().trim().url().max(2000).optional(),
  signatureName: z.string().trim().max(100).optional(),
  signatureRole: z.string().trim().max(150).optional(),
  preview: z.boolean().optional().default(false),
});

// Drafts (save-draft/clear-draft modes below) are deliberately looser than
// a real send -- a draft can have an empty subject, an incomplete kit
// block with no product chosen yet, zero blocks, whatever's mid-thought
// when the admin clicks away. DraftBlockSchema only bounds field sizes and
// known keys, not business completeness; BlockSchema (above) still gates
// what can actually be sent.
const DraftBlockSchema = z
  .object({
    type: z.enum(['text', 'image', 'kit', 'cta']),
    heading: z.string().max(200).optional(),
    body: z.string().max(10000).optional(),
    imageUrl: z.string().max(2000).optional(),
    imageAlt: z.string().max(200).optional(),
    url: z.string().max(2000).optional(),
    alt: z.string().max(200).optional(),
    caption: z.string().max(300).optional(),
    productId: z.string().max(100).optional(),
    headline: z.string().max(200).optional(),
    showImage: z.boolean().optional(),
    showPrice: z.boolean().optional(),
    showKitContents: z.boolean().optional(),
    buttonLabel: z.string().max(60).optional(),
    buttonUrl: z.string().max(2000).optional(),
    highlightColor: z.string().max(20).optional(),
  })
  .passthrough();

const SaveDraftSchema = z.object({
  mode: z.literal('save-draft'),
  kind: z.enum(['general', 'waitlist']),
  productId: z.string().uuid().optional(),
  subject: z.string().max(200).optional().default(''),
  blocks: z.array(DraftBlockSchema).max(20).optional().default([]),
  gifUrl: z.string().max(2000).optional().default(''),
  signatureName: z.string().max(100).optional().default(''),
  signatureRole: z.string().max(150).optional().default(''),
});

const ClearDraftSchema = z.object({
  mode: z.literal('clear-draft'),
  kind: z.enum(['general', 'waitlist']),
  productId: z.string().uuid().optional(),
});

function nameForSubscriber(sub) {
  return sub.name || sub.email.split('@')[0];
}

function unsubscribeUrlFor(req, subscriberId) {
  const token = sign({ kind: 'unsubscribe', subscriberId }, UNSUBSCRIBE_TOKEN_TTL_SECONDS);
  return `${getSiteOrigin(req)}/unsubscribe?token=${encodeURIComponent(token)}`;
}

// A standalone image block, or a kit block's product photo, can be typed/
// stored as either a full URL or a site-relative path (e.g. the product's
// own `imageUrl`, which defaults to "/slow-bloom-hero.jpg" -- see
// prisma/schema.prisma). Resend has no notion of "relative to this site",
// so anything not already absolute is resolved against the site origin
// before it goes anywhere near an email.
function absoluteUrl(req, urlOrPath) {
  if (!urlOrPath) return urlOrPath;
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return `${getSiteOrigin(req)}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
}

/** Resolves standalone image blocks' `url`, and a kit block's own
 * `buttonUrl` (e.g. a typed "/shop" rather than a full link), to an
 * absolute URL -- see absoluteUrl() above. Returns a new array; doesn't
 * mutate the input. */
function resolveBlockImageUrls(req, blocks) {
  return blocks.map((block) => {
    if (block.type === 'image') return { ...block, url: absoluteUrl(req, block.url) };
    if (block.type === 'kit' && block.buttonUrl) return { ...block, buttonUrl: absoluteUrl(req, block.buttonUrl) };
    return block;
  });
}

/** Same resolution, applied to a kit block's product photo instead --
 * returns a new Map so renderBlocksHtml's "kit" case can keep reading
 * product.imageUrl without knowing about site-relative paths at all. */
function resolveProductImageUrls(req, productsById) {
  return new Map([...productsById].map(([id, product]) => [id, { ...product, imageUrl: absoluteUrl(req, product.imageUrl) }]));
}

/** Loads the Product rows referenced by any "kit" blocks, keyed by id.
 * Returns { productsById, missingProductId } -- missingProductId is set
 * (and the map incomplete) if a block names a product that no longer
 * exists, so the caller can fail the request with a clear reason instead
 * of silently rendering an empty section. */
async function loadProductsForBlocks(blocks) {
  const productIds = [...new Set(blocks.filter((b) => b.type === 'kit').map((b) => b.productId))];
  if (productIds.length === 0) return { productsById: new Map(), missingProductId: null };
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, tagline: true, imageUrl: true, basePriceCents: true, currency: true, kitContents: true },
  });
  const productsById = new Map(products.map((p) => [p.id, p]));
  const missingProductId = productIds.find((id) => !productsById.has(id)) || null;
  return { productsById, missingProductId };
}

/** Renders this send for one recipient — {name} filled in every block's
 * text fields plus the subject, unsubscribe link built from their own id,
 * same shape send-email.js's renderFor() uses. */
function renderFor({ req, subject, blocks, productsById, gifUrl, signatureName, signatureRole, name, subscriberId }) {
  const finalSignatureName = signatureName || DEFAULT_SIGNATURE_NAME;
  const finalSignatureRole = signatureRole || DEFAULT_SIGNATURE_ROLE;
  const filledSubject = fillMessageVars(subject, { name });
  const filledBlocks = fillBlockVars(blocks, { name });
  const unsubscribeUrl = subscriberId != null ? unsubscribeUrlFor(req, subscriberId) : undefined;

  const bodyHtml = renderBlocksHtml(filledBlocks, productsById);
  const bodyText = renderBlocksText(filledBlocks, productsById);

  const fullMessage =
    `${bodyText}${plainTextSignature(finalSignatureName, finalSignatureRole)}` +
    (unsubscribeUrl ? `\n\nUnsubscribe: ${unsubscribeUrl}` : '');

  const html = brandedEmailHtml({
    heading: filledSubject,
    bodyHtml,
    gifUrl,
    signatureName: finalSignatureName,
    signatureRole: finalSignatureRole,
    unsubscribeUrl,
  });
  return { subject: filledSubject, html, text: fullMessage };
}

/** Sequential small batches rather than one giant Promise.all, so a large
 * list doesn't fire everything at Resend at once. */
async function sendInBatches(recipients, sendOne) {
  const results = [];
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

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  if (req.method === 'GET') {
    try {
      const [generalCount, pending, products, generalDraft, waitlistDrafts] = await Promise.all([
        prisma.subscriber.count({ where: { unsubscribedAt: null } }),
        prisma.subscriber.groupBy({
          by: ['productId'],
          where: { productId: { not: null }, notifiedAt: null, unsubscribedAt: null },
          _count: { _all: true },
        }),
        // Powers the "Kit announcement" block's product picker in the
        // composer -- active products only, same set a drop announcement
        // would ever reasonably be about.
        prisma.product.findMany({
          where: { isActive: true },
          select: { id: true, name: true, tagline: true, imageUrl: true, basePriceCents: true, currency: true, kitContents: true },
          orderBy: { name: 'asc' },
        }),
        // Saved composer drafts (src/lib/settings.js) -- handed back in the
        // same GET the Broadcasts tab already makes on load/tab-switch, so
        // the general card and every waitlist card can restore their last
        // saved draft without a separate round trip each.
        getGeneralBroadcastDraft(),
        getAllWaitlistBroadcastDrafts(),
      ]);

      const productIds = pending.map((p) => p.productId).filter(Boolean);
      const waitlistProducts = productIds.length
        ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
        : [];
      const nameById = new Map(waitlistProducts.map((p) => [p.id, p.name]));

      const waitlists = pending
        .map((p) => ({
          productId: p.productId,
          productName: nameById.get(p.productId) || 'Unknown product',
          pendingCount: p._count._all,
        }))
        .sort((a, b) => b.pendingCount - a.pendingCount);

      return sendJson(res, 200, { generalCount, waitlists, products, drafts: { general: generalDraft, waitlist: waitlistDrafts } });
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

  // Draft save/clear are handled before the preview/send gate below --
  // neither needs RESEND_API_KEY configured (saving a draft shouldn't be
  // blocked by email not being set up yet), and neither sends anything.
  if (body?.mode === 'save-draft') {
    const parseResult = SaveDraftSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { kind, productId, subject, blocks, gifUrl, signatureName, signatureRole } = parseResult.data;
    if (kind === 'waitlist' && !productId) {
      return sendJson(res, 400, { error: 'productId is required for a waitlist draft.' });
    }
    try {
      const draft = { subject, blocks, gifUrl, signatureName, signatureRole, savedAt: new Date().toISOString() };
      if (kind === 'general') {
        await setGeneralBroadcastDraft(draft);
      } else {
        await setWaitlistBroadcastDraft(productId, draft);
      }
      return sendJson(res, 200, { ok: true, savedAt: draft.savedAt });
    } catch (err) {
      console.error('[admin/broadcast] Failed to save draft:', err);
      return sendJson(res, 500, { error: 'Failed to save draft.' });
    }
  }

  if (body?.mode === 'clear-draft') {
    const parseResult = ClearDraftSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { kind, productId } = parseResult.data;
    if (kind === 'waitlist' && !productId) {
      return sendJson(res, 400, { error: 'productId is required to clear a waitlist draft.' });
    }
    try {
      if (kind === 'general') {
        await clearGeneralBroadcastDraft();
      } else {
        await clearWaitlistBroadcastDraft(productId);
      }
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[admin/broadcast] Failed to clear draft:', err);
      return sendJson(res, 500, { error: 'Failed to clear draft.' });
    }
  }

  const isPreview = body && body.preview === true;
  if (!isPreview && !process.env.RESEND_API_KEY) {
    return sendJson(res, 503, { error: 'RESEND_API_KEY is not configured.' });
  }

  try {
    const resend = isPreview ? null : new (await import('resend')).Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';

    if (body.mode === 'general') {
      const parseResult = BroadcastGeneralSchema.safeParse(body);
      if (!parseResult.success) {
        const formatted = formatZodError(parseResult.error);
        return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
      }
      const { subject, blocks, gifUrl, signatureName, signatureRole } = parseResult.data;

      const { productsById, missingProductId } = await loadProductsForBlocks(blocks);
      if (missingProductId) {
        return sendJson(res, 400, { error: `A kit block refers to a product that no longer exists (${missingProductId}). Remove or re-pick that block.` });
      }
      const resolvedBlocks = resolveBlockImageUrls(req, blocks);
      const resolvedProductsById = resolveProductImageUrls(req, productsById);

      if (isPreview) {
        const sample = await prisma.subscriber.findFirst({ where: { unsubscribedAt: null }, select: { id: true, name: true, email: true } });
        const { html, text } = renderFor({
          req,
          subject,
          blocks: resolvedBlocks,
          productsById: resolvedProductsById,
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

      const results = await sendInBatches(recipients, async (sub) => {
        const { subject: filledSubject, html, text } = renderFor({
          req,
          subject,
          blocks: resolvedBlocks,
          productsById: resolvedProductsById,
          gifUrl,
          signatureName,
          signatureRole,
          name: nameForSubscriber(sub),
          subscriberId: sub.id,
        });
        try {
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
      const { productId, subject, blocks, gifUrl, signatureName, signatureRole } = parseResult.data;

      const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
      if (!product) return sendJson(res, 404, { error: 'Product not found.' });

      const { productsById, missingProductId } = await loadProductsForBlocks(blocks);
      if (missingProductId) {
        return sendJson(res, 400, { error: `A kit block refers to a product that no longer exists (${missingProductId}). Remove or re-pick that block.` });
      }
      const resolvedBlocks = resolveBlockImageUrls(req, blocks);
      const resolvedProductsById = resolveProductImageUrls(req, productsById);

      const where = { productId, notifiedAt: null, unsubscribedAt: null };

      if (isPreview) {
        const sample = await prisma.subscriber.findFirst({ where, select: { id: true, name: true, email: true } });
        const { html, text } = renderFor({
          req,
          subject,
          blocks: resolvedBlocks,
          productsById: resolvedProductsById,
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

      const results = await sendInBatches(recipients, async (sub) => {
        const { subject: filledSubject, html, text } = renderFor({
          req,
          subject,
          blocks: resolvedBlocks,
          productsById: resolvedProductsById,
          gifUrl,
          signatureName,
          signatureRole,
          name: nameForSubscriber(sub),
          subscriberId: sub.id,
        });
        try {
          const result = await resend.emails.send({ from: fromEmail, to: sub.email, subject: filledSubject, html, text });
          if (result.error) {
            return { email: sub.email, id: sub.id, ok: false, error: result.error.message || result.error.name || 'unknown reason' };
          }
          // Marked notified only on a confirmed-sent email, so a failed
          // send leaves this subscriber eligible for the next attempt
          // rather than silently skipping them forever.
          await prisma.subscriber.update({ where: { id: sub.id }, data: { notifiedAt: new Date() } });
          return { email: sub.email, id: sub.id, ok: true };
        } catch (err) {
          return { email: sub.email, id: sub.id, ok: false, error: err instanceof Error ? err.message : 'Send failed' };
        }
      });

      const failed = results.filter((r) => !r.ok);
      const sent = results.filter((r) => r.ok);
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
