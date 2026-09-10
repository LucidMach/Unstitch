// api/contact.js
// Vercel Serverless Function for contact form submissions

import { ContactSchema, subjectLabels } from '../src/lib/schemas/contact.js';
import { checkRateLimit } from '../src/lib/rateLimit.js';
import { formatZodError, sendJson, parseRequestBody } from '../src/lib/apiHelper.js';
import prisma from '../src/lib/prisma.js';

const NOTIFY_EMAIL = 'hello@unstitchx.com';

/**
 * Generate a clean HTML email template for studio notification
 */
function generateNotificationHtml({ name, email, phone, subject, message, marketingOptIn, details }) {
  const subjectTitle = subjectLabels[subject] || subject;
  
  const detailRows = Object.entries(details || {})
    .map(([key, val]) => `<tr><td style="padding: 6px 12px; font-weight: 600; color: #555; text-transform: capitalize;">${key.replace(/([A-Z])/g, ' $1')}:</td><td style="padding: 6px 12px; color: #111;">${val}</td></tr>`)
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #faf9f6; border-radius: 8px; border: 1px solid #e5e5e5;">
      <div style="border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.05em; color: #1a1a1a;">Unstitch — New Enquiry</h2>
        <p style="margin: 4px 0 0; font-size: 14px; color: #e05a47; font-weight: 600;">${subjectTitle}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; background: #fff; border-radius: 6px; border: 1px solid #eee;">
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #555; width: 120px;">From:</td>
          <td style="padding: 8px 12px; color: #111;"><strong>${name}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #555;">Email:</td>
          <td style="padding: 8px 12px;"><a href="mailto:${email}" style="color: #1a1a1a; text-decoration: underline;">${email}</a></td>
        </tr>
        ${phone ? `<tr><td style="padding: 8px 12px; font-weight: 600; color: #555;">Phone:</td><td style="padding: 8px 12px;"><a href="tel:${phone}" style="color: #1a1a1a;">${phone}</a></td></tr>` : ''}
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #555;">Newsletter:</td>
          <td style="padding: 8px 12px;">${marketingOptIn ? '<span style="color: #16a34a; font-weight: 600;">Subscribed (Yes)</span>' : '<span style="color: #737373;">No</span>'}</td>
        </tr>
        ${detailRows}
      </table>

      <div style="background: #ffffff; padding: 16px; border-radius: 6px; border: 1px solid #eee; margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #888; letter-spacing: 0.05em;">Message</h4>
        <p style="margin: 0; font-size: 15px; line-height: 1.6; white-space: pre-wrap; color: #222;">${message}</p>
      </div>

      <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">Sent from Unstitch Studio Platform</p>
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // 1. IP Rate Limiting (5 submissions per minute per IP)
  const rateResult = checkRateLimit(req, { limit: 5, windowMs: 60000, prefix: 'contact' });
  if (!rateResult.success) {
    res.setHeader('Retry-After', Math.ceil((rateResult.resetTime - Date.now()) / 1000).toString());
    return sendJson(res, 429, {
      error: 'Too many requests. Please wait a minute before submitting again.',
    });
  }

  // 2. Parse & Validate Payload
  const rawBody = parseRequestBody(req);

  // Bot Trap / Honeypot detection
  if (rawBody._gotcha) {
    console.warn('Bot detected via honeypot trap in contact submission');
    // Silently drop bot submission with success status
    return sendJson(res, 200, { ok: true });
  }

  const parseResult = ContactSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, {
      error: formatted.message,
      fieldErrors: formatted.fieldErrors,
    });
  }

  const { name, email, phone, subject, message, marketingOptIn, details } = parseResult.data;

  // 3. Database Persistence (Neon Postgres via Prisma)
  if (prisma) {
    try {
      if (marketingOptIn) {
        // Atomic transaction: save submission and upsert subscriber
        await prisma.$transaction([
          prisma.contactSubmission.create({
            data: {
              name,
              email,
              phone: phone || null,
              subject,
              message,
              marketingOptIn,
              details,
            },
          }),
          prisma.subscriber.upsert({
            where: { email },
            update: {
              signupCount: { increment: 1 },
              name: name || undefined,
              source: 'contact-form',
            },
            create: {
              name: name || null,
              email,
              source: 'contact-form',
              signupCount: 1,
            },
          }),
        ]);
        console.log('✓ Saved contact submission and auto-subscribed to newsletter:', email);
      } else {
        await prisma.contactSubmission.create({
          data: {
            name,
            email,
            phone: phone || null,
            subject,
            message,
            marketingOptIn: false,
            details,
          },
        });
        console.log('✓ Saved contact submission to Neon Postgres:', email);
      }
    } catch (dbErr) {
      console.error('Database persistence failed for contact submission:', dbErr);
      return sendJson(res, 500, {
        error: 'We encountered an issue saving your message. Please try again shortly or contact us at hello@unstitchx.com.',
      });
    }
  } else {
    console.log('[Dev/Mock] Contact submission recorded:', { name, email, phone, subject, details });
  }

  // 4. Email Notification (Resend)
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const subjectTitle = subjectLabels[subject] || subject;
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'Unstitch <hello@unstitchx.com>';
      const toEmail = process.env.CONTACT_NOTIFY_EMAIL || NOTIFY_EMAIL;

      const detailLines = Object.entries(details || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

      const plainText = [
        `New enquiry: ${subjectTitle}`,
        `From: ${name} (${email}${phone ? `, ${phone}` : ''})`,
        '',
        'Message:',
        message,
        detailLines ? `\n---\nAdditional Details:\n${detailLines}` : '',
        `\nMarketing Opt-in: ${marketingOptIn ? 'Yes' : 'No'}`,
      ].join('\n');

      await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        reply_to: email,
        subject: `New enquiry — ${subjectTitle}`,
        text: plainText,
        html: generateNotificationHtml({ name, email, phone, subject, message, marketingOptIn, details }),
      });
      console.log('✓ Resend email notification sent successfully to:', toEmail);
    } catch (emailErr) {
      // Non-fatal if DB write succeeded; log with warning
      console.warn('Resend contact notification email delivery failed:', emailErr);
    }
  }

  return sendJson(res, 200, { ok: true });
}
