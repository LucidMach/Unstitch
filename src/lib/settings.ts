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
  // Broadcast composer drafts (src/server/admin/broadcast.js) -- one saved
  // draft for the general newsletter card, and a single row holding a
  // { [productId]: draft } map for every per-product waitlist card, rather
  // than one Setting row per product (keeps this a fixed two keys
  // regardless of how many products/drops ever exist).
  BROADCAST_DRAFT_GENERAL: 'broadcast_draft_general',
  BROADCAST_DRAFT_WAITLIST: 'broadcast_draft_waitlist',
};

const STANDARD_TEMPLATE_ID = 'standard';

export interface EmailTemplateItem {
  id: string;
  name: string;
  message: string;
}

export interface EmailTemplatesConfig {
  templates: EmailTemplateItem[];
  defaultId: string;
}

export interface InputEmailTemplateItem {
  id?: string;
  name: string;
  message: string;
}

export async function getSetting(key: string, fallback: string): Promise<string> {
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
 * @param key
 * @param value - empty/whitespace-only resets to the fallback by
 *   deleting the row, rather than saving an empty override.
 */
export async function setSetting(key: string, value: string): Promise<any> {
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

function makeTemplateId(): string {
  return `tpl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** One template with the hardcoded copy as its message — the only template that exists until an admin saves something different. */
function fallbackLibrary(): EmailTemplatesConfig {
  return { templates: [{ id: STANDARD_TEMPLATE_ID, name: 'Standard', message: DEFAULT_ORDER_MESSAGE }], defaultId: STANDARD_TEMPLATE_ID };
}

/**
 * Reads the order-confirmation template library (added so admins can keep
 * more than one named message — e.g. "Standard", "Workshop pickup",
 * "Delayed restock" — and choose which one is used automatically for new
 * confirmations). On first read after upgrading from the single-message
 * version, migrates that old value in as the "Standard" template's
 * message rather than discarding an admin's existing customization.
 */
export async function getEmailTemplates(): Promise<EmailTemplatesConfig> {
  if (!prisma) return fallbackLibrary();
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEYS.EMAIL_TEMPLATES } });
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed?.templates) && parsed.templates.length) {
        const defaultId = parsed.templates.some((t: any) => t.id === parsed.defaultId)
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
 */
export async function setEmailTemplates(templates: InputEmailTemplateItem[], defaultId: string): Promise<EmailTemplatesConfig> {
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
export async function getDefaultOrderMessage(): Promise<string> {
  try {
    const { templates, defaultId } = await getEmailTemplates();
    const match = templates.find((t) => t.id === defaultId) || templates[0];
    return match?.message || DEFAULT_ORDER_MESSAGE;
  } catch (err) {
    console.warn('[settings] Failed to resolve default order message, using fallback:', err);
    return DEFAULT_ORDER_MESSAGE;
  }
}

/**
 * Broadcast composer drafts (admin Broadcasts tab, src/server/admin/
 * broadcast.ts) -- lets an admin save an in-progress newsletter/waitlist
 * send and come back to it later, rather than losing it on a page reload
 * or a tab switch (the waitlist cards rebuild from scratch every time the
 * Broadcasts tab stats refresh). A draft is whatever was typed, saved
 * as-is -- no business validation here (an incomplete block, an empty
 * subject) since a draft is explicitly a work in progress, not a send.
 * `blocks` is left as `unknown[]` rather than the stricter BroadcastBlock
 * union (see emailTemplate.ts) precisely because a draft can be mid-edit
 * and incomplete -- broadcast.ts's DraftBlockSchema is the only thing
 * that bounds its shape.
 */
export interface BroadcastDraft {
  subject: string;
  blocks: unknown[];
  gifUrl?: string;
  signatureName?: string;
  signatureRole?: string;
  savedAt: string;
}

export async function getGeneralBroadcastDraft(): Promise<BroadcastDraft | null> {
  const raw = await getSetting(SETTING_KEYS.BROADCAST_DRAFT_GENERAL, '');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BroadcastDraft;
  } catch (err) {
    console.warn('[settings] Failed to parse broadcast_draft_general, ignoring:', err);
    return null;
  }
}

export async function setGeneralBroadcastDraft(draft: BroadcastDraft): Promise<void> {
  await setSetting(SETTING_KEYS.BROADCAST_DRAFT_GENERAL, JSON.stringify(draft));
}

export async function clearGeneralBroadcastDraft(): Promise<void> {
  await setSetting(SETTING_KEYS.BROADCAST_DRAFT_GENERAL, '');
}

async function getWaitlistBroadcastDraftMap(): Promise<Record<string, BroadcastDraft>> {
  const raw = await getSetting(SETTING_KEYS.BROADCAST_DRAFT_WAITLIST, '');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('[settings] Failed to parse broadcast_draft_waitlist, ignoring:', err);
    return {};
  }
}

/** The full productId -> draft map, for the Broadcasts tab's one GET to hand every waitlist card its draft in one request. */
export async function getAllWaitlistBroadcastDrafts(): Promise<Record<string, BroadcastDraft>> {
  return getWaitlistBroadcastDraftMap();
}

export async function setWaitlistBroadcastDraft(productId: string, draft: BroadcastDraft): Promise<void> {
  const map = await getWaitlistBroadcastDraftMap();
  map[productId] = draft;
  await setSetting(SETTING_KEYS.BROADCAST_DRAFT_WAITLIST, JSON.stringify(map));
}

export async function clearWaitlistBroadcastDraft(productId: string): Promise<void> {
  const map = await getWaitlistBroadcastDraftMap();
  delete map[productId];
  const remaining = Object.keys(map).length;
  await setSetting(SETTING_KEYS.BROADCAST_DRAFT_WAITLIST, remaining ? JSON.stringify(map) : '');
}
