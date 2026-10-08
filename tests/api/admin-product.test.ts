import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import productHandler from '../../src/server/admin/product.js';
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
  return buildAdminSessionCookie().split(';')[0];
}

describe('admin/product API handler — price/copy edit happy paths', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-product';
  });

  it('updates the base price for section: "price"', async () => {
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({
      slug: 'slow-bloom',
      basePriceCents: 15000,
    } as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'price', basePriceCents: 15000 },
    };
    const res = createMockRes();

    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.product.basePriceCents).toBe(15000);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { slug: 'slow-bloom' },
      data: { basePriceCents: 15000 },
    });
  });

  it('rejects a non-positive price with 400 and does not write', async () => {
    const updateSpy = vi.spyOn(prisma.product, 'update');

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'price', basePriceCents: 0 },
    };
    const res = createMockRes();

    await productHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('updates tagline/description for section: "copy"', async () => {
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({
      slug: 'slow-bloom',
      tagline: 'New tagline',
    } as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'copy', tagline: '  New tagline  ' },
    };
    const res = createMockRes();

    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { slug: 'slow-bloom' },
      data: { tagline: 'New tagline' },
    });
  });

  it('returns 400 for an unknown section', async () => {
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'not-a-real-section' },
    };
    const res = createMockRes();

    await productHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Unknown section.');
  });

  it('GET returns the product with its cost recipe when authenticated', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      id: 'product_1',
      slug: 'slow-bloom',
      basePriceCents: 12000,
      costRecipe: { materialSource: {} },
    } as any);
    // The handler also looks up the active drop (for the Passport tab's
    // "Made" field prefill) via prisma.drop.findFirst — unmocked, this spy
    // falls through to the real Prisma Client, which tries to actually
    // reach the database using CI's fake DATABASE_URL and throws
    // PrismaClientKnownRequestError. Mock it the same way as product above.
    vi.spyOn(prisma.drop, 'findFirst').mockResolvedValue({
      id: 'drop_1',
      status: 'LIVE',
      createdAt: new Date('2026-01-01'),
    } as any);

    const req = { method: 'GET', headers: { cookie: adminCookieHeader() } };
    const res = createMockRes();

    await productHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.product.slug).toBe('slow-bloom');
  });
});

// The entire "passport" section -- ageRangeMin/Max, designs, careSteps,
// safetyNotes, snapShareHashtags, and the passport-viewer JSON upload -- had
// zero test coverage before this block, despite being the core content
// backend for the whole digital-passport feature.
describe('admin/product API handler — passport section', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-product';
  });

  it('updates ageRangeMin/ageRangeMax, the designs array, and careSteps together', async () => {
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({ slug: 'slow-bloom' } as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: {
        section: 'passport',
        ageRangeMin: 4,
        ageRangeMax: 200,
        designs: ['Reusable cup warmer', 'Turtle'],
        careSteps: ['Hand wash cold', 'Lay flat to dry'],
      },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { slug: 'slow-bloom' },
      data: {
        ageRangeMin: 4,
        ageRangeMax: 200,
        designs: ['Reusable cup warmer', 'Turtle'],
        careSteps: ['Hand wash cold', 'Lay flat to dry'],
      },
    });
  });

  it('accepts ageRangeMin: 0 (a real, valid age) rather than treating it as absent', async () => {
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({ slug: 'slow-bloom' } as any);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport', ageRangeMin: 0 },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({ where: { slug: 'slow-bloom' }, data: { ageRangeMin: 0 } });
  });

  // The validation gap fixed in this pass: ageRangeMin/Max had no .min(0),
  // unlike every other numeric field in this file's schemas.
  it('rejects a negative ageRangeMin/ageRangeMax and does not write', async () => {
    const updateSpy = vi.spyOn(prisma.product, 'update');
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport', ageRangeMin: -5 },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('only writes fields actually present in the request body, leaving the rest untouched', async () => {
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({ slug: 'slow-bloom' } as any);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport', snapShareCopy: 'Tag us when you share your build!' },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({ where: { slug: 'slow-bloom' }, data: { snapShareCopy: 'Tag us when you share your build!' } });
  });

  it('clears a nullable text field when sent as an empty string', async () => {
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({ slug: 'slow-bloom' } as any);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport', careVideoUrl: '' },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({ where: { slug: 'slow-bloom' }, data: { careVideoUrl: null } });
  });
});

describe('admin/product API handler — passport-design (viewer package upload)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-product';
  });

  const validPackage = { format: 'unstitch-instructions', steps: [{ diagram: '<svg/>' }] };

  it('uploads a new design, merged alongside any existing ones rather than replacing them', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      slug: 'slow-bloom',
      passportDesigns: { Turtle: { format: 'unstitch-instructions', steps: [{}] } },
    } as any);
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({ slug: 'slow-bloom' } as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport-design', design: 'Mushroom', passportDesign: validPackage },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { slug: 'slow-bloom' },
      data: { passportDesigns: expect.objectContaining({ Turtle: expect.anything(), Mushroom: validPackage }) },
    });
  });

  it('rejects a package missing the required envelope shape', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({ slug: 'slow-bloom', passportDesigns: null } as any);
    const updateSpy = vi.spyOn(prisma.product, 'update');

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport-design', design: 'Mushroom', passportDesign: { steps: [] } },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('clears one design by name, leaving the others intact', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      slug: 'slow-bloom',
      passportDesigns: { Turtle: validPackage, Mushroom: validPackage },
    } as any);
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({ slug: 'slow-bloom' } as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport-design', clear: true, design: 'Mushroom' },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { slug: 'slow-bloom' },
      data: { passportDesigns: { Turtle: validPackage } },
    });
  });

  it('clears passportDesigns to null entirely when removing the last design', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue({
      slug: 'slow-bloom',
      passportDesigns: { Turtle: validPackage },
    } as any);
    const updateSpy = vi.spyOn(prisma.product, 'update').mockResolvedValue({ slug: 'slow-bloom' } as any);

    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport-design', clear: true, design: 'Turtle' },
    };
    const res = createMockRes();
    await productHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({ where: { slug: 'slow-bloom' }, data: { passportDesigns: null } });
  });

  it('returns 404 when the product does not exist', async () => {
    vi.spyOn(prisma.product, 'findUnique').mockResolvedValue(null);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { section: 'passport-design', design: 'Mushroom', passportDesign: validPackage },
    };
    const res = createMockRes();
    await productHandler(req, res);
    expect(res.statusCode).toBe(404);
  });
});
