// api/subscribe.js
// Vercel Serverless Function for newsletter signups

import { SubscribeSchema } from '../src/lib/schemas/subscribe.js';
import { checkRateLimit } from '../src/lib/rateLimit.js';
import { formatZodError, sendJson, parseRequestBody } from '../src/lib/apiHelper.js';
import prisma from '../src/lib/prisma.js';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';

/**
 * Generate a clean, branded HTML email template for raffle entry confirmation
 */
function generateRaffleConfirmationHtml({ name, email }) {
  const recipientName = name ? name.trim() : 'there';
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>You're in the Unstitch Raffle Draw!</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #faf9f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
        <tr>
          <td align="center" style="padding: 40px 16px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e5e5; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
              
              <!-- Header -->
              <tr>
                <td style="padding: 32px 32px 24px; border-bottom: 1px solid #f0f0f0;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700; color: #A36E93;">Zero Waste Festival · Stand Entry</p>
                        <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111111; letter-spacing: -0.02em;">You're in the Raffle Draw! 🎟️</h1>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Content Body -->
              <tr>
                <td style="padding: 28px 32px;">
                  <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #333333;">
                    Hi <strong>${recipientName}</strong>,
                  </p>
                  <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #444444;">
                    Thanks for stopping by the Unstitch stand and exploring our modular textile system today! Your entry into our <strong>Zero Waste Festival Raffle Draw</strong> has been officially confirmed.
                  </p>

                  <!-- Draw Details Card -->
                  <div style="background-color: #faf9f6; border: 1px solid #ebebeb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #777; font-weight: 700;">Draw Details</h3>
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 13px; color: #222; line-height: 1.6;">
                      <tr>
                        <td style="padding: 4px 0; font-weight: 600; width: 90px; color: #555;">Prize:</td>
                        <td style="padding: 4px 0; font-weight: 700; color: #111;">1x Unstitch Latest Modular Textile Drop</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-weight: 600; color: #555;">When:</td>
                        <td style="padding: 4px 0;">Wednesday 16/09 at 6:00 PM AEST</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-weight: 600; color: #555;">Where:</td>
                        <td style="padding: 4px 0;">Live on our socials — we'll also email you directly if you win!</td>
                      </tr>
                    </table>
                  </div>

                  <!-- Playground Promo Box -->
                  <div style="background-color: #ffffff; border-left: 3px solid #A36E93; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px; border-top: 1px solid #f0f0f0; border-right: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0;">
                    <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #111111; letter-spacing: 0.05em;">Keep Exploring</p>
                    <p style="margin: 0; font-size: 13px; color: #555555; line-height: 1.5;">
                      Want to fold more patterns or export 3D geometries? Jump back into the virtual studio anytime.
                    </p>
                  </div>

                  <!-- CTA Button -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center">
                        <a href="https://unstitchx.com/playground" style="display: inline-block; background-color: #111111; color: #ffffff; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 14px 28px; border-radius: 8px; text-decoration: none;">Launch 3D Playground</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 20px 32px 28px; background-color: #fafafa; border-top: 1px solid #f0f0f0; text-align: center;">
                  <p style="margin: 0 0 6px; font-size: 11px; color: #888888;">Unstitch — Modular Parametric Textile System</p>
                  <p style="margin: 0; font-size: 11px; color: #aaaaaa;">Naarm, Melbourne Australia · zero-waste modular textiles</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // 1. IP Rate Limiting (10 subscriptions per minute per IP)
  const rateResult = checkRateLimit(req, { limit: 10, windowMs: 60000, prefix: 'subscribe' });
  if (!rateResult.success) {
    res.setHeader('Retry-After', Math.ceil((rateResult.resetTime - Date.now()) / 1000).toString());
    return sendJson(res, 429, {
      error: 'Too many requests. Please wait a moment before trying again.',
    });
  }

  // 2. Parse & Validate Payload
  const rawBody = parseRequestBody(req);

  // Bot Trap / Honeypot detection
  if (rawBody._gotcha) {
    console.warn('Bot detected via honeypot trap in newsletter subscription');
    return sendJson(res, 200, { ok: true });
  }

  const parseResult = SubscribeSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, {
      error: formatted.message,
      fieldErrors: formatted.fieldErrors,
    });
  }

  const { email, name, source } = parseResult.data;

  // 3. Database Persistence (Neon Postgres via Prisma)
  if (prisma) {
    try {
      await prisma.subscriber.upsert({
        where: { email },
        update: {
          signupCount: { increment: 1 },
          name: name || undefined,
          source: source || undefined,
        },
        create: {
          name: name || null,
          email,
          source: source || null,
          signupCount: 1,
        },
      });
      console.log('✓ Successfully saved subscriber to Neon Postgres:', email);
    } catch (dbErr) {
      console.error('Database subscriber insert error:', dbErr);
      return sendJson(res, 500, {
        error: 'Unable to save subscription. Please try again shortly.',
      });
    }
  } else {
    console.log('[Dev/Mock] Subscriber recorded:', { email, name, source });
  }

  // 4. Send Raffle Confirmation Email (if source is zwf-raffle-draw)
  if (source === 'zwf-raffle-draw' && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RESEND_FROM_EMAIL || FROM_EMAIL;

      const plainText = [
        "You're in the Unstitch Raffle Draw!",
        '',
        `Hi ${name ? name.trim() : 'there'},`,
        'Thanks for stopping by the Unstitch stand and exploring our modular textile system today! Your entry into our Zero Waste Festival Raffle Draw is confirmed.',
        '',
        'Prize: 1x Unstitch Latest Modular Textile Drop',
        'Live Draw: Wednesday 16/09 at 6:00 PM AEST on our socials. We will also contact you by email if you win.',
        '',
        'Keep exploring in the 3D Playground: https://unstitchx.com/playground',
        '',
        'Unstitch — Naarm, Melbourne Australia',
      ].join('\n');

      let sendResult = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "You're in the Unstitch Raffle Draw! 🎟️",
        text: plainText,
        html: generateRaffleConfirmationHtml({ name, email }),
      });

      // If custom domain is not verified yet in Resend, automatically fallback to test sender
      if (
        sendResult.error &&
        (sendResult.error.message?.toLowerCase().includes('not verified') ||
          sendResult.error.statusCode === 403 ||
          sendResult.error.name === 'validation_error')
      ) {
        console.warn(`[Subscribe API] Primary sender '${fromEmail}' unverified. Retrying with onboarding@resend.dev...`);
        sendResult = await resend.emails.send({
          from: 'Unstitch Studio <onboarding@resend.dev>',
          to: email,
          subject: "You're in the Unstitch Raffle Draw! 🎟️",
          text: plainText,
          html: generateRaffleConfirmationHtml({ name, email }),
        });
      }

      if (sendResult.error) {
        console.warn('Resend raffle confirmation email delivery failed:', sendResult.error);
      } else {
        console.log('✓ Resend raffle confirmation email sent successfully to:', email);
      }
    } catch (emailErr) {
      console.warn('Failed to send raffle confirmation email via Resend:', emailErr);
    }
  } else if (source === 'zwf-raffle-draw') {
    console.log('[Dev/Mock] Raffle confirmation email dispatched to:', email, { name });
  }

  return sendJson(res, 200, { ok: true });
}

