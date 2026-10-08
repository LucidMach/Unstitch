// src/server/admin/settings.js (the admin "Email templates" endpoint) had
// zero test coverage before this file.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import settingsHandler from '../../src/server/admin/settings.js';
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

describe('admin/settings API handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = 'test-secret-for-admin-settings';
  });

  it('returns 401 without a valid admin session', async () => {
    const req = { method: 'GET', headers: {} };
    const res = createMockRes();
    await settingsHandler(req as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('GET returns the saved template library', async () => {
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
      value: JSON.stringify({ templates: [{ id: 'a', name: 'Standard', message: 'Hi' }], defaultId: 'a' }),
    } as any);
    const req = { method: 'GET', headers: { cookie: adminCookieHeader() } };
    const res = createMockRes();
    await settingsHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.templates).toEqual([{ id: 'a', name: 'Standard', message: 'Hi' }]);
    expect(res.body.defaultId).toBe('a');
  });

  it('POST saves the whole template library', async () => {
    const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { templates: [{ id: 'a', name: 'Standard', message: 'Thanks for your order!' }], defaultId: 'a' },
    };
    const res = createMockRes();
    await settingsHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.defaultId).toBe('a');
    expect(upsertSpy).toHaveBeenCalled();
  });

  it('rejects saving an empty template list', async () => {
    const upsertSpy = vi.spyOn(prisma.setting, 'upsert');
    const req = { method: 'POST', headers: { cookie: adminCookieHeader() }, body: { templates: [], defaultId: '' } };
    const res = createMockRes();
    await settingsHandler(req as any, res);

    expect(res.statusCode).toBe(400);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('POST with previewMessage renders a sample confirmation email without saving anything', async () => {
    const upsertSpy = vi.spyOn(prisma.setting, 'upsert');
    const req = {
      method: 'POST',
      headers: { cookie: adminCookieHeader() },
      body: { previewMessage: 'Thanks so much for your order!' },
    };
    const res = createMockRes();
    await settingsHandler(req as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.html).toContain('Thanks so much for your order!');
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('returns 405 for an unsupported method', async () => {
    const req = { method: 'DELETE', headers: { cookie: adminCookieHeader() } };
    const res = createMockRes();
    await settingsHandler(req as any, res);
    expect(res.statusCode).toBe(405);
  });
});
