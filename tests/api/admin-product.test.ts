import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import productHandler from '../../api/admin/product.js';
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
      slug: 'slow-bloom',
      basePriceCents: 12000,
      costRecipe: { materialSource: {} },
    } as any);

    const req = { method: 'GET', headers: { cookie: adminCookieHeader() } };
    const res = createMockRes();

    await productHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.product.slug).toBe('slow-bloom');
  });
});
