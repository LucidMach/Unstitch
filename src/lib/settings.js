// src/lib/settings.js
//
// Tiny key/value settings store backed by the `Setting` model (one row per
// key — see prisma/schema.prisma's "Admin-editable key/value settings"
// section). Deliberately generic rather than one column per setting, so a
// future setting doesn't need its own schema migration.
//
// Currently just one key is used: the default order-confirmation message
// (see emailTemplate.js's DEFAULT_ORDER_MESSAGE), editable from the admin
// "Send Email" tab (src/server/admin/settings.js is the GET/POST endpoint
// behind that UI). Every read here falls back to the hardcoded constant —
// a missing Setting row, a `prisma` that's null (DB not configured), or a
// lookup error all degrade to "use the code default" rather than breaking
// the email send that's waiting on this.

import prisma from './prisma.js';
import { DEFAULT_ORDER_MESSAGE } from './emailTemplate.js';

export const SETTING_KEYS = {
  DEFAULT_ORDER_MESSAGE: 'default_order_message',
};

/**
 * @param {string} key
 * @param {string} fallback
 * @returns {Promise<string>}
 */
export async function getSetting(key, fallback) {
  if (!prisma) return fallback;
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    const value = row?.value?.trim();
    return value ? value : fallback;
  } catch (err) {
    console.warn(`[settings] Failed to read "${key}", using fallback:`, err);
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string} value - empty/whitespace-only resets to the fallback by
 *   deleting the row, rather than saving an empty override.
 */
export async function setSetting(key, value) {
  if (!prisma) throw new Error('Not configured');
  const trimmed = (value || '').trim();
  if (!trimmed) {
    await prisma.setting.deleteMany({ where: { key } });
    return null;
  }
  return prisma.setting.upsert({
    where: { key },
    update: { value: trimmed },
    create: { key, value: trimmed },
  });
}

/** Convenience wrapper for the one setting every order-confirmation send needs. */
export async function getDefaultOrderMessage() {
  return getSetting(SETTING_KEYS.DEFAULT_ORDER_MESSAGE, DEFAULT_ORDER_MESSAGE);
}
