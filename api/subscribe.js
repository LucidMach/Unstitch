// api/subscribe.js
// Vercel Serverless Function for newsletter signups

import { SubscribeSchema } from '../src/lib/schemas/subscribe.js';
import { checkRateLimit } from '../src/lib/rateLimit.js';
import { formatZodError, sendJson, parseRequestBody } from '../src/lib/apiHelper.js';
import prisma from '../src/lib/prisma.js';

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

  return sendJson(res, 200, { ok: true });
}
