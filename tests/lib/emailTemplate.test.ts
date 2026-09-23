import { describe, it, expect } from 'vitest';
import {
  esc,
  brandedEmailHtml,
  orderConfirmationEmail,
  orderShippedEmail,
  DEFAULT_ORDER_MESSAGE,
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
