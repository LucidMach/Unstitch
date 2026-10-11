import { describe, it, expect } from 'vitest';
import {
  esc,
  brandedEmailHtml,
  orderConfirmationEmail,
  orderShippedEmail,
  DEFAULT_ORDER_MESSAGE,
  ORDERS_FROM_EMAIL,
  GENERAL_FROM_EMAIL,
  renderBlocksHtml,
  renderBlocksText,
  fillBlockVars,
} from '../../src/lib/emailTemplate.js';

describe('esc', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(esc('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes a stored-XSS-style payload into inert text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const result = esc(payload);
    expect(result).not.toContain('<img');
    expect(result).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('coerces null/undefined to an empty string rather than throwing', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('coerces numbers/other types via String()', () => {
    expect(esc(42)).toBe('42');
  });

  it('leaves already-safe text untouched', () => {
    expect(esc('Jane Doe')).toBe('Jane Doe');
  });
});

describe('brandedEmailHtml', () => {
  it('escapes heading/eyebrow/signature values in the output HTML', () => {
    const html = brandedEmailHtml({
      eyebrow: '<script>alert(1)</script>',
      heading: 'Hello "World" & <friends>',
      bodyHtml: '<p>safe pre-built body</p>',
      signatureName: '<b>Name</b>',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Hello &quot;World&quot; &amp; &lt;friends&gt;');
    expect(html).toContain('&lt;b&gt;Name&lt;/b&gt;');
    // Pre-built bodyHtml is trusted verbatim (callers are responsible for escaping their own content).
    expect(html).toContain('<p>safe pre-built body</p>');
  });

  it('escapes info box labels/values and the CTA href/label', () => {
    const html = brandedEmailHtml({
      heading: 'Order',
      bodyHtml: '<p>x</p>',
      infoBox: { title: 'Details & Co', rows: [{ label: '<b>Label</b>', value: 'Value & "quotes"' }] },
      cta: { label: 'Click "here" <now>', href: 'https://example.com/?a=1&b=2' },
    });

    expect(html).toContain('&lt;b&gt;Label&lt;/b&gt;');
    expect(html).toContain('Value &amp; &quot;quotes&quot;');
    expect(html).toContain('Click &quot;here&quot; &lt;now&gt;');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
  });

  it('omits the eyebrow/infoBox/cta blocks entirely when not provided', () => {
    const html = brandedEmailHtml({ heading: 'Plain', bodyHtml: '<p>x</p>' });
    expect(html).toContain('Plain');
    expect(html).not.toContain('text-align:center;"><table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 4px;');
  });
});

describe('orderConfirmationEmail', () => {
  const baseOpts = {
    orderNumber: 'UX-2026-000001',
    totalCents: 12345,
    currency: 'aud',
    lookupLink: 'https://unstitchx.com/order/lookup?token=abc',
  };

  it('includes the order number, formatted total, and lookup link', () => {
    const { html, text } = orderConfirmationEmail(baseOpts);
    expect(html).toContain('UX-2026-000001');
    expect(html).toContain('AUD $123.45');
    expect(html).toContain(baseOpts.lookupLink);
    expect(text).toContain('UX-2026-000001');
    expect(text).toContain('AUD $123.45');
  });

  it('uses the default made-to-order message when no custom message is given', () => {
    const { html, text } = orderConfirmationEmail(baseOpts);
    expect(html).toContain(DEFAULT_ORDER_MESSAGE);
    expect(text).toContain(DEFAULT_ORDER_MESSAGE);
  });

  it('replaces the default message with an escaped custom message when provided', () => {
    const { html, text } = orderConfirmationEmail({
      ...baseOpts,
      message: 'Thanks <Jane>!\n\nSecond paragraph.',
    });
    expect(html).not.toContain(DEFAULT_ORDER_MESSAGE);
    expect(html).toContain('Thanks &lt;Jane&gt;!');
    expect(html).toContain('Second paragraph.');
    expect(text).toContain('Thanks <Jane>!');
  });

  it('shows a pluralized items line and delivery fee when provided', () => {
    const { html, text } = orderConfirmationEmail({
      ...baseOpts,
      items: [{ name: 'Slow Bloom Kit', quantity: 2 }],
      deliveryMethodLabel: 'Australia Post',
      deliveryFeeCents: 900,
    });
    expect(html).toContain('Slow Bloom Kit × 2');
    expect(html).toContain('Australia Post');
    expect(html).toContain('AUD $9.00');
    expect(text).toContain('Slow Bloom Kit × 2');
  });

  it('shows "Free" for a zero delivery fee', () => {
    const { html } = orderConfirmationEmail({
      ...baseOpts,
      deliveryMethodLabel: 'Pickup',
      deliveryFeeCents: 0,
    });
    expect(html).toContain('Free');
  });

  it('omits items/delivery/address rows entirely when not provided', () => {
    const { text } = orderConfirmationEmail(baseOpts);
    expect(text).not.toContain('Items:');
    expect(text).not.toContain('Delivery:');
    expect(text).not.toContain('Shipping to:');
  });

  it('formats and escapes the delivery address line', () => {
    const { html, text } = orderConfirmationEmail({
      ...baseOpts,
      deliveryAddress: {
        line1: '1 Example St <Unit 2>',
        suburb: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
      },
    });
    expect(html).toContain('1 Example St &lt;Unit 2&gt;');
    expect(html).toContain('Melbourne VIC 3000');
    expect(text).toContain('1 Example St <Unit 2>, Melbourne VIC 3000');
  });
});

describe('orderShippedEmail', () => {
  it('includes the order number and lookup link', () => {
    const { html, text } = orderShippedEmail({ orderNumber: 'UX-2026-000002', lookupLink: 'https://unstitchx.com/order/lookup?token=xyz' });
    expect(html).toContain('UX-2026-000002');
    expect(html).toContain('https://unstitchx.com/order/lookup?token=xyz');
    expect(text).toContain('UX-2026-000002');
    expect(text).toContain('shipped');
  });

  it('escapes an order number containing HTML-significant characters', () => {
    const { html } = orderShippedEmail({ orderNumber: '<b>UX</b>', lookupLink: 'https://example.com' });
    expect(html).not.toContain('<b>UX</b>');
    expect(html).toContain('&lt;b&gt;UX&lt;/b&gt;');
  });
});

describe('renderBlocksHtml (broadcast block composer)', () => {
  function productMap(overrides: Record<string, any> = {}) {
    return new Map([
      [
        'p1',
        {
          name: 'Slow Bloom Kit',
          tagline: 'A slow-stitch kit for curious hands',
          imageUrl: 'https://unstitchx.com/slow-bloom-hero.jpg',
          basePriceCents: 4999,
          currency: 'aud',
          kitContents: ['Fabric panel', 'Needle set'],
          ...overrides,
        },
      ],
    ]);
  }

  it('converts **bold** and *italic*/_italic_ markup to <strong>/<em> in a text block body', () => {
    const html = renderBlocksHtml([{ type: 'text', body: '**bold** and *italic* and _also italic_' }], new Map());
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<em>also italic</em>');
  });

  it('escapes HTML in block body before applying markup, so markup cannot be used to inject tags', () => {
    const html = renderBlocksHtml([{ type: 'text', body: '**<img src=x onerror=alert(1)>**' }], new Map());
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>');
  });

  it('leaves the highlight background off by default and applies a custom colour per block when set', () => {
    const plain = renderBlocksHtml([{ type: 'text', heading: 'Plain', body: 'x' }], new Map());
    expect(plain).not.toContain('border-radius:12px;padding:18px 20px 4px');

    const highlighted = renderBlocksHtml([{ type: 'image', url: 'https://x/img.png', highlightColor: '#ff00aa' }], new Map());
    expect(highlighted).toContain('background:#ff00aa;border-radius:12px');
  });

  it('removes a boxed block\'s normal top margin above its heading so the highlight padding does not double up with it', () => {
    const unboxed = renderBlocksHtml([{ type: 'text', heading: 'Hi' }], new Map());
    expect(unboxed).toContain('margin:22px 0 10px');

    const boxed = renderBlocksHtml([{ type: 'text', heading: 'Hi', highlightColor: '#f6f4f1' }], new Map());
    expect(boxed).toContain('margin:0px 0 10px');
    expect(boxed).not.toContain('margin:22px 0 10px');
  });

  it('renders nothing for a kit block whose product no longer exists, rather than throwing', () => {
    expect(() => renderBlocksHtml([{ type: 'kit', productId: 'missing' }], new Map())).not.toThrow();
    expect(renderBlocksHtml([{ type: 'kit', productId: 'missing' }], new Map())).toBe('');
  });

  it("defaults a kit block's headline/body from the product, and supports bold/italic in a custom body", () => {
    const html = renderBlocksHtml([{ type: 'kit', productId: 'p1', body: 'Only **3** left!', showPrice: true }], productMap());
    expect(html).toContain('New drop: Slow Bloom Kit');
    expect(html).toContain('<strong>3</strong>');
    expect(html).toContain('AUD $49.99');
  });

  it('attaches the CTA button directly inside the kit block, with real breathing room beneath it', () => {
    const html = renderBlocksHtml(
      [{ type: 'kit', productId: 'p1', buttonLabel: 'Add to bag', buttonUrl: 'https://unstitchx.com/shop' }],
      productMap(),
    );
    expect(html).toContain('margin:6px auto 16px');
    expect(html).toContain('Add to bag');
    expect(html).toContain('href="https://unstitchx.com/shop"');
    // Headline and button must come out of the SAME block (no separate stacked block needed).
    const headlineIndex = html.indexOf('New drop: Slow Bloom Kit');
    const buttonIndex = html.indexOf('Add to bag');
    expect(headlineIndex).toBeGreaterThanOrEqual(0);
    expect(buttonIndex).toBeGreaterThan(headlineIndex);
  });

  it('supports an optional recolourable highlight on the kit block too, not just a fixed look', () => {
    const noHighlight = renderBlocksHtml([{ type: 'kit', productId: 'p1' }], productMap());
    expect(noHighlight).not.toContain('border-radius:12px;padding:18px 20px 4px');

    const customHighlight = renderBlocksHtml([{ type: 'kit', productId: 'p1', highlightColor: '#eedfe9' }], productMap());
    expect(customHighlight).toContain('background:#eedfe9;border-radius:12px');
  });

  it('renders a cta block with bold/italic body text and an optional highlight colour', () => {
    const html = renderBlocksHtml(
      [{ type: 'cta', heading: 'Raffle winners', body: 'Congrats to *both* winners!', buttonLabel: 'See results', buttonUrl: 'https://unstitchx.com/raffle', highlightColor: '#eedfe9' }],
      new Map(),
    );
    expect(html).toContain('background:#eedfe9;border-radius:12px');
    expect(html).toContain('<em>both</em>');
    expect(html).toContain('See results');
  });
});

describe('renderBlocksText (plain-text fallback for blocks)', () => {
  it('includes kit block headline, price, and button as plain lines', () => {
    const text = renderBlocksText(
      [{ type: 'kit', productId: 'p1', buttonLabel: 'Add to bag', buttonUrl: 'https://unstitchx.com/shop' }],
      new Map([
        ['p1', { name: 'Slow Bloom Kit', tagline: 't', imageUrl: 'x', basePriceCents: 1000, currency: 'aud', kitContents: [], showPrice: true }],
      ]),
    );
    expect(text).toContain('New drop: Slow Bloom Kit');
    expect(text).toContain('Add to bag: https://unstitchx.com/shop');
  });
});

describe('fillBlockVars ({name} personalization across block fields)', () => {
  it('fills {name} into heading/body across a block list without touching structural fields', () => {
    const filled = fillBlockVars(
      [
        { type: 'text', heading: 'Hi {name}', body: 'Welcome, {name}!' },
        { type: 'kit', productId: 'p1', buttonUrl: '/shop' },
      ],
      { name: 'Jane' },
    );
    const [textBlock, kitBlock] = filled as [any, any];
    expect(textBlock.heading).toBe('Hi Jane');
    expect(textBlock.body).toBe('Welcome, Jane!');
    expect(kitBlock.productId).toBe('p1');
    expect(kitBlock.buttonUrl).toBe('/shop');
  });
});

describe('sending identities (ORDERS_FROM_EMAIL & GENERAL_FROM_EMAIL)', () => {
  it('exports canonical eshop sender for orders and commerce', () => {
    expect(ORDERS_FROM_EMAIL).toBe('Unstitch Studio <eshop@unstitchx.com>');
  });

  it('exports canonical hello sender for general and studio communications', () => {
    expect(GENERAL_FROM_EMAIL).toBe('Unstitch Studio <hello@unstitchx.com>');
  });
});
