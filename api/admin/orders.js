// api/admin/orders.js
// GET /api/admin/orders            -> recent orders, summarized
// GET /api/admin/orders?id=<uuid>  -> one order, full detail (for the
//                                     "resend confirmation" action and for
//                                     just seeing what a customer bought)

import { sendJson } from '../../src/lib/apiHelper.js';
import { requireAdmin } from '../../src/lib/adminAuth.js';
import prisma from '../../src/lib/prisma.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const id = searchParams.get('id');

  try {
    if (id) {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          customer: true,
          deliveryAddress: true,
          items: { include: { product: { select: { name: true } }, unit: { select: { serial: true } } } },
          payments: { select: { provider: true, status: true, amountCents: true, createdAt: true } },
        },
      });
      if (!order) return sendJson(res, 404, { error: 'Order not found.' });
      return sendJson(res, 200, { order });
    }

    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        customer: { select: { email: true, name: true } },
        items: { select: { id: true } },
        payments: { select: { status: true } },
      },
    });
    return sendJson(res, 200, { orders });
  } catch (err) {
    console.error('[admin/orders] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load orders.' });
  }
}
