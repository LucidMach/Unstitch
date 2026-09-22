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
  </div>
</body>
</html>`;
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
          ? ` — ${deliveryFeeCents > 0 ? `${currency.toUpperCase()} $${(deliveryFeeCents / 100).toFixed(2)}` : 'Free'}`
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
 * Sent from the "Mark as shipped" action (api/admin/orders.js) — best
 * effort, never blocks marking the order shipped if this fails to send.
 * @param {{orderNumber: string, lookupLink: string}} opts
 * @returns {{html: string, text: string}}
 */
export function orderShippedEmail({ orderNumber, lookupLink }) {
  const html = brandedEmailHtml({
    eyebrow: 'On its way',
    heading: 'Your order has shipped!',
    bodyHtml: `<p style="margin:0 0 8px;">Your Unstitch order is on its way to you.</p>`,
    infoBox: {
      title: 'Order details',
      rows: [{ label: 'Order number', value: orderNumber }],
    },
    cta: { label: 'Track your order', href: lookupLink },
  });
  const text = [
    'Your order has shipped!',
    '',
    `Order number: ${orderNumber}`,
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
