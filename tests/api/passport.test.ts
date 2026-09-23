import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import passportHandler from '../../api/passport.js';
import confirmTransferHandler from '../../api/passport-confirm-transfer.js';
import { limiter } from '../../src/lib/rateLimit.js';
import { sign } from '../../src/lib/signedToken.js';

// signedToken.sign()/verify() throw if SESSION_SECRET isn't set — nothing
// else in the test env sets it (vitest.config.ts only stubs DATABASE_URL),
// so this file sets its own, matching how it sets RESEND_API_KEY per test
// below rather than relying on any real secret.
process.env.SESSION_SECRET = 'test-session-secret-for-passport-tests';

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: (...args: any[]) => mockSend(...args),
    };
  },
}));

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

const BASE_UNIT = {
  id: 'unit-1',
  serial: 'UX-D001-007',
  qrSlug: 'UX-D001-007',
  editionNumber: 7,
  status: 'SOLD',
  registeredAt: null,
  currentOwnerCustomerId: null,
  currentOwner: null,
  drop: { dropCode: 'D001', totalUnits: 40, madeLocation: 'Naarm', madeYear: 2025 },
  product: {
    name: 'Slow Bloom',
    slug: 'slow-bloom',
    tagline: null,
    colourPalette: [],
    tileMaterial: null,
    materialRigidity: null,
    kitContents: [],
    imageUrl: null,
  },
};

describe('Passport API (/api/passport)', () => {
  beforeEach(() => {
    limiter.reset();
    mockSend.mockClear();
    vi.restoreAllMocks();
  });

  describe('GET /api/passport', () => {
    it('never exposes registeredOwnerName to an unauthenticated request, even if the loaded unit carries owner data', async () => {
      if (!prisma) return;
      // Even though the public GET handler deliberately doesn't `include`
      // currentOwner, this simulates a defence-in-depth check: if owner
      // data were present on the object for any reason, the public
      // response must still omit it (serializeUnit defaults includeOwnerName
      // to false).
      vi.spyOn(prisma.unit, 'findFirst').mockResolvedValue({
        ...BASE_UNIT,
        status: 'REGISTERED',
        registeredAt: new Date(),
        currentOwner: { id: 'cust-1', email: 'jane@example.com', name: 'Jane Doe' },
      } as any);

      const req = { method: 'GET', url: '/api/passport?serial=UX-D001-007' };
      const res = createMockRes();
      await passportHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.unit.registered).toBe(true);
      expect(res.body.unit.registeredOwnerName).toBeNull();
      expect(res.body.unit).not.toHaveProperty('currentOwner');
    });

    it('returns 404 for an unknown serial', async () => {
      if (!prisma) return;
      vi.spyOn(prisma.unit, 'findFirst').mockResolvedValue(null);

      const req = { method: 'GET', url: '/api/passport?serial=NOPE' };
      const res = createMockRes();
      await passportHandler(req as any, res);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/passport — first-time registration', () => {
    it('claims an unregistered sold unit directly, with no email sent', async () => {
      if (!prisma) return;
      vi.spyOn(prisma.unit, 'findFirst').mockResolvedValue({ ...BASE_UNIT } as any);
      const upsertSpy = vi.spyOn(prisma.customer, 'upsert').mockResolvedValue({ id: 'cust-new', email: 'new@example.com', name: 'New Owner' } as any);
      const updateSpy = vi.spyOn(prisma.unit, 'update').mockResolvedValue({
        ...BASE_UNIT,
        status: 'REGISTERED',
        registeredAt: new Date(),
        currentOwner: { name: 'New Owner' },
      } as any);

      const req = {
        method: 'POST',
        body: { serial: 'UX-D001-007', email: 'new@example.com', name: 'New Owner' },
      };
      const res = createMockRes();
      await passportHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.unit.registered).toBe(true);
      expect(res.body.unit.registeredOwnerName).toBe('New Owner');
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/passport — already registered', () => {
    it('self-update: same email (case-insensitive) writes directly, no email round trip', async () => {
      if (!prisma) return;
      vi.spyOn(prisma.unit, 'findFirst').mockResolvedValue({
        ...BASE_UNIT,
        status: 'REGISTERED',
        registeredAt: new Date(),
        currentOwnerCustomerId: 'cust-1',
        currentOwner: { id: 'cust-1', email: 'jane@example.com', name: 'Jane' },
      } as any);
      const upsertSpy = vi.spyOn(prisma.customer, 'upsert').mockResolvedValue({ id: 'cust-1', email: 'jane@example.com', name: 'Jane Doe' } as any);
      const updateSpy = vi.spyOn(prisma.unit, 'update').mockResolvedValue({
        ...BASE_UNIT,
        status: 'REGISTERED',
        registeredAt: new Date(),
        currentOwner: { name: 'Jane Doe' },
      } as any);

      const req = {
        method: 'POST',
        body: { serial: 'UX-D001-007', email: 'JANE@EXAMPLE.COM', name: 'Jane Doe' },
      };
      const res = createMockRes();
      await passportHandler(req as any, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.unit.registeredOwnerName).toBe('Jane Doe');
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('cross-email transfer attempt: returns pending, emails the current owner exactly once, and does not mutate the unit', async () => {
      if (!prisma) return;
      const originalApiKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 're_test_key_123';

      vi.spyOn(prisma.unit, 'findFirst').mockResolvedValue({
        ...BASE_UNIT,
        status: 'REGISTERED',
        registeredAt: new Date(),
        currentOwnerCustomerId: 'cust-1',
        currentOwner: { id: 'cust-1', email: 'jane@example.com', name: 'Jane' },
      } as any);
      const upsertSpy = vi.spyOn(prisma.customer, 'upsert');
      const updateSpy = vi.spyOn(prisma.unit, 'update');

      const req = {
        method: 'POST',
        body: { serial: 'UX-D001-007', email: 'bob@example.com', name: 'Bob' },
      };
      const res = createMockRes();
      await passportHandler(req as any, res);

      expect(res.statusCode).toBe(409);
      expect(res.body.pending).toBe(true);
      expect(typeof res.body.message).toBe('string');
      expect(mockSend).toHaveBeenCalledTimes(1);
      // The email must go to the *current* owner, never the requester.
      const sentTo = mockSend.mock.calls[0][0].to;
      expect(sentTo).toBe('jane@example.com');
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();

      process.env.RESEND_API_KEY = originalApiKey;
    });
  });
});

describe('Passport transfer confirmation (/api/passport-confirm-transfer)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const currentOwnerCustomerId = 'cust-1';
  function mintToken(overrides: Record<string, any> = {}, ttlSeconds = 3600) {
    return sign(
      {
        kind: 'passport-transfer',
        unitId: 'unit-1',
        currentOwnerCustomerId,
        newOwnerEmail: 'bob@example.com',
        newOwnerName: 'Bob',
        ...overrides,
      },
      ttlSeconds,
    );
  }

  it('completes the reassignment on a valid token', async () => {
    if (!prisma) return;
    vi.spyOn(prisma.unit, 'findUnique').mockResolvedValue({
      ...BASE_UNIT,
      id: 'unit-1',
      status: 'REGISTERED',
      currentOwnerCustomerId,
    } as any);
    const upsertSpy = vi.spyOn(prisma.customer, 'upsert').mockResolvedValue({ id: 'cust-2', email: 'bob@example.com', name: 'Bob' } as any);
    const updateSpy = vi.spyOn(prisma.unit, 'update').mockResolvedValue({} as any);

    const token = mintToken();
    const req = { method: 'GET', url: `/api/passport-confirm-transfer?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await confirmTransferHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.confirmed).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'bob@example.com' } }),
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentOwnerCustomerId: 'cust-2' }) }),
    );
  });

  it('rejects an expired token', async () => {
    const token = mintToken({}, -10);
    const req = { method: 'GET', url: `/api/passport-confirm-transfer?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await confirmTransferHandler(req as any, res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const token = mintToken();
    const [payloadB64, signature] = token.split('.');
    const flippedChar = signature[0] === 'a' ? 'b' : 'a';
    const tampered = `${payloadB64}.${flippedChar}${signature.slice(1)}`;

    const req = { method: 'GET', url: `/api/passport-confirm-transfer?token=${encodeURIComponent(tampered)}` };
    const res = createMockRes();
    await confirmTransferHandler(req as any, res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects a token with the wrong kind', async () => {
    const token = sign({ kind: 'order-lookup', unitId: 'unit-1', currentOwnerCustomerId, newOwnerEmail: 'bob@example.com' }, 3600);
    const req = { method: 'GET', url: `/api/passport-confirm-transfer?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await confirmTransferHandler(req as any, res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects a stale token whose unit has since been reassigned to someone else', async () => {
    if (!prisma) return;
    vi.spyOn(prisma.unit, 'findUnique').mockResolvedValue({
      ...BASE_UNIT,
      id: 'unit-1',
      status: 'REGISTERED',
      currentOwnerCustomerId: 'someone-else-entirely',
    } as any);
    const updateSpy = vi.spyOn(prisma.unit, 'update');

    const token = mintToken();
    const req = { method: 'GET', url: `/api/passport-confirm-transfer?token=${encodeURIComponent(token)}` };
    const res = createMockRes();
    await confirmTransferHandler(req as any, res);

    expect(res.statusCode).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when the token is missing', async () => {
    const req = { method: 'GET', url: '/api/passport-confirm-transfer' };
    const res = createMockRes();
    await confirmTransferHandler(req as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects non-GET methods with 405', async () => {
    const req = { method: 'POST', url: '/api/passport-confirm-transfer' };
    const res = createMockRes();
    await confirmTransferHandler(req as any, res);

    expect(res.statusCode).toBe(405);
  });
});
