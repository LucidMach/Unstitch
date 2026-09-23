// api/events.js
// Public GET -> { upcoming, past, nextBatchDrop }, so static pages (index.astro,
// learn.astro, playground.astro, shop-countdown.astro) can reflect the current/next event,
// its color customization, its raffle state, and upcoming batch drops without being
// server-rendered per request or needing a rebuild when an event changes.

import { sendJson } from '../lib/apiHelper.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';

const MAX_PAST_EVENTS = 10;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const rateResult = checkRateLimit(req, { limit: 60, windowMs: 60000, prefix: 'events' });
  if (!rateResult.success) {
    return sendJson(res, 429, { error: 'Too many requests.' });
  }

  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  try {
    const [events, upcomingDrops] = await Promise.all([
      prisma.event.findMany(),
      prisma.drop.findMany({
        where: { status: 'UPCOMING' },
        include: { product: { select: { name: true, imageUrl: true } } },
        orderBy: { releaseAt: 'asc' },
        take: 1,
      }),
    ]);

    const now = Date.now();

    const withEffectiveEnd = events.map((e) => ({
      ...e,
      effectiveEndMs: (e.endsAt ?? e.startsAt).getTime(),
    }));

    const upcomingCandidates = withEffectiveEnd
      .filter((e) => e.effectiveEndMs >= now)
      .sort((a, b) => a.effectiveEndMs - b.effectiveEndMs);

    const pastCandidates = withEffectiveEnd
      .filter((e) => e.effectiveEndMs < now)
      .sort((a, b) => b.effectiveEndMs - a.effectiveEndMs);

    const nearest = upcomingCandidates[0] || null;
    const upcoming = nearest
      ? {
          slug: nearest.slug,
          title: nearest.title,
          location: nearest.location,
          description: nearest.description,
          color: nearest.color || null,
          startsAt: nearest.startsAt,
          endsAt: nearest.endsAt,
          ctaLabel: nearest.ctaLabel,
          ctaUrl: nearest.ctaUrl,
          raffleEnabled: nearest.raffleEnabled,
          raffleOpen: !!(
            nearest.raffleEnabled &&
            nearest.raffleClosesAt &&
            nearest.raffleClosesAt.getTime() > now
          ),
          raffleButtonLabel: nearest.raffleButtonLabel,
          raffleClosesAt: nearest.raffleClosesAt,
          raffleDrawCopy: nearest.raffleDrawCopy,
        }
      : null;

    const past = pastCandidates.slice(0, MAX_PAST_EVENTS).map((e) => ({
      slug: e.slug,
      title: e.title,
      location: e.location,
      color: e.color || null,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
    }));

    const nearestDrop = upcomingDrops[0] || null;
    const nextBatchDrop = nearestDrop
      ? {
          id: nearestDrop.id,
          dropCode: nearestDrop.dropCode,
          productName: nearestDrop.product.name,
          productImage: nearestDrop.product.imageUrl,
          releaseAt: nearestDrop.releaseAt,
          totalUnits: nearestDrop.totalUnits,
          status: nearestDrop.status,
          madeLocation: nearestDrop.madeLocation,
          madeYear: nearestDrop.madeYear,
        }
      : null;

    return sendJson(res, 200, { upcoming, past, nextBatchDrop });
  } catch (err) {
    console.error('[events] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load events.' });
  }
}
