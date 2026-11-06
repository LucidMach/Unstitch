// api/resubscribe.js
// GET ?token=... -> verifies the same signed unsubscribe token used by
// api/unsubscribe.js (src/lib/signedToken.js, kind: 'unsubscribe') and
// clears Subscriber.unsubscribedAt, undoing that one unsubscribe.
//
// Deliberately reuses the unsubscribe token rather than minting a new
// "resubscribe" kind: the token already proves "this is the person who
// owns this subscriberId" (that's what it was signed for), and it's only
// ever shown to someone right after they unsubscribe via that same link
// (src/pages/unsubscribe.astro's success state), so there's no separate
// flow to secure. This is intentionally the ONLY way unsubscribedAt gets
// cleared — a plain signup/checkout form submission never does this (see
// the comment on that upsert in src/server/subscribe.js), so someone's
// earlier opt-out is never silently reversed by anything other than them
// explicitly asking to be put back on the list.

import { sendJson } from '../lib/apiHelper.js';
import { verify } from '../lib/signedToken.js';
import prisma from '../lib/prisma.js';

export default async function handler(req: any, res: any): Promise<any> {
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
    return sendJson(res, 401, { error: 'This link is invalid or has expired. Get in touch and we’ll add you back by hand.' });
  }

  try {
    await prisma.subscriber.update({
      where: { id: payload.subscriberId },
      data: { unsubscribedAt: null },
    });
  } catch (err: any) {
    // Row no longer exists (e.g. an admin deleted it) -- nothing to
    // resubscribe, surface as a real error since silently saying "ok"
    // here would be misleading (unlike unsubscribe.js, where "already
    // gone" and "unsubscribed" land at the same place).
    if (err?.code === 'P2025') {
      return sendJson(res, 404, { error: 'We couldn’t find that subscription anymore. Get in touch and we’ll add you back by hand.' });
    }
    console.error('[resubscribe] Failed to clear unsubscribe:', err);
    return sendJson(res, 500, { error: 'Something went wrong. Please try again shortly.' });
  }

  return sendJson(res, 200, { ok: true });
}
