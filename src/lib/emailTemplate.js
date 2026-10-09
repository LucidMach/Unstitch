// src/lib/emailTemplate.js
// Shared HTML shell for every branded email Unstitch sends via Resend
// (order confirmations, the admin custom/bulk send tool). Mirrors the look
// already established elsewhere (e.g. the "You're in the Raffle Draw!"
// email) and the live site's own brand.css tokens — see the --ink/--accent/
// --accent-pale values there. Every call site still passes a plain-text
// `text` body to Resend alongside this `html` — email clients that block
// images/CSS, and anyone on a text-only client, fall back to that.
//
// Font note: brand.css loads Space Grotesk (headings) + Inter (body) from
// Google Fonts — that's the actual current site font, not the true brand
// typefaces (Avenue X / Avenir Next Cyr), which are commercial fonts not
// available via Google Fonts and would need real font files + a license to
// self-host, on the site or in email. It's moot for email specifically:
// most email clients (Outlook, and many mobile mail apps) ignore @import/
// @font-face entirely and always fall back to system fonts regardless of
// what's requested, so a close web-safe fallback (below) is what actually
// renders almost everywhere, with the Google-Fonts @import as a bonus for
// the handful of clients (Apple Mail, some Gmail contexts) that honour it.

const FONT_DISPLAY =
  "'Space Grotesk', Futura, 'Century Gothic', Avenir, 'Avenir Next', sans-serif";
const FONT_BODY = "'Inter', Avenir, 'Avenir Next', 'Segoe UI', Helvetica, Arial, sans-serif";

const INK = '#111111';
const PAPER = '#ffffff';
const ACCENT = '#A36E93';
const ACCENT_PALE = '#eedfe9';
const MUTED = '#666666';
const BG = '#f6f4f1';

/** Minimal HTML-escaping for values interpolated into markup below. Exported so call sites that build their own bodyHtml (e.g. a free-text admin message) can escape user-typed content before wrapping it in tags. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * @param {object} opts
 * @param {string} [opts.eyebrow] - small uppercase label above the heading, e.g. "Order confirmed"
 * @param {string} opts.heading - the main headline
 * @param {string} opts.bodyHtml - pre-built HTML for the main copy (e.g. "<p>...</p><p>...</p>")
 * @param {{title?: string, rows: {label: string, value: string}[]}} [opts.infoBox] - optional label:value box (order details, draw details, etc.)
 * @param {{label: string, href: string}} [opts.cta] - optional black pill button
 * @param {string} [opts.gifUrl] - optional hosted gif shown just above the sign-off (e.g. for a workshop/new-contact welcome note). Must be a public URL — Resend doesn't host attachments as inline images here.
 * @param {boolean} [opts.includeSignature] - defaults true; the standard Astra/Designer sign-off + social links
 * @param {string} [opts.signatureName] - overrides "Astra" for this send only
 * @param {string} [opts.signatureRole] - overrides "Designer at Unstitch" for this send only
 * @returns {string} full HTML document, ready to pass as Resend's `html` field
 */
export function brandedEmailHtml({
  eyebrow,
  heading,
  bodyHtml,
  infoBox,
  cta,
  gifUrl,
  includeSignature = true,
  signatureName = 'Astra',
  signatureRole = 'Designer at Unstitch',
  // Set only for broadcast/newsletter and waitlist-notify sends (see
  // src/server/admin/broadcast.js) -- never for transactional mail (order
  // confirmations, shipped/delivered notices), which isn't marketing and
  // shouldn't offer to opt out of being told about an order you placed.
  unsubscribeUrl,
}) {
  const infoBoxHtml = infoBox
    ? `
    <div style="background:${ACCENT_PALE};border-radius:10px;padding:20px 22px;margin:24px 0;">
      ${infoBox.title ? `<p style="margin:0 0 12px;font-family:${FONT_BODY};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b4a5f;">${esc(infoBox.title)}</p>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT_BODY};font-size:14px;color:${INK};">
        ${infoBox.rows
          .map(
            (row) => `
        <tr>
          <td style="padding:4px 0;color:${MUTED};width:110px;vertical-align:top;">${esc(row.label)}</td>
          <td style="padding:4px 0;font-weight:600;vertical-align:top;">${esc(row.value)}</td>
        </tr>`,
          )
          .join('')}
      </table>
    </div>`
    : '';

  const ctaHtml = cta
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 4px;">
      <tr><td style="border-radius:999px;background:${INK};">
        <a href="${esc(cta.href)}" style="display:inline-block;padding:13px 30px;font-family:${FONT_BODY};font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${PAPER};text-decoration:none;">${esc(cta.label)}</a>
      </td></tr>
    </table>`
    : '';

  const gifHtml = gifUrl
    ? `<img src="${esc(gifUrl)}" alt="" width="240" style="display:block;margin:18px 0;border-radius:8px;max-width:100%;" />`
    : '';

  const signatureHtml = includeSignature
    ? `
    <p style="margin:0 0 4px;font-family:${FONT_BODY};font-size:14px;color:${INK};">Warm regards,</p>
    <p style="margin:0 0 2px;font-family:${FONT_DISPLAY};font-size:15px;font-weight:700;color:${INK};">${esc(signatureName)}</p>
    <p style="margin:0 0 14px;font-family:${FONT_BODY};font-size:13px;color:${MUTED};">${esc(signatureRole)}</p>
    ${gifHtml}
    <p style="margin:0;font-family:${FONT_BODY};font-size:12px;color:${MUTED};">
      <a href="https://unstitchx.com" style="color:${INK};text-decoration:underline;">unstitchx.com</a> ·
      <a href="https://www.linkedin.com/company/unstitchx" style="color:${INK};text-decoration:underline;">LinkedIn</a> ·
      <a href="https://www.instagram.com/unstitchxfactory/" style="color:${INK};text-decoration:underline;">@unstitchxfactory</a>
    </p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(heading)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
  body { margin:0; background:${BG}; }
  a { color: inherit; }
</style>
</head>
<body style="margin:0;background:${BG};">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:${PAPER};border-radius:14px;padding:36px 32px;border:1px solid #eee;">
      <p style="margin:0 0 4px;font-family:${FONT_DISPLAY};font-size:13px;font-weight:700;letter-spacing:0.02em;color:${INK};">✕ UNSTITCH</p>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0 24px;" />
      ${eyebrow ? `<p style="margin:0 0 6px;font-family:${FONT_BODY};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT};">${esc(eyebrow)}</p>` : ''}
      <h1 style="margin:0 0 18px;font-family:${FONT_DISPLAY};font-size:24px;font-weight:700;color:${INK};line-height:1.25;">${esc(heading)}</h1>
      <div style="font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:#333;">${bodyHtml}</div>
      ${infoBoxHtml}
      ${ctaHtml ? `<div style="text-align:center;">${ctaHtml}</div>` : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0 22px;" />
      ${signatureHtml}
    </div>
    <p style="text-align:center;font-family:${FONT_BODY};font-size:11px;color:#999;margin:20px 0 0;">Unstitch — Naarm, Melbourne Australia</p>
    ${
      unsubscribeUrl
        ? `<p style="text-align:center;font-family:${FONT_BODY};font-size:11px;color:#999;margin:6px 0 0;"><a href="${esc(unsubscribeUrl)}" style="color:#999;text-decoration:underline;">Unsubscribe</a> from these emails</p>`
        : ''
    }
  </div>
</body>
</html>`;
}

/**
 * Fills {name}-style placeholders in an admin-written message (an
 * order-confirmation note, a saved template from the Email templates
 * library) so the admin can write one template once instead of retyping
 * the customer's name into every send. A placeholder with no matching
 * var (a typo, or a var this call site doesn't supply) is left as
 * literal text rather than silently disappearing, so a mistake shows up
 * in the preview instead of going out unnoticed. Runs before esc(), so
 * the substituted value still gets HTML-escaped downstream like the
 * rest of the message.
 */
export function fillMessageVars(template, vars) {
  if (!template) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}

/**
 * Newsletter/broadcast content blocks (src/server/admin/broadcast.js).
 * A broadcast is an ordered list of these rather than one free-text
 * `message`, so a single send can mix a drop announcement, a photo, a
 * raffle-winner shoutout and a call-to-action in any order -- every
 * block's own heading/body/caption copy is still plain admin-written
 * text, never auto-generated-and-locked, even the "kit" block's
 * headline/body, which only default from the product's real name/
 * tagline and can be freely rewritten per send.
 *
 * Block shapes (all fields besides `type` optional unless noted):
 *   { type: 'text', heading?, body?, imageUrl?, imageAlt? }
 *   { type: 'image', url (required), alt?, caption? }
 *   { type: 'kit', productId (required), headline?, body?, showImage?, showPrice?, showKitContents? }
 *   { type: 'cta', heading?, body?, buttonLabel?, buttonUrl? }
 *
 * `productsById` is a Map<string, {name, tagline, imageUrl, basePriceCents,
 * currency, kitContents}> for every productId a "kit" block references --
 * see src/server/admin/broadcast.js's loadProductsForBlocks(). A kit block
 * whose product isn't in the map (shouldn't happen -- the caller checks
 * for a missing product before calling this) renders as nothing rather
 * than crashing the whole send.
 */

function formatBlockPrice(cents, currency) {
  return `${(currency || 'AUD').toUpperCase()} $${(cents / 100).toFixed(2)}`;
}

function kitContentLine(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && 'item' in entry) return String(entry.item);
  return String(entry ?? '');
}

/**
 * A very small, email-safe markdown subset -- **bold** and *italic*
 * (or _italic_) -- so an admin can emphasise a word or two in a plain
 * textarea without a rich-text editor. Always call this AFTER esc(): the
 * delimiters (*, _) aren't HTML-special so escaping first and matching
 * second can't be used to break out of the escaped text, and it keeps
 * every call site's existing esc() call doing the same job it always
 * did. Deliberately minimal -- two rules, no nested/overlapping-emphasis
 * handling -- to match what a plain textarea can realistically produce.
 */
function applyInlineMarkup(escapedText) {
  return escapedText
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

function textParagraphsHtml(body) {
  return (body || '')
    .split(/\n{2,}/)
    .filter((para) => para.trim().length > 0)
    .map((para) => `<p style="margin:0 0 14px;">${applyInlineMarkup(esc(para)).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/**
 * Wraps a block's inner HTML in a shaded, rounded card when the block has
 * a `highlightColor` set -- every block type can be optionally boxed this
 * way, not just the "kit" block, and the admin picks the colour per block
 * (see the composer's "Highlight this section" control). Returns the
 * inner HTML unchanged when there's no highlight colour.
 */
function withHighlight(innerHtml, highlightColor) {
  if (!highlightColor) return innerHtml;
  return `
    <div style="background:${esc(highlightColor)};border-radius:12px;padding:18px 20px 4px;margin:18px 0 22px;">
      ${innerHtml}
    </div>`;
}

/** The same black pill button used by brandedEmailHtml's top-level `cta`
 * and the standalone "cta" block -- shared here so the "kit" block's own
 * button (below) renders identically rather than drifting. */
function pillButtonHtml(label, url) {
  // 16px bottom margin so the button has real breathing room below it --
  // a boxed block's own bottom padding is deliberately small (4px, see
  // withHighlight) to avoid doubling up with a paragraph's own bottom
  // margin, but a button has none of its own, so it was sitting right on
  // the box's edge without this.
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px auto 16px;"><tr><td style="border-radius:999px;background:${INK};"><a href="${esc(url)}" style="display:inline-block;padding:13px 30px;font-family:${FONT_BODY};font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${PAPER};text-decoration:none;">${esc(label)}</a></td></tr></table>`;
}

function blockHtml(block, productsById) {
  // A heading's own top margin (breathing room from whatever came before
  // it) doubles up with withHighlight()'s box padding once a block is
  // boxed, leaving a visibly oversized gap above the heading -- so boxed
  // headings/images drop their top margin and let the box's padding do
  // that job instead.
  const boxed = !!block.highlightColor;

  switch (block.type) {
    case 'text': {
      const headingHtml = block.heading
        ? `<h2 style="margin:${boxed ? 0 : 22}px 0 10px;font-family:${FONT_DISPLAY};font-size:18px;font-weight:700;color:${INK};">${esc(block.heading)}</h2>`
        : '';
      const imageHtml = block.imageUrl
        ? `<img src="${esc(block.imageUrl)}" alt="${esc(block.imageAlt || '')}" width="536" style="display:block;width:100%;max-width:100%;border-radius:10px;margin:${boxed || block.heading ? 0 : 14}px 0 14px;" />`
        : '';
      return withHighlight(`${headingHtml}${imageHtml}${textParagraphsHtml(block.body)}`, block.highlightColor);
    }
    case 'image': {
      const captionHtml = block.caption
        ? `<p style="margin:8px 0 18px;font-family:${FONT_BODY};font-size:12px;color:${MUTED};text-align:center;">${esc(block.caption)}</p>`
        : '';
      return withHighlight(
        `<img src="${esc(block.url)}" alt="${esc(block.alt || '')}" width="536" style="display:block;width:100%;max-width:100%;border-radius:10px;margin:${boxed ? 0 : 14}px 0 0;" />${captionHtml}`,
        block.highlightColor,
      );
    }
    case 'kit': {
      const product = productsById.get(block.productId);
      if (!product) return '';
      const headline = block.headline || `New drop: ${product.name}`;
      const bodyText = block.body || product.tagline || '';
      const imageHtml = block.showImage && product.imageUrl
        ? `<img src="${esc(product.imageUrl)}" alt="${esc(product.name)}" width="496" style="display:block;width:100%;max-width:100%;border-radius:10px;margin:0 0 14px;" />`
        : '';
      const priceHtml = block.showPrice
        ? `<p style="margin:0 0 10px;font-family:${FONT_DISPLAY};font-size:16px;font-weight:700;color:${INK};">${esc(formatBlockPrice(product.basePriceCents, product.currency))}</p>`
        : '';
      const contentsHtml = block.showKitContents && Array.isArray(product.kitContents) && product.kitContents.length
        ? `<ul style="margin:0 0 14px;padding-left:20px;font-family:${FONT_BODY};font-size:13px;color:#333;">${product.kitContents
            .map((item) => `<li style="margin:0 0 4px;">${esc(kitContentLine(item))}</li>`)
            .join('')}</ul>`
        : '';
      // The button lives inside the kit card itself (not a separate block
      // stacked underneath) so it's visually attached to the product it's
      // actually for -- "Shop now"/"Add to bag" style, straight to the
      // product page.
      const buttonHtml = block.buttonLabel && block.buttonUrl
        ? `<div style="text-align:center;">${pillButtonHtml(block.buttonLabel, block.buttonUrl)}</div>`
        : '';
      return withHighlight(
        `<h2 style="margin:0 0 8px;font-family:${FONT_DISPLAY};font-size:18px;font-weight:700;color:${INK};">${esc(headline)}</h2>
      ${imageHtml}
      ${priceHtml}
      ${bodyText ? `<p style="margin:0 0 14px;">${applyInlineMarkup(esc(bodyText)).replace(/\n/g, '<br/>')}</p>` : ''}
      ${contentsHtml}
      ${buttonHtml}`,
        block.highlightColor,
      );
    }
    case 'cta': {
      const headingHtml = block.heading
        ? `<h2 style="margin:${boxed ? 0 : 22}px 0 10px;font-family:${FONT_DISPLAY};font-size:18px;font-weight:700;color:${INK};">${esc(block.heading)}</h2>`
        : '';
      const bodyHtml = block.body ? `<p style="margin:0 0 16px;">${applyInlineMarkup(esc(block.body)).replace(/\n/g, '<br/>')}</p>` : '';
      const buttonHtml = block.buttonLabel && block.buttonUrl ? pillButtonHtml(block.buttonLabel, block.buttonUrl) : '';
      return withHighlight(`${headingHtml}${bodyHtml}${buttonHtml ? `<div style="text-align:center;">${buttonHtml}</div>` : ''}`, block.highlightColor);
    }
    default:
      return '';
  }
}

function blockText(block, productsById) {
  switch (block.type) {
    case 'text':
      return [block.heading, block.body].filter(Boolean).join('\n');
    case 'image':
      return block.caption ? `[image: ${block.caption}]` : '[image]';
    case 'kit': {
      const product = productsById.get(block.productId);
      if (!product) return '';
      const lines = [block.headline || `New drop: ${product.name}`];
      if (block.showPrice) lines.push(formatBlockPrice(product.basePriceCents, product.currency));
      const bodyText = block.body || product.tagline;
      if (bodyText) lines.push(bodyText);
      if (block.showKitContents && Array.isArray(product.kitContents)) {
        for (const item of product.kitContents) lines.push(`- ${kitContentLine(item)}`);
      }
      if (block.buttonLabel && block.buttonUrl) lines.push(`${block.buttonLabel}: ${block.buttonUrl}`);
      return lines.filter(Boolean).join('\n');
    }
    case 'cta':
      return [block.heading, block.body, block.buttonLabel && block.buttonUrl ? `${block.buttonLabel}: ${block.buttonUrl}` : null]
        .filter(Boolean)
        .join('\n');
    default:
      return '';
  }
}

/** Renders an ordered block list into the HTML that goes inside
 * brandedEmailHtml's `bodyHtml` slot. See the block-shapes comment above. */
export function renderBlocksHtml(blocks, productsById) {
  return blocks.map((block) => blockHtml(block, productsById)).join('');
}

/** Plain-text counterpart to renderBlocksHtml, for the `text` fallback
 * every Resend send carries alongside its `html`. */
export function renderBlocksText(blocks, productsById) {
  return blocks.map((block) => blockText(block, productsById)).filter(Boolean).join('\n\n');
}

/** Applies fillMessageVars (the {name}-style placeholder fill) to every
 * editable text field across a block list, so {name} works inside any
 * block's heading/body/caption/button label, not just a single top-level
 * message. Structural fields (type, productId, url, buttonUrl, the
 * showImage/showPrice/showKitContents toggles) are left untouched. */
export function fillBlockVars(blocks, vars) {
  return blocks.map((block) => {
    const filled = { ...block };
    for (const key of ['heading', 'body', 'headline', 'caption', 'buttonLabel']) {
      if (typeof filled[key] === 'string') filled[key] = fillMessageVars(filled[key], vars);
    }
    return filled;
  });
}


// Default sign-off for a free-composed send (the admin's custom/bulk
// email, and the newsletter/waitlist broadcasts) — overridable per-send
// via signatureName/signatureRole. Not used for order-confirmation-style
// mail, which already closes with its own business sign-off baked into
// orderConfirmationEmail().
export const DEFAULT_SIGNATURE_NAME = 'Astra';
export const DEFAULT_SIGNATURE_ROLE = 'Designer at Unstitch';

export function plainTextSignature(name, role) {
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

/**
 * Public AusPost tracking-lookup URL for a given consignment/tracking
 * number — used both here (shipped email) and in the admin order detail
 * panel / customer order-lookup page, so all three always point at the
 * same URL shape. Works for any tracking number typed into the admin
 * panel; AusPost's own lookup page handles unrecognized codes gracefully.
 */
export function auspostTrackingUrl(trackingNumber) {
  return `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(trackingNumber)}`;
}

/** Formats a delivery address down to one readable line for the email. */
function formatAddressLine(addr) {
  if (!addr) return null;
  return [addr.line1, addr.line2, [addr.suburb, addr.state, addr.postcode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

/**
 * The default intro paragraph for every automatic checkout confirmation
 * (api/stripe-webhook.js) — there's no admin present at the moment a real
 * Stripe checkout completes, so unlike a manual order there's nowhere to
 * type a one-off message. To change the wording every future confirmation
 * uses, edit this constant and sync/commit as usual — no database change or
 * migration needed, same pattern as src/lib/deliveryZones.js's postcode
 * lists and src/lib/shipping.js's day counts. A specific order can still
 * override it — see the `message` param below — from a manual order
 * (api/admin/manual-order.js) or a future one-off resend.
 */
export const DEFAULT_ORDER_MESSAGE =
  "Every Slow Bloom kit is made to order — please allow 5–7 business days to prepare before it ships. We'll follow up with tracking once it's on its way.";

/**
 * The one order-confirmation email, built once here so api/stripe-webhook.js
 * (the original send) and api/admin/send-email.js's "resend confirmation"
 * action can never quietly drift into two different-looking emails for the
 * same event.
 *
 * No exact ship date is shown — Slow Bloom kits are made to order (5–7
 * business days to prepare, see src/lib/shipping.js), so the copy sets that
 * expectation as a range rather than promising a specific date customers
 * could hold us to.
 *
 * @param {object} opts
 * @param {string} opts.orderNumber
 * @param {number} opts.totalCents
 * @param {string} opts.currency
 * @param {string} opts.lookupLink
 * @param {{name: string, quantity: number}[]} [opts.items] - product breakdown
 * @param {string} [opts.deliveryMethodLabel] - e.g. "Australia Post", "Self-delivery", "Pickup"
 * @param {number} [opts.deliveryFeeCents] - shown as "Free" when 0
 * @param {{line1: string, line2?: string, suburb: string, state: string, postcode: string}} [opts.deliveryAddress]
 * @param {string} [opts.message] - replaces the default made-to-order paragraph with admin-authored text (e.g. for a commission/workshop order) — may contain \n\n-separated paragraphs, escaped and wrapped the same way api/admin/send-email.js's custom mode does
 * @param {string} [opts.signatureName] - overrides "Astra" for this send only
 * @param {string} [opts.signatureRole] - overrides "Designer at Unstitch" for this send only
 * @param {string} [opts.gifUrl] - optional sign-off gif, same as the custom-email send
 * @returns {{html: string, text: string}}
 */
export function orderConfirmationEmail({
  orderNumber,
  totalCents,
  currency,
  lookupLink,
  items,
  deliveryMethodLabel,
  deliveryFeeCents,
  deliveryAddress,
  message,
  signatureName,
  signatureRole,
  gifUrl,
}) {
  const amount = (totalCents / 100).toFixed(2);
  const itemsLine =
    Array.isArray(items) && items.length
      ? items.map((it) => (it.quantity > 1 ? `${it.name} × ${it.quantity}` : it.name)).join(', ')
      : null;
  const deliveryLine = deliveryMethodLabel
    ? `${deliveryMethodLabel}${
        typeof deliveryFeeCents === 'number'
          ? ` (${deliveryFeeCents > 0 ? `${currency.toUpperCase()} $${(deliveryFeeCents / 100).toFixed(2)}` : 'Free'})`
          : ''
      }`
    : null;
  const addressLine = formatAddressLine(deliveryAddress);

  const rows = [{ label: 'Order number', value: orderNumber }];
  if (itemsLine) rows.push({ label: 'Items', value: itemsLine });
  if (deliveryLine) rows.push({ label: 'Delivery', value: deliveryLine });
  if (addressLine) rows.push({ label: 'Shipping to', value: addressLine });
  rows.push({ label: 'Total', value: `${currency.toUpperCase()} $${amount}` });

  // A custom message (e.g. for a commission or workshop order entered via
  // api/admin/manual-order.js) replaces the default paragraph entirely
  // rather than appending to it — the admin is writing the whole note to
  // this specific customer, not adding a postscript to the stock copy.
  const bodyHtml = message
    ? message
        .split(/\n{2,}/)
        .map((para) => `<p style="margin:0 0 14px;">${esc(para).replace(/\n/g, '<br/>')}</p>`)
        .join('')
    : `<p style="margin:0 0 8px;">${DEFAULT_ORDER_MESSAGE}</p>`;
  const bodyText = message || DEFAULT_ORDER_MESSAGE;

  const html = brandedEmailHtml({
    eyebrow: 'Order confirmed',
    heading: 'Thanks for your order!',
    bodyHtml,
    infoBox: { title: 'Order details', rows },
    cta: { label: 'Track your order', href: lookupLink },
    gifUrl,
    ...(signatureName ? { signatureName } : {}),
    ...(signatureRole ? { signatureRole } : {}),
  });

  const textLines = ['Thanks for your order!', '', `Order number: ${orderNumber}`];
  if (itemsLine) textLines.push(`Items: ${itemsLine}`);
  if (deliveryLine) textLines.push(`Delivery: ${deliveryLine}`);
  if (addressLine) textLines.push(`Shipping to: ${addressLine}`);
  textLines.push(
    `Total: ${currency.toUpperCase()} $${amount}`,
    '',
    bodyText,
    '',
    'Track your order any time:',
    lookupLink,
    '',
    'Unstitch — Naarm, Melbourne Australia',
  );
  return { html, text: textLines.join('\n') };
}

/**
 * Sent to the *current* registrant of a digital passport (api/passport.js)
 * when someone else tries to register the same unit with a different
 * email — see that file's header comment for the full flow. Never sent to
 * the person taking the action; only ever to the existing owner, so they
 * get a chance to notice/stop an unwanted transfer before it happens.
 * @param {object} opts
 * @param {string} opts.productName
 * @param {string} opts.unitSerial
 * @param {string} opts.newOwnerEmail - the email attempting to claim the unit (shown so the current owner can recognise a resale/gift they arranged)
 * @param {string} opts.confirmLink
 * @returns {{html: string, text: string}}
 */
export function passportTransferConfirmationEmail({ productName, unitSerial, newOwnerEmail, confirmLink }) {
  const bodyHtml = `
    <p style="margin:0 0 14px;">Someone just tried to register your Unstitch kit's digital passport (<strong>${esc(unitSerial)}</strong>, ${esc(productName)}) using a different email address (<strong>${esc(newOwnerEmail)}</strong>).</p>
    <p style="margin:0 0 14px;">If you sold or gifted this kit and this is expected, confirm the transfer below — it'll move the passport (and registration) over to its new owner.</p>
    <p style="margin:0;">If this wasn't you, you can safely ignore this email — nothing has changed yet, and no confirmation link works without you clicking it.</p>`;
  const html = brandedEmailHtml({
    eyebrow: 'Confirm passport transfer',
    heading: 'Someone wants to claim your Unstitch kit',
    bodyHtml,
    cta: { label: 'Confirm the transfer', href: confirmLink },
  });
  const text = [
    'Someone wants to claim your Unstitch kit',
    '',
    `Someone just tried to register your Unstitch kit's digital passport (${unitSerial}, ${productName}) using a different email address (${newOwnerEmail}).`,
    '',
    'If you sold or gifted this kit and this is expected, confirm the transfer using the link below — it\'ll move the passport (and registration) over to its new owner.',
    '',
    "If this wasn't you, you can safely ignore this email — nothing has changed yet, and no confirmation link works without you clicking it.",
    '',
    confirmLink,
    '',
    'Unstitch — Naarm, Melbourne Australia',
  ].join('\n');
  return { html, text };
}

/**
 * Sent from the "Mark as shipped" action (api/admin/orders.js) — best
 * effort, never blocks marking the order shipped if this fails to send.
 * @param {{orderNumber: string, lookupLink: string}} opts
 * @returns {{html: string, text: string}}
 */
/**
 * Sent to a gift-giver once an admin has reviewed and manually approved a
 * gift claim from the admin Passport tab (api/admin/inventory.js, action:
 * "send-gift-ack") — never automatically, since the giver's name/email is
 * customer-typed and unverified at registration time (see
 * Unit.giftGiverEmail in prisma/schema.prisma).
 * @param {object} opts
 * @param {string} opts.giverName
 * @param {string} opts.productName
 * @param {string} opts.unitSerial
 * @param {string} [opts.recipientName]
 * @returns {{html: string, text: string}}
 */
export function giftAcknowledgementEmail({ giverName, productName, unitSerial, recipientName }) {
  const recipientBit = recipientName ? esc(recipientName) : 'the person you gave it to';
  const bodyHtml = `
    <p style="margin:0 0 14px;">Hi ${esc(giverName)},</p>
    <p style="margin:0 0 14px;">Just a note to say thank you — the Unstitch kit you gave (<strong>${esc(productName)}</strong>, passport code <strong>${esc(unitSerial)}</strong>) has been registered by ${recipientBit}. That was a lovely gift.</p>
    <p style="margin:0;">We just wanted you to know it arrived safely and is officially theirs now.</p>`;
  const html = brandedEmailHtml({
    eyebrow: 'Thank you',
    heading: 'Your gift has been registered',
    bodyHtml,
  });
  const text = [
    'Your gift has been registered',
    '',
    `Hi ${giverName},`,
    '',
    `Just a note to say thank you \u2014 the Unstitch kit you gave (${productName}, passport code ${unitSerial}) has been registered by ${recipientName || 'the person you gave it to'}. That was a lovely gift.`,
    '',
    'We just wanted you to know it arrived safely and is officially theirs now.',
    '',
    'Unstitch \u2014 Naarm, Melbourne Australia',
  ].join('\n');
  return { html, text };
}

/**
 * @param {object} opts
 * @param {string} opts.orderNumber
 * @param {string} opts.lookupLink
 * @param {string} [opts.trackingNumber] - AusPost (or other carrier) tracking
 *   number, if the admin has entered one (src/server/admin/orders.js's
 *   'update-tracking' action). This business posts manually rather than
 *   through an AusPost API/MyPost Business integration, so nothing
 *   auto-populates this — when it's set, the email links straight to
 *   AusPost's public tracking lookup so the customer doesn't have to go
 *   find it themselves; when it isn't, the email just omits that line.
 */
export function orderShippedEmail({ orderNumber, lookupLink, trackingNumber }) {
  // infoBox row values go through brandedEmailHtml's own esc() — safe for
  // the plain tracking number, but that means a clickable link can't live
  // in a row value (it'd render as literal escaped markup). So the number
  // itself is a plain row, and the link is its own sentence in bodyHtml.
  const trackingUrl = trackingNumber ? auspostTrackingUrl(trackingNumber) : null;
  const rows = [{ label: 'Order number', value: orderNumber }];
  if (trackingNumber) rows.push({ label: 'Tracking number', value: trackingNumber });
  const html = brandedEmailHtml({
    eyebrow: 'On its way',
    heading: 'Your order has shipped!',
    bodyHtml: `<p style="margin:0 0 8px;">Your Unstitch order is on its way to you.${
      trackingUrl
        ? ` You can follow its progress on <a href="${esc(trackingUrl)}" style="color:${ACCENT};">Australia Post's tracking page</a>.`
        : ''
    }</p>`,
    infoBox: { title: 'Order details', rows },
    cta: { label: 'Track your order', href: lookupLink },
  });
  const text = [
    'Your order has shipped!',
    '',
    `Order number: ${orderNumber}`,
    ...(trackingNumber ? [`Tracking number: ${trackingNumber}`, `Track with Australia Post: ${trackingUrl}`] : []),
    '',
    'Your Unstitch order is on its way to you.',
    '',
    'Track your order any time:',
    lookupLink,
    '',
    'Unstitch — Naarm, Melbourne Australia',
  ].join('\n');
  return { html, text };
}
