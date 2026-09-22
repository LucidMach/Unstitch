// api/admin/customers.js
// GET  /api/admin/customers            -> every customer with a derived
//   order count and lifetime spend, so the admin panel can answer "who are
//   our customers" and serve as a recipient picker for the bulk-email
//   feature (see admin/index.astro's Customers tab).
// GET  /api/admin/customers?id=<uuid>  -> one customer's full record
//   (including phone, which the list view leaves out) for the edit panel.
// POST /api/admin/customers            -> { customerId, email?, name?,
//   phone? } updates the customer's own details. Deliberately narrow: this
//   only ever touches the Customer row itself (fixing a typo'd email, adding
//   a phone number, correcting a name) — it does not touch past orders or
//   their delivery addresses, which keep whatever was true at the time.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../src/lib/apiHelper.js';
import { requireAdmin } from '../../src/lib/adminAuth.js';
import prisma from '../../src/lib/prisma.js';

const UpdateCustomerSchema = z.object({
  customerId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional(),
  name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});

export default async function handler(req, res) {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });
  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST') {
    const body = parseRequestBody(req);
    const parseResult = UpdateCustomerSchema.safeParse(body);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { customerId, email, name, phone } = parseResult.data;
    try {
      const existing = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!existing) return sendJson(res, 404, { error: 'Customer not found.' });

      if (email && email !== existing.email) {
        const clash = await prisma.customer.findUnique({ where: { email } });
        if (clash) {
          return sendJson(res, 409, { error: `Another customer already uses ${email}.` });
        }
      }

      const customer = await prisma.customer.update({
        where: { id: customerId },
        data: {
          email: email ?? undefined,
          name: name === undefined ? undefined : name || null,
          phone: phone === undefined ? undefined : phone || null,
        },
      });
      return sendJson(res, 200, { customer });
    } catch (err) {
      console.error('[admin/customers] Update failed:', err);
      return sendJson(res, 500, { error: 'Failed to update customer.' });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const id = searchParams.get('id');

  try {
    if (id) {
      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) return sendJson(res, 404, { error: 'Customer not found.' });
      return sendJson(res, 200, { customer });
    }

    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        orders: { select: { totalCents: true } },
      },
    });

    const result = customers.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      createdAt: c.createdAt,
      orderCount: c.orders.length,
      totalSpentCents: c.orders.reduce((sum, o) => sum + o.totalCents, 0),
    }));

    return sendJson(res, 200, { customers: result });
  } catch (err) {
    console.error('[admin/customers] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load customers.' });
  }
}
