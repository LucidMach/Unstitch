// api/admin/logout.js
import { sendJson } from '../../src/lib/apiHelper.js';
import { buildAdminLogoutCookie } from '../../src/lib/adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }
  res.setHeader('Set-Cookie', buildAdminLogoutCookie());
  return sendJson(res, 200, { ok: true });
}
