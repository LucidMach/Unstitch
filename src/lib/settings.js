// src/lib/settings.js
//
// Tiny key/value settings store backed by the `Setting` model (one row per
// key — see prisma/schema.prisma's "Admin-editable key/value settings"
// section). Deliberately generic rather than one column per setting, so a
// future setting doesn't need its own schema migration.
//
// Two keys are used:
//  - `email_templates` — a JSON-encoded library of named order-confirmation
//    templates (see getEmailTemplates/setEmailTemplates below), editable
//    from the admin "Send Email" tab (src/server/admin/settings.js is the
//    GET/POST endpoint behind that UI).
//  - `default_order_message` — legacy single-message override, from
//    before the template library existed. Only ever read once, to migrate
//    its value into the library the first time getEmailTemplates() runs
//    after an upgrade; never written again.
//
// Every read here degrades gracefully to a hardcoded fallback — a missing
// Setting row, a `prisma` that's null (DB not configured), or a lookup
// error all fall back rather than breaking the email send that's waiting
// on this.

import prisma from './prisma.js';
import { DEFAULT_ORDER_MESSAGE } from './emailTemplate.js';

export const SETTING_KEYS = {
  DEFAULT_ORDER_MESSAGE: 'default_order_message',
  EMAIL_TEMPLATES: 'email_templates',
};

const STANDARD_TEMPLATE_ID = 'standard';

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

function makeTemplateId() {
  return `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** One template with the hardcoded copy as its message — the only template that exists until an admin saves something different. */
function fallbackLibrary() {
  return { templates: [{ id: STANDARD_TEMPLATE_ID, name: 'Standard', message: DEFAULT_ORDER_MESSAGE }], defaultId: STANDARD_TEMPLATE_ID };
}

/**
 * Reads the order-confirmation template library (added so admins can keep
 * more than one named message — e.g. "Standard", "Workshop pickup",
 * "Delayed restock" — and choose which one is used automatically for new
 * confirmations). On first read after upgrading from the single-message
 * version, migrates that old value in as the "Standard" template's
 * message rather than discarding an admin's existing customization.
 * @returns {Promise<{templates: {id: string, name: string, message: string}[], defaultId: string}>}
 */
export async function getEmailTemplates() {
  if (!prisma) return fallbackLibrary();
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEYS.EMAIL_TEMPLATES } });
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed?.templates) && parsed.templates.length) {
        const defaultId = parsed.templates.some((t) => t.id === parsed.defaultId)
          ? parsed.defaultId
          : parsed.templates[0].id;
        return { templates: parsed.templates, defaultId };
      }
    }
  } catch (err) {
    console.warn('[settings] Failed to read email_templates, using fallback:', err);
    return fallbackLibrary();
  }

  // No library saved yet — migrate the legacy single-message setting in,
  // if there is one, so upgrading doesn't silently drop an admin's
  // existing override back to the hardcoded default.
  try {
    const legacyRow = await prisma.setting.findUnique({ where: { key: SETTING_KEYS.DEFAULT_ORDER_MESSAGE } });
    const legacyMessage = legacyRow?.value?.trim();
    if (legacyMessage) {
      return { templates: [{ id: STANDARD_TEMPLATE_ID, name: 'Standard', message: legacyMessage }], defaultId: STANDARD_TEMPLATE_ID };
    }
  } catch (err) {
    console.warn('[settings] Failed to read legacy default_order_message during migration:', err);
  }
  return fallbackLibrary();
}

/**
 * Replaces the whole template library in one write (the admin UI holds
 * the full list client-side and saves it back wholesale, rather than
 * separate add/edit/delete endpoints).
 * @param {{id?: string, name: string, message: string}[]} templates - at least one; any missing `id` gets one generated
 * @param {string} defaultId - must match one of the (possibly newly-generated) template ids
 * @returns {Promise<{templates: {id: string, name: string, message: string}[], defaultId: string}>}
 */
export async function setEmailTemplates(templates, defaultId) {
  if (!prisma) throw new Error('Not configured');
  if (!Array.isArray(templates) || !templates.length) {
    throw new Error('At least one template is required.');
  }
  const normalized = templates.map((t) => ({
    id: t.id && typeof t.id === 'string' ? t.id : makeTemplateId(),
    name: (t.name || '').trim() || 'Untitled',
    message: (t.message || '').trim() || DEFAULT_ORDER_MESSAGE,
  }));
  const resolvedDefaultId = normalized.some((t) => t.id === defaultId) ? defaultId : normalized[0].id;
  const value = JSON.stringify({ templates: normalized, defaultId: resolvedDefaultId });
  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.EMAIL_TEMPLATES },
    update: { value },
    create: { key: SETTING_KEYS.EMAIL_TEMPLATES, value },
  });
  return { templates: normalized, defaultId: resolvedDefaultId };
}

/** Convenience wrapper for the one setting every order-confirmation send needs: the message of whichever template is marked default. */
export async function getDefaultOrderMessage() {
  try {
    const { templates, defaultId } = await getEmailTemplates();
    const match = templates.find((t) => t.id === defaultId) || templates[0];
    return match?.message || DEFAULT_ORDER_MESSAGE;
  } catch (err) {
    console.warn('[settings] Failed to resolve default order message, using fallback:', err);
    return DEFAULT_ORDER_MESSAGE;
  }
}
