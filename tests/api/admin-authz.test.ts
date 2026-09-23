// Regression guard for "an admin endpoint accidentally ships without its
// requireAdmin() check" — every api/admin/*.js handler (except login/logout,
// which are intentionally unauthenticated) must reject a request with no
// session cookie with 401 and must not touch the database at all.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';

import customersHandler from '../../src/server/admin/customers.js';
import inventoryHandler from '../../src/server/admin/inventory.js';
import manualOrderHandler from '../../src/server/admin/manual-order.js';
import ordersHandler from '../../src/server/admin/orders.js';
import productHandler from '../../src/server/admin/product.js';
import sendEmailHandler from '../../src/server/admin/send-email.js';
import eventsHandler from '../../src/server/admin/events.js';
import batchDropsHandler from '../../src/server/admin/batch-drops.js';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key: string, val: string) {
      res.headers[key.toLowerCase()] = val;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
    end(data?: any) {
      if (data) {
        try {
          res.body = JSON.parse(data);
        } catch {
          res.body = data;
        }
      }
      return res;
    },
  };
  return res;
}

// Every model delegate the Prisma schema exposes, so this guard doesn't need
// updating every time an admin endpoint starts touching a new model.
const WRITE_MODELS = [
  'subscriber', 'contactSubmission', 'materialArchiveCard', 'givingProgram', 'materialSource',
  'productCostRecipe', 'product', 'drop', 'unit', 'customer', 'address', 'deliveryZone', 'cart',
  'cartItem', 'reservation', 'wishlist', 'order', 'orderItem', 'payment', 'refund',
  'givingLedgerEntry', 'review', 'adminUser', 'event',
];
const WRITE_METHODS = ['create', 'update', 'upsert', 'delete', 'createMany', 'updateMany', 'deleteMany'];

/** Spies on every write-shaped method across every model, plus $transaction/$executeRaw. */
function spyOnAllWrites() {
  const spies: ReturnType<typeof vi.spyOn>[] = [];
  for (const model of WRITE_MODELS) {
    const delegate = (prisma as any)[model];
    if (!delegate) continue;
    for (const method of WRITE_METHODS) {
      if (typeof delegate[method] === 'function') {
        spies.push(vi.spyOn(delegate, method).mockResolvedValue({} as any));
      }
    }
  }
  spies.push(vi.spyOn(prisma, '$transaction').mockResolvedValue({} as any));
  spies.push(vi.spyOn(prisma, '$executeRaw').mockResolvedValue(0 as any));
  return spies;
}

const ENDPOINTS: Array<{ name: string; handler: any; method: string; body?: any }> = [
  { name: 'admin/customers', handler: customersHandler, method: 'GET' },
  { name: 'admin/inventory', handler: inventoryHandler, method: 'GET' },
  { name: 'admin/manual-order', handler: manualOrderHandler, method: 'POST', body: {} },
  { name: 'admin/orders', handler: ordersHandler, method: 'GET' },
  { name: 'admin/product', handler: productHandler, method: 'GET' },
  { name: 'admin/send-email', handler: sendEmailHandler, method: 'POST', body: {} },
  { name: 'admin/events', handler: eventsHandler, method: 'GET' },
  { name: 'admin/batch-drops', handler: batchDropsHandler, method: 'GET' },
];

describe('Admin endpoint authorization regression guard (no session cookie)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(ENDPOINTS)('$name rejects an unauthenticated request with 401 and performs no writes', async ({ handler, method, body }) => {
    const writeSpies = spyOnAllWrites();
    const req: any = { method, headers: {}, body: body ?? {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    for (const spy of writeSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it.each(ENDPOINTS)('$name still rejects a request bearing a tampered/forged session cookie', async ({ handler, method, body }) => {
    const writeSpies = spyOnAllWrites();
    const req: any = {
      method,
      headers: { cookie: 'unstitch_admin_session=not-a-real-signed-token' },
      body: body ?? {},
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    for (const spy of writeSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
