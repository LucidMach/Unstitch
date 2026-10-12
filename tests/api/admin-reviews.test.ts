import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import reviewsHandler from '../../src/server/admin/reviews.js';
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

describe('admin/reviews API handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-reviews';
  });

  it('rejects unauthenticated GET requests with 401', async () => {
    const req: any = { method: 'GET', headers: {}, url: '/api/admin/reviews' };
    const res = createMockRes();
    await reviewsHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects unauthenticated POST requests with 401', async () => {
    const req: any = { method: 'POST', headers: {}, body: {} };
    const res = createMockRes();
    await reviewsHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('defaults the GET list to PENDING reviews', async () => {
    const findManySpy = vi.spyOn(prisma.review, 'findMany').mockResolvedValue([] as any);
    const req: any = {
      method: 'GET',
      headers: { cookie: adminCookieHeader() },
      url: '/api/admin/reviews',
    };
    const res = createMockRes();
    await reviewsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PENDING' } }));
  });

  it('returns every review when ?status=all is passed', async () => {
    const findManySpy = vi.spyOn(prisma.review, 'findMany').mockResolvedValue([] as any);
    const req: any = {
      method: 'GET',
      headers: { cookie: adminCookieHeader() },
      url: '/api/admin/reviews?status=all',
    };
    const res = createMockRes();
    await reviewsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('publishes a pending review', async () => {
    vi.spyOn(prisma.review, 'findUnique').mockResolvedValue({ status: 'PENDING' } as any);
    const updateSpy = vi.spyOn(prisma.review, 'update').mockResolvedValue({ id: 'review-1', status: 'PUBLISHED' } as any);

    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { reviewId: '11111111-1111-4111-8111-111111111111', action: 'publish' },
    };
    const res = createMockRes();
    await reviewsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PUBLISHED' } }),
    );
  });

  it('rejects a pending review', async () => {
    vi.spyOn(prisma.review, 'findUnique').mockResolvedValue({ status: 'PENDING' } as any);
    const updateSpy = vi.spyOn(prisma.review, 'update').mockResolvedValue({ id: 'review-1', status: 'REJECTED' } as any);

    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { reviewId: '11111111-1111-4111-8111-111111111111', action: 'reject' },
    };
    const res = createMockRes();
    await reviewsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REJECTED' } }),
    );
  });

  it('refuses to moderate a review that already left PENDING', async () => {
    vi.spyOn(prisma.review, 'findUnique').mockResolvedValue({ status: 'PUBLISHED' } as any);

    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { reviewId: '11111111-1111-4111-8111-111111111111', action: 'reject' },
    };
    const res = createMockRes();
    await reviewsHandler(req, res);

    expect(res.statusCode).toBe(409);
  });

  it('returns 404 for an unknown reviewId', async () => {
    vi.spyOn(prisma.review, 'findUnique').mockResolvedValue(null);

    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { reviewId: '11111111-1111-4111-8111-111111111111', action: 'publish' },
    };
    const res = createMockRes();
    await reviewsHandler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a malformed body', async () => {
    const req: any = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { reviewId: 'not-a-uuid', action: 'publish' },
    };
    const res = createMockRes();
    await reviewsHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects DELETE with 405', async () => {
    const req: any = { method: 'DELETE', headers: { cookie: adminCookieHeader() } };
    const res = createMockRes();
    await reviewsHandler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
