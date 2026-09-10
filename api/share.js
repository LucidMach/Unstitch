// api/share.js
// Vercel Serverless Function for emailing 3D parametric textile creations

import { ShareSchema } from '../src/lib/schemas/share.js';
import { checkRateLimit } from '../src/lib/rateLimit.js';
import { formatZodError, sendJson, parseRequestBody } from '../src/lib/apiHelper.js';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Unstitch Studio <hello@unstitchx.com>';

/**
 * Generate a clean, brand-aligned HTML email template for 3D creation sharing
 */
function generateShareEmailHtml({ projectName, email, tileCount, foldCount, hasPreview }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Your Unstitch 3D Creation</title>
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
                        <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700; color: #A36E93;">3D Parametric Playground</p>
                        <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111111; letter-spacing: -0.02em;">${projectName || 'Unstitch 3D Creation'}</h1>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Preview Image Banner -->
              ${hasPreview ? `
              <tr>
                <td style="padding: 24px 32px; background-color: #fdfbfb; border-bottom: 1px solid #f0f0f0;" align="center">
                  <img src="cid:preview-image" alt="${projectName}" style="width: 100%; max-width: 516px; height: auto; border-radius: 12px; border: 1px solid #e8e8e8; display: block;" />
                </td>
              </tr>
              ` : ''}

              <!-- Content Body -->
              <tr>
                <td style="padding: 28px 32px;">
                  <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #444444;">
                    Here is the 3D parametric design you created in the <strong>Unstitch Playground</strong>. Attached to this email is your <code>unstitch-design.json</code> file, containing full kinematic hierarchies and fold angles.
                  </p>

                  <!-- Design Stats Badge -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #faf9f6; border-radius: 12px; border: 1px solid #ebebeb; margin-bottom: 24px;">
                    <tr>
                      <td style="padding: 16px; text-align: center; border-right: 1px solid #ebebeb; width: 50%;">
                        <p style="margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #777; font-weight: 600;">Tile Count</p>
                        <p style="margin: 4px 0 0; font-size: 20px; font-weight: 700; color: #111111;">${tileCount}</p>
                      </td>
                      <td style="padding: 16px; text-align: center; width: 50%;">
                        <p style="margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #777; font-weight: 600;">Active Folds</p>
                        <p style="margin: 4px 0 0; font-size: 20px; font-weight: 700; color: #A36E93;">${foldCount}</p>
                      </td>
                    </tr>
                  </table>

                  <!-- Instructions Box -->
                  <div style="background-color: #ffffff; border-left: 3px solid #A36E93; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px; border-top: 1px solid #f0f0f0; border-right: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0;">
                    <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #111111; letter-spacing: 0.05em;">How to Re-Load Your Design</p>
                    <p style="margin: 0; font-size: 13px; color: #555555; line-height: 1.5;">
                      Open the <a href="https://unstitch.com/playground" style="color: #A36E93; text-decoration: underline; font-weight: 600;">Unstitch Playground</a>, click <strong>Load</strong> in the top bar, and choose <strong>Import .JSON File</strong> with your attached file.
                    </p>
                  </div>

                  <!-- CTA Button -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center">
                        <a href="https://unstitchx.com/playground" style="display: inline-block; background-color: #111111; color: #ffffff; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 14px 28px; border-radius: 8px; text-decoration: none;">Launch Playground</a>
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

  // 1. IP Rate Limiting (5 requests per minute per IP)
  const rateResult = checkRateLimit(req, { limit: 5, windowMs: 60000, prefix: 'share' });
  if (!rateResult.success) {
    res.setHeader('Retry-After', Math.ceil((rateResult.resetTime - Date.now()) / 1000).toString());
    return sendJson(res, 429, {
      error: 'Too many share requests. Please wait a minute before sharing again.',
    });
  }

  // 2. Parse & Validate Payload
  const rawBody = parseRequestBody(req);

  // Bot Trap / Honeypot detection
  if (rawBody._gotcha) {
    console.warn('Bot detected via honeypot trap in share submission');
    return sendJson(res, 200, { ok: true });
  }

  const parseResult = ShareSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const formatted = formatZodError(parseResult.error);
    return sendJson(res, 400, {
      error: formatted.message,
      fieldErrors: formatted.fieldErrors,
    });
  }

  const { email, projectName, designData, previewImage } = parseResult.data;

  // 3. Prepare Email Attachments
  const safeFilename = (projectName || 'unstitch-design').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const jsonContent = JSON.stringify(designData, null, 2);
  const jsonBuffer = Buffer.from(jsonContent, 'utf-8');

  const attachments = [
    {
      filename: `${safeFilename}.json`,
      content: jsonBuffer,
    },
  ];

  let hasPreview = false;
  if (previewImage && previewImage.includes('base64,')) {
    try {
      const base64Data = previewImage.split('base64,')[1];
      const imageBuffer = Buffer.from(base64Data, 'base64');
      attachments.push({
        filename: `${safeFilename}-preview.png`,
        content: imageBuffer,
        content_id: 'preview-image',
      });
      hasPreview = true;
    } catch (imgErr) {
      console.warn('Failed to parse previewImage base64 for attachment:', imgErr);
    }
  }

  const tileCount = Array.isArray(designData.tiles) ? designData.tiles.length : 1;
  const foldCount = Array.isArray(designData.tiles)
    ? designData.tiles.filter((t) => Math.abs(t.foldAngle || 0) > 0.01).length
    : 0;

  // 4. Send Email via Resend
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      const plainText = [
        `Your Unstitch 3D Creation: ${projectName}`,
        `Tile Count: ${tileCount} | Active Folds: ${foldCount}`,
        '',
        'Your design file (unstitch-design.json) is attached to this email.',
        'To re-open your creation, open the Unstitch Playground (https://unstitch.com/playground) and click Load -> Import .JSON File.',
        '',
        'Unstitch — Naarm, Melbourne Australia',
      ].join('\n');

      let sendResult = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `Your Unstitch 3D Creation — ${projectName || 'Design File'}`,
        text: plainText,
        html: generateShareEmailHtml({ projectName, email, tileCount, foldCount, hasPreview }),
        attachments,
      });

      // If custom domain is not verified yet in Resend, automatically fallback to test sender
      if (
        sendResult.error &&
        (sendResult.error.message?.toLowerCase().includes('not verified') ||
          sendResult.error.statusCode === 403 ||
          sendResult.error.name === 'validation_error')
      ) {
        console.warn(`[Share API] Primary sender '${FROM_EMAIL}' unverified. Retrying with onboarding@resend.dev...`);
        sendResult = await resend.emails.send({
          from: 'Unstitch 3D Studio <onboarding@resend.dev>',
          to: email,
          subject: `Your Unstitch 3D Creation — ${projectName || 'Design File'}`,
          text: plainText,
          html: generateShareEmailHtml({ projectName, email, tileCount, foldCount, hasPreview }),
          attachments,
        });
      }

      if (sendResult.error) {
        console.error('Failed to send share email via Resend:', sendResult.error);
        return sendJson(res, 500, {
          error: sendResult.error.message || 'Unable to send design email at this moment. Please try again shortly.',
        });
      }

      console.log('✓ Resend 3D creation shared successfully to:', email);
    } catch (emailErr) {
      console.error('Failed to send share email via Resend (thrown):', emailErr);
      const errMsg = emailErr instanceof Error ? emailErr.message : 'Unable to send email';
      return sendJson(res, 500, {
        error: errMsg || 'Unable to send design email at this moment. Please try again shortly.',
      });
    }
  } else {
    console.log('[Dev/Mock] Share design email dispatched to:', email, {
      projectName,
      tileCount,
      foldCount,
      attachmentsCount: attachments.length,
    });
  }

  return sendJson(res, 200, { ok: true, message: 'Design sent to your email!' });
}
