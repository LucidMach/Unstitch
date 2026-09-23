// api/passport-confirm-transfer.js
// GET ?token=... -> completes a passport ownership transfer that api/
// passport.js started when someone tried to register an already-REGISTERED
// unit with an email different from the current registrant's. Mirrors
// api/order-lookup.js's shape: a signed, stateless, expiring token (src/
// lib/signedToken.js) verified here, no session/account involved. Consumed
// by src/pages/passport/confirm.astro, the same "page calls the API"
// convention src/pages/order/lookup.astro uses for its own magic link.
//
// Re-checks that the unit is still REGISTERED to the same customer who was
// the current owner at the moment the token was minted (comparing
// currentOwnerCustomerId) — this guards against a stale/replayed token
// being used after the unit's ownership has already changed some other way
// since the email was sent, so it can never reassign away from a *different*
// owner than the one who was asked to confirm.

import { sendJson } from '../src/lib/apiHelper.js';
import { verify } from '../src/lib/signedToken.js';
import prisma from '../src/lib/prisma.js';

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
  if (!payload || payload.kind !== 'passport-transfer') {
    return sendJson(res, 401, { error: 'This link has expired or is invalid. Ask for the registration to be submitted again.' });
  }

  const { unitId, newOwnerEmail, newOwnerName, currentOwnerCustomerId } = payload;
  if (!unitId || !newOwnerEmail || !currentOwnerCustomerId) {
    return sendJson(res, 401, { error: 'This link is invalid.' });
  }

  try {
    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) return sendJson(res, 404, { error: "We couldn't find this kit anymore." });

    if (unit.status !== 'REGISTERED' || unit.currentOwnerCustomerId !== currentOwnerCustomerId) {
      return sendJson(res, 409, {
        error: "This transfer link is no longer valid — this kit's registration has changed since this link was sent.",
      });
    }

    const newOwner = await prisma.customer.upsert({
      where: { email: newOwnerEmail },
      update: { name: newOwnerName || undefined },
      create: { email: newOwnerEmail, name: newOwnerName || null },
    });

    await prisma.unit.update({
      where: { id: unit.id },
      data: { currentOwnerCustomerId: newOwner.id, registeredAt: new Date(), status: 'REGISTERED' },
    });

    return sendJson(res, 200, {
      confirmed: true,
      message: `Done — this kit's passport is now registered to ${newOwnerEmail}.`,
    });
  } catch (err) {
    console.error('[passport-confirm-transfer] Confirmation failed:', err);
    return sendJson(res, 500, { error: 'Unable to confirm this transfer right now.' });
  }
}
