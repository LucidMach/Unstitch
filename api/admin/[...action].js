// api/admin/[...action].js
// Catch-all dispatcher for the 8 admin-panel endpoints, consolidated into a
// single Vercel Serverless Function. Vercel's Hobby plan caps a deployment
// at 12 Serverless Functions; this repo previously shipped 20 files under
// api/, one function each. Admin has a single internal user and no
// traffic-shape sensitivity, so bundling all 8 admin handlers behind one
// catch-all function is safe (unlike checkout/stripe-webhook, which stay
// standalone — see api/create-checkout-session.js / api/stripe-webhook.js).
//
// Parses the path itself rather than relying on Vercel's automatic
// `req.query` population for catch-all routes — this reuses the same
// manual `new URL(req.url, 'http://placeholder.local')` pattern every
// existing handler already uses to read URL params (e.g.
// src/server/order-lookup.js, src/server/drop-status.js).
//
// Method dispatch (GET vs POST) stays inside each moved handler exactly as
// before — this file only ever decides *which* handler to call, never
// which HTTP method is valid for it.

import { sendJson } from '../../src/lib/apiHelper.js';
import customers from '../../src/server/admin/customers.js';
import inventory from '../../src/server/admin/inventory.js';
import login from '../../src/server/admin/login.js';
import logout from '../../src/server/admin/logout.js';
import manualOrder from '../../src/server/admin/manual-order.js';
import orders from '../../src/server/admin/orders.js';
import product from '../../src/server/admin/product.js';
import sendEmail from '../../src/server/admin/send-email.js';
import events from '../../src/server/admin/events.js';
import batchDrops from '../../src/server/admin/batch-drops.js';

const ROUTES = {
  customers,
  inventory,
  login,
  logout,
  'manual-order': manualOrder,
  orders,
  product,
  'send-email': sendEmail,
  events,
  'batch-drops': batchDrops,
};

export default async function handler(req, res) {
  const { pathname } = new URL(req.url, 'http://placeholder.local');
  const prefix = '/api/admin/';
  const action = pathname.startsWith(prefix) ? pathname.slice(prefix.length).split('/')[0] : '';

  const target = ROUTES[action];
  if (!target) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  return target(req, res);
}
