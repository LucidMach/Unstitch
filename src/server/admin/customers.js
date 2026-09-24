// api/admin/customers.js
// GET  /api/admin/customers            -> unified list of all contacts (customers,
//   subscribers, raffle entries, contact submissions, and playground exports)
//   with derived order count, lifetime spend, and source roles.
// GET  /api/admin/customers?id=<uuid>  -> one customer's full record
// POST /api/admin/customers            -> { customerId, email?, name?, phone? }
//   updates the customer's own details.

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';

const UpdateCustomerSchema = z
  .object({
    customerId: z.string().trim().min(1).optional(),
    email: z.string().trim().toLowerCase().email('Enter a valid email').optional(),
    name: z.string().trim().max(200).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
  })
  .refine((data) => !!(data.customerId || data.email), {
    message: 'Either customerId or email is required.',
    path: ['customerId'],
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
    let { customerId, email, name, phone } = parseResult.data;
    try {
      if (!customerId && email) {
        const cust = await prisma.customer.findUnique({ where: { email } });
        if (cust) {
          customerId = cust.id;
        } else {
          const sub = await prisma.subscriber.findUnique({ where: { email } });
          if (sub) {
            customerId = `sub-${sub.id}`;
          } else {
            const ct = await prisma.contactSubmission.findFirst({ where: { email } });
            if (ct) {
              customerId = `ct-${ct.id}`;
            }
          }
        }
      }

      if (!customerId) {
        return sendJson(res, 404, { error: 'Customer or contact entry not found.' });
      }

      if (customerId.startsWith('sub-')) {
        const subId = parseInt(customerId.slice(4), 10);
        if (isNaN(subId)) return sendJson(res, 400, { error: 'Invalid subscriber ID.' });

        const existing = await prisma.subscriber.findUnique({ where: { id: subId } });
        if (!existing) return sendJson(res, 404, { error: 'Subscriber entry not found.' });

        if (email && email !== existing.email) {
          const clash = await prisma.subscriber.findUnique({ where: { email } });
          if (clash) {
            return sendJson(res, 409, { error: `Another subscriber already uses ${email}.` });
          }
        }

        const updated = await prisma.subscriber.update({
          where: { id: subId },
          data: {
            email: email ?? undefined,
            name: name === undefined ? undefined : name || null,
          },
        });

        try {
          const existingCust = await prisma.customer.findFirst({
            where: { OR: [{ email: existing.email }, { email: updated.email }] },
          });
          if (existingCust) {
            await prisma.customer.update({
              where: { id: existingCust.id },
              data: {
                email: email ?? undefined,
                name: name === undefined ? undefined : name || null,
                phone: phone === undefined ? undefined : phone || null,
              },
            });
          } else if (phone) {
            await prisma.customer.create({
              data: {
                email: updated.email,
                name: updated.name || null,
                phone: phone || null,
              },
            });
          }
        } catch (syncErr) {
          console.warn('[admin/customers] Sync customer error (non-fatal):', syncErr);
        }

        return sendJson(res, 200, {
          customer: {
            id: customerId,
            email: updated.email,
            name: updated.name,
            phone: phone || null,
            createdAt: updated.createdAt,
          },
        });
      }

      if (customerId.startsWith('ct-')) {
        const ctId = parseInt(customerId.slice(3), 10);
        if (isNaN(ctId)) return sendJson(res, 400, { error: 'Invalid contact ID.' });

        const existing = await prisma.contactSubmission.findUnique({ where: { id: ctId } });
        if (!existing) return sendJson(res, 404, { error: 'Contact submission not found.' });

        const updated = await prisma.contactSubmission.update({
          where: { id: ctId },
          data: {
            email: email ?? undefined,
            name: name === undefined ? undefined : name || undefined,
            phone: phone === undefined ? undefined : phone || null,
          },
        });

        try {
          const existingCust = await prisma.customer.findFirst({
            where: { OR: [{ email: existing.email }, { email: updated.email }] },
          });
          if (existingCust) {
            await prisma.customer.update({
              where: { id: existingCust.id },
              data: {
                email: email ?? undefined,
                name: name === undefined ? undefined : name || null,
                phone: phone === undefined ? undefined : phone || null,
              },
            });
          } else if (phone) {
            await prisma.customer.create({
              data: {
                email: updated.email,
                name: updated.name || null,
                phone: phone || null,
              },
            });
          }
        } catch (syncErr) {
          console.warn('[admin/customers] Sync customer error (non-fatal):', syncErr);
        }

        return sendJson(res, 200, {
          customer: {
            id: customerId,
            email: updated.email,
            name: updated.name,
            phone: updated.phone || null,
            createdAt: updated.createdAt,
          },
        });
      }

      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(customerId);
      let existing = null;
      if (isUuid) {
        existing = await prisma.customer.findUnique({ where: { id: customerId } });
      }
      if (!existing && email) {
        existing = await prisma.customer.findUnique({ where: { email } });
      }
      if (!existing) return sendJson(res, 404, { error: 'Customer not found.' });

      const targetId = existing.id;

      if (email && email !== existing.email) {
        const clash = await prisma.customer.findUnique({ where: { email } });
        if (clash) {
          return sendJson(res, 409, { error: `Another customer already uses ${email}.` });
        }
      }

      const customer = await prisma.customer.update({
        where: { id: targetId },
        data: {
          email: email ?? undefined,
          name: name === undefined ? undefined : name || null,
          phone: phone === undefined ? undefined : phone || null,
        },
      });

      if (email && email !== existing.email) {
        try {
          if (prisma.subscriber?.updateMany) {
            await prisma.subscriber.updateMany({
              where: { email: existing.email },
              data: { email, name: name === undefined ? undefined : name || null },
            });
          }
          if (prisma.contactSubmission?.updateMany) {
            await prisma.contactSubmission.updateMany({
              where: { email: existing.email },
              data: {
                email,
                name: name === undefined ? undefined : name || undefined,
                phone: phone === undefined ? undefined : phone || null,
              },
            });
          }
        } catch (syncErr) {
          console.warn('[admin/customers] Cross-table sync non-fatal warning:', syncErr);
        }
      }

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
  const typeFilter = (searchParams.get('type') || 'all').toLowerCase();

  try {
    if (id) {
      if (id.startsWith('sub-')) {
        const subId = parseInt(id.slice(4), 10);
        const sub = await prisma.subscriber.findUnique({ where: { id: subId } });
        if (!sub) return sendJson(res, 404, { error: 'Subscriber not found.' });
        return sendJson(res, 200, {
          customer: {
            id,
            email: sub.email,
            name: sub.name,
            phone: null,
            createdAt: sub.createdAt,
          },
        });
      }
      if (id.startsWith('ct-')) {
        const ctId = parseInt(id.slice(3), 10);
        const ct = await prisma.contactSubmission.findUnique({ where: { id: ctId } });
        if (!ct) return sendJson(res, 404, { error: 'Contact submission not found.' });
        return sendJson(res, 200, {
          customer: {
            id,
            email: ct.email,
            name: ct.name,
            phone: ct.phone,
            createdAt: ct.createdAt,
          },
        });
      }
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
      if (!isUuid) return sendJson(res, 404, { error: 'Customer not found.' });

      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) return sendJson(res, 404, { error: 'Customer not found.' });
      return sendJson(res, 200, { customer });
    }

    // Parallel fetch from Neon DB: Customers, Subscribers, and ContactSubmissions
    const [customers, subscribers, contacts] = await Promise.all([
      prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          createdAt: true,
        },
      }),
      prisma.subscriber.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          email: true,
          name: true,
          source: true,
          createdAt: true,
        },
      }),
      prisma.contactSubmission.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          subject: true,
          message: true,
          createdAt: true,
        },
      }),
    ]);

    // Aggregate order count + lifetime spend per customer in DB
    const customerIds = customers.map((c) => c.id);
    const aggregates = customerIds.length
      ? await prisma.order.groupBy({
          by: ['customerId'],
          where: { customerId: { in: customerIds } },
          _count: true,
          _sum: { totalCents: true },
        })
      : [];
    const aggregateByCustomerId = new Map(
      aggregates.map((a) => [a.customerId, a])
    );

    // Map by normalized email for deduplication and composite roles
    const unifiedMap = new Map();

    // 1. Process buyers (Customers)
    for (const c of customers) {
      const email = c.email.toLowerCase().trim();
      const agg = aggregateByCustomerId.get(c.id);
      unifiedMap.set(email, {
        id: c.id,
        email,
        name: c.name || null,
        phone: c.phone || null,
        roles: ['customer'],
        orderCount: agg?._count ?? 0,
        totalSpentCents: agg?._sum.totalCents ?? 0,
        sources: ['store-order'],
        subject: null,
        createdAt: c.createdAt,
      });
    }

    // 2. Process Subscribers (General, Waitlist, Raffle, Playground Exports)
    for (const s of subscribers) {
      const email = s.email.toLowerCase().trim();
      const src = (s.source || '').toLowerCase();
      let role = 'subscriber';
      if (src.includes('raffle') || src.includes('festival') || src.includes('zwf')) {
        role = 'raffle';
      } else if (src.includes('playground') || src.includes('export') || src.includes('share')) {
        role = 'playground_export';
      }

      const existing = unifiedMap.get(email);
      if (existing) {
        if (!existing.roles.includes(role)) existing.roles.push(role);
        if (s.source && !existing.sources.includes(s.source)) existing.sources.push(s.source);
        if (!existing.name && s.name) existing.name = s.name;
      } else {
        unifiedMap.set(email, {
          id: `sub-${s.id}`,
          email,
          name: s.name || null,
          phone: null,
          roles: [role],
          orderCount: 0,
          totalSpentCents: 0,
          sources: s.source ? [s.source] : ['newsletter'],
          subject: null,
          createdAt: s.createdAt,
        });
      }
    }

    // 3. Process Contact Submissions
    for (const ct of contacts) {
      const email = ct.email.toLowerCase().trim();
      const existing = unifiedMap.get(email);
      if (existing) {
        if (!existing.roles.includes('contact')) existing.roles.push('contact');
        if (!existing.name && ct.name) existing.name = ct.name;
        if (!existing.phone && ct.phone) existing.phone = ct.phone;
        if (!existing.subject) existing.subject = ct.subject;
      } else {
        unifiedMap.set(email, {
          id: `ct-${ct.id}`,
          email,
          name: ct.name || null,
          phone: ct.phone || null,
          roles: ['contact'],
          orderCount: 0,
          totalSpentCents: 0,
          sources: ['contact-form'],
          subject: ct.subject || null,
          createdAt: ct.createdAt,
        });
      }
    }

    const allContacts = Array.from(unifiedMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Compute segment counts
    const counts = {
      all: allContacts.length,
      customers: allContacts.filter((c) => c.roles.includes('customer')).length,
      subscribers: allContacts.filter((c) => c.roles.includes('subscriber')).length,
      raffles: allContacts.filter((c) => c.roles.includes('raffle')).length,
      contacts: allContacts.filter((c) => c.roles.includes('contact')).length,
      exports: allContacts.filter((c) => c.roles.includes('playground_export')).length,
    };

    // Filter by type if requested
    let result = allContacts;
    if (typeFilter === 'customers') {
      result = allContacts.filter((c) => c.roles.includes('customer'));
    } else if (typeFilter === 'subscribers') {
      result = allContacts.filter((c) => c.roles.includes('subscriber'));
    } else if (typeFilter === 'raffles' || typeFilter === 'raffle') {
      result = allContacts.filter((c) => c.roles.includes('raffle'));
    } else if (typeFilter === 'contacts' || typeFilter === 'contact') {
      result = allContacts.filter((c) => c.roles.includes('contact'));
    } else if (typeFilter === 'exports' || typeFilter === 'playground') {
      result = allContacts.filter((c) => c.roles.includes('playground_export'));
    }

    return sendJson(res, 200, { customers: result, counts });
  } catch (err) {
    console.error('[admin/customers] Lookup failed:', err);
    return sendJson(res, 500, { error: 'Unable to load customers.' });
  }
}
