import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_SECRET = process.env.SESSION_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

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

describe('adminAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_SECRET = 'test-secret-for-admin-auth-tests';
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = ORIGINAL_SECRET;
    }
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    }
  });

  describe('parseCookies', () => {
    it('returns an empty object when there is no cookie header', async () => {
      const { parseCookies } = await import('../../src/lib/adminAuth.js');
      expect(parseCookies({ headers: {} })).toEqual({});
      expect(parseCookies({ headers: undefined })).toEqual({});
    });

    it('parses a single cookie pair', async () => {
      const { parseCookies } = await import('../../src/lib/adminAuth.js');
      const result = parseCookies({ headers: { cookie: 'foo=bar' } });
      expect(result).toEqual({ foo: 'bar' });
    });

    it('parses multiple cookie pairs separated by "; "', async () => {
      const { parseCookies } = await import('../../src/lib/adminAuth.js');
      const result = parseCookies({ headers: { cookie: 'foo=bar; baz=qux' } });
      expect(result).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('skips malformed pairs with no "="', async () => {
      const { parseCookies } = await import('../../src/lib/adminAuth.js');
      const result = parseCookies({ headers: { cookie: 'foo=bar; malformed; baz=qux' } });
      expect(result).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('skips pairs with an empty key', async () => {
      const { parseCookies } = await import('../../src/lib/adminAuth.js');
      const result = parseCookies({ headers: { cookie: '=novalue; foo=bar' } });
      expect(result).toEqual({ foo: 'bar' });
    });

    it('URL-decodes cookie values', async () => {
      const { parseCookies } = await import('../../src/lib/adminAuth.js');
      const result = parseCookies({ headers: { cookie: 'name=hello%20world' } });
      expect(result).toEqual({ name: 'hello world' });
    });

    it('falls back to the raw value if URL-decoding fails', async () => {
      const { parseCookies } = await import('../../src/lib/adminAuth.js');
      const result = parseCookies({ headers: { cookie: 'name=%E0%A4%A' } });
      expect(result.name).toBe('%E0%A4%A');
    });
  });

  describe('isAdminAuthenticated', () => {
    it('returns false when there is no session cookie', async () => {
      const { isAdminAuthenticated } = await import('../../src/lib/adminAuth.js');
      expect(isAdminAuthenticated({ headers: {} })).toBe(false);
    });

    it('returns false for an invalid/tampered token', async () => {
      const { isAdminAuthenticated } = await import('../../src/lib/adminAuth.js');
      const req = { headers: { cookie: 'unstitch_admin_session=garbage.token' } };
      expect(isAdminAuthenticated(req)).toBe(false);
    });

    it('returns false for a validly signed token without role: admin', async () => {
      const { sign } = await import('../../src/lib/signedToken.js');
      const { isAdminAuthenticated } = await import('../../src/lib/adminAuth.js');
      const token = sign({ role: 'customer' }, 60);
      const req = { headers: { cookie: `unstitch_admin_session=${encodeURIComponent(token)}` } };
      expect(isAdminAuthenticated(req)).toBe(false);
    });

    it('returns true for a valid role: admin signed cookie', async () => {
      const { buildAdminSessionCookie, isAdminAuthenticated } = await import('../../src/lib/adminAuth.js');
      const setCookieHeader = buildAdminSessionCookie();
      const tokenPart = setCookieHeader.split(';')[0]; // "unstitch_admin_session=<encoded token>"
      const req = { headers: { cookie: tokenPart } };
      expect(isAdminAuthenticated(req)).toBe(true);
    });
  });

  describe('buildAdminSessionCookie / buildAdminLogoutCookie', () => {
    it('includes Secure only when NODE_ENV === production', async () => {
      process.env.NODE_ENV = 'development';
      const { buildAdminSessionCookie, buildAdminLogoutCookie } = await import('../../src/lib/adminAuth.js');
      expect(buildAdminSessionCookie()).not.toContain('Secure');
      expect(buildAdminLogoutCookie()).not.toContain('Secure');
    });

    it('includes Secure when NODE_ENV === production', async () => {
      process.env.NODE_ENV = 'production';
      const { buildAdminSessionCookie, buildAdminLogoutCookie } = await import('../../src/lib/adminAuth.js');
      expect(buildAdminSessionCookie()).toContain('Secure');
      expect(buildAdminLogoutCookie()).toContain('Secure');
    });

    it('session cookie carries HttpOnly, SameSite=Lax and an 8h Max-Age', async () => {
      process.env.NODE_ENV = 'development';
      const { buildAdminSessionCookie } = await import('../../src/lib/adminAuth.js');
      const cookie = buildAdminSessionCookie();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain(`Max-Age=${8 * 60 * 60}`);
    });

    it('logout cookie clears the value and sets Max-Age=0', async () => {
      const { buildAdminLogoutCookie } = await import('../../src/lib/adminAuth.js');
      const cookie = buildAdminLogoutCookie();
      expect(cookie).toContain('unstitch_admin_session=;');
      expect(cookie).toContain('Max-Age=0');
    });
  });

  describe('requireAdmin', () => {
    it('sends 401 and returns false when unauthenticated', async () => {
      const { requireAdmin } = await import('../../src/lib/adminAuth.js');
      const req = { headers: {} };
      const res = createMockRes();

      const result = requireAdmin(req, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Not authenticated' });
    });

    it('returns true and sends nothing when authenticated', async () => {
      const { buildAdminSessionCookie, requireAdmin } = await import('../../src/lib/adminAuth.js');
      const setCookieHeader = buildAdminSessionCookie();
      const tokenPart = setCookieHeader.split(';')[0];
      const req = { headers: { cookie: tokenPart } };
      const res = createMockRes();

      const result = requireAdmin(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200); // untouched
      expect(res.body).toBeNull();
    });
  });
});
