// api/[...route].js
// Catch-all dispatcher for the 10 remaining customer-facing endpoints
// (contact, share, subscribe, delivery-quote, drop-status, order-lookup,
// order-lookup-request, order-status, passport, passport-confirm-transfer),
// consolidated into a single Vercel Serverless Function. Vercel's Hobby
// plan caps a deployment at 12 Serverless Functions; this repo previously
// shipped 20 files under api/, one function each.
//
// These are lighter-traffic paths (form submits, QR scans, order status
// checks) — consolidating them here keeps them out of the genuinely hot
// checkout path, which stays isolated in its own standalone function (see
// api/create-checkout-session.js), and out of the payment-critical,
// raw-body-sensitive Stripe webhook (api/stripe-webhook.js). Admin routes
// are handled by the separate api/admin/[...action].js dispatcher, not
// this one.
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

import { sendJson } from '../src/lib/apiHelper.js';
import contact from '../src/server/contact.js';
import share from '../src/server/share.js';
import subscribe from '../src/server/subscribe.js';
import deliveryQuote from '../src/server/delivery-quote.js';
import dropStatus from '../src/server/drop-status.js';
import orderLookup from '../src/server/order-lookup.js';
import orderLookupRequest from '../src/server/order-lookup-request.js';
import orderStatus from '../src/server/order-status.js';
import passport from '../src/server/passport.js';
import passportConfirmTransfer from '../src/server/passport-confirm-transfer.js';
import events from '../src/server/events.js';

const ROUTES = {
  contact,
  share,
  subscribe,
  'delivery-quote': deliveryQuote,
  'drop-status': dropStatus,
  'order-lookup': orderLookup,
  'order-lookup-request': orderLookupRequest,
  'order-status': orderStatus,
  passport,
  'passport-confirm-transfer': passportConfirmTransfer,
  events,
};

export default async function handler(req, res) {
  const { pathname } = new URL(req.url, 'http://placeholder.local');
  const prefix = '/api/';
  const route = pathname.startsWith(prefix) ? pathname.slice(prefix.length).split('/')[0] : '';

  const target = ROUTES[route];
  if (!target) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  return target(req, res);
}
