import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import inventoryHandler from '../../src/server/admin/inventory.js';
import { buildAdminSessionCookie } from '../../src/lib/adminAuth.js';

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

function adminCookieHeader() {
  const setCookie = buildAdminSessionCookie();
  return setCookie.split(';')[0];
}

const DROP_ID = '55313d4d-7180-4e08-bcb1-0d88642b6448';

const DROP = {
  id: DROP_ID,
  dropCode: 'D001',
  status: 'LIVE',
  totalUnits: 5,
  productId: 'prod-1',
};

describe('admin/inventory API handler — restock/void happy paths', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-inventory';
  });

  it('restock adds N new units filling the lowest unused edition numbers', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(DROP as any);
    vi.spyOn(prisma.unit, 'findMany').mockResolvedValue([
      { editionNumber: 1 },
      { editionNumber: 2 },
    ] as any);
    const transactionSpy = vi
      .spyOn(prisma, '$transaction')
      .mockResolvedValue([{ count: 2 }, { ...DROP, totalUnits: 7 }] as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { dropId: DROP_ID, action: 'restock', quantity: 2 },
    };
    const res = createMockRes();

    await inventoryHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.unitsAdded).toBe(2);
    expect(res.body.startingEdition).toBe(3); // 1 and 2 already used
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it('void marks the most-recently-added in-stock units as VOID and lowers totalUnits', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(DROP as any);
    vi.spyOn(prisma.unit, 'findMany').mockResolvedValue([
      { id: 'unit-5', serial: 'UX-D001-005' },
      { id: 'unit-4', serial: 'UX-D001-004' },
    ] as any);
    vi.spyOn(prisma, '$transaction').mockResolvedValue([
      { count: 2 },
      { ...DROP, totalUnits: 3 },
    ] as any);
    vi.spyOn(prisma.unit, 'count').mockResolvedValue(3); // still some in stock

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { dropId: DROP_ID, action: 'void', quantity: 2 },
    };
    const res = createMockRes();

    await inventoryHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.unitsVoided).toBe(2);
    expect(res.body.voidedSerials).toEqual(['UX-D001-005', 'UX-D001-004']);
  });

  it('void returns 400 when fewer in-stock units are available than requested', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(DROP as any);
    vi.spyOn(prisma.unit, 'findMany').mockResolvedValue([{ id: 'unit-5', serial: 'UX-D001-005' }] as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { dropId: DROP_ID, action: 'void', quantity: 3 },
    };
    const res = createMockRes();

    await inventoryHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Only 1 unit(s)');
  });
});

// Gift acknowledgement (Unit.isGift/giftGiverName/giftGiverEmail and this
// send-gift-ack action) had zero test coverage anywhere before this block.
describe('admin/inventory API handler — send-gift-ack', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-inventory';
    // Dev/mock-send path (see sendGiftAcknowledgement's own comment) --
    // no RESEND_API_KEY means it logs and resolves instead of calling out.
    delete process.env.RESEND_API_KEY;
  });

  const UNIT_ID = 'b0000000-0000-4000-8000-000000000002';

  function giftUnit(overrides: Record<string, any> = {}) {
    return {
      id: UNIT_ID,
      dropId: DROP_ID,
      serial: 'UX-D001-003',
      isGift: true,
      giftGiverName: 'Priya',
      giftGiverEmail: 'priya@example.com',
      giftAcknowledgementSentAt: null,
      product: { name: 'Slow Bloom Kit' },
      currentOwner: { name: 'Sam' },
      ...overrides,
    };
  }

  it('sends the thank-you email and records giftAcknowledgementSentAt', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(DROP as any);
    vi.spyOn(prisma.unit, 'findUnique').mockResolvedValue(giftUnit() as any);
    const updateSpy = vi.spyOn(prisma.unit, 'update').mockResolvedValue(giftUnit({ giftAcknowledgementSentAt: new Date() }) as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { dropId: DROP_ID, action: 'send-gift-ack', unitId: UNIT_ID },
    };
    const res = createMockRes();
    await inventoryHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({ where: { id: UNIT_ID }, data: { giftAcknowledgementSentAt: expect.any(Date) } });
  });

  it('rejects a unit that was never marked as a gift', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(DROP as any);
    vi.spyOn(prisma.unit, 'findUnique').mockResolvedValue(giftUnit({ isGift: false, giftGiverEmail: null }) as any);
    const updateSpy = vi.spyOn(prisma.unit, 'update');

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { dropId: DROP_ID, action: 'send-gift-ack', unitId: UNIT_ID },
    };
    const res = createMockRes();
    await inventoryHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('rejects sending a second thank-you for a unit already acknowledged', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(DROP as any);
    vi.spyOn(prisma.unit, 'findUnique').mockResolvedValue(giftUnit({ giftAcknowledgementSentAt: new Date('2026-01-01') }) as any);
    const updateSpy = vi.spyOn(prisma.unit, 'update');

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { dropId: DROP_ID, action: 'send-gift-ack', unitId: UNIT_ID },
    };
    const res = createMockRes();
    await inventoryHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('returns 404 when the unit belongs to a different drop', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(DROP as any);
    vi.spyOn(prisma.unit, 'findUnique').mockResolvedValue(giftUnit({ dropId: 'some-other-drop' }) as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { dropId: DROP_ID, action: 'send-gift-ack', unitId: UNIT_ID },
    };
    const res = createMockRes();
    await inventoryHandler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when unitId is missing', async () => {
    vi.spyOn(prisma.drop, 'findUnique').mockResolvedValue(DROP as any);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { dropId: DROP_ID, action: 'send-gift-ack' },
    };
    const res = createMockRes();
    await inventoryHandler(req, res);
    expect(res.statusCode).toBe(400);
  });
});
