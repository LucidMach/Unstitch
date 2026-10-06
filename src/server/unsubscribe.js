// api/unsubscribe.js
// GET ?token=... -> verifies a signed unsubscribe token (src/lib/
// signedToken.js, kind: 'unsubscribe') and sets Subscriber.unsubscribedAt.
// Linked from the footer of every broadcast/waitlist-notify email (see
// src/lib/emailTemplate.js's brandedEmailHtml unsubscribeUrl param and
// src/server/admin/broadcast.js, which signs the token per-recipient).
// Never used for transactional mail (order confirmations, shipped/
// delivered notices) -- those have no unsubscribe link at all.
//
// GET rather than POST so the link works as a plain click from an email
// client with no JS/form involved -- src/pages/unsubscribe.astro is the
// page that actually calls this and shows the result; this endpoint
// itself returns JSON only.

import { sendJson } from '../lib/apiHelper.js';
import { verify } from '../lib/signedToken.js';
import prisma from '../lib/prisma.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const token = searchParams.get('token');
  if (!token) return sendJson(res, 400, { error: 'Missing token.' });

  const payload = verify(token);
  if (!payload || payload.kind !== 'unsubscribe' || !payload.subscriberId) {
    return sendJson(res, 401, { error: 'This unsubscribe link is invalid or has expired.' });
  }

  try {
    // update() throws P2025 if the row no longer exists (e.g. an admin
    // already deleted it) -- that still means "not subscribed", so it's
    // treated as success rather than surfaced as an error to the person
    // clicking the link.
    await prisma.subscriber.update({
      where: { id: payload.subscriberId },
      data: { unsubscribedAt: new Date() },
    });
  } catch (err) {
    if (err?.code !== 'P2025') {
      console.error('[unsubscribe] Failed to record unsubscribe:', err);
      return sendJson(res, 500, { error: 'Something went wrong. Please try again shortly.' });
    }
  }

  return sendJson(res, 200, { ok: true });
}
