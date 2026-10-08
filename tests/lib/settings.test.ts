// src/lib/settings.js (the admin-editable email-template library backend,
// added in the pull this session reviewed) had zero test coverage --
// including its graceful-degradation behavior (missing row, DB error,
// legacy single-message migration), which is exactly the kind of logic
// that's easy to silently break since nothing exercises the fallback path
// in normal operation.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import { getSetting, setSetting, getEmailTemplates, setEmailTemplates, getDefaultOrderMessage, SETTING_KEYS } from '../../src/lib/settings.js';
import { DEFAULT_ORDER_MESSAGE } from '../../src/lib/emailTemplate.js';

describe('settings.js', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSetting / setSetting', () => {
    it('returns the fallback when no row exists', async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null);
      const value = await getSetting('some_key', 'fallback value');
      expect(value).toBe('fallback value');
    });

    it('returns the stored value when a row exists', async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({ key: 'some_key', value: 'stored value' } as any);
      const value = await getSetting('some_key', 'fallback value');
      expect(value).toBe('stored value');
    });

    it('falls back on a database error rather than throwing', async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockRejectedValue(new Error('Connection timeout'));
      const value = await getSetting('some_key', 'fallback value');
      expect(value).toBe('fallback value');
    });

    it('deletes the row (resetting to fallback) when set to an empty/whitespace value', async () => {
      const deleteSpy = vi.spyOn(prisma.setting, 'deleteMany').mockResolvedValue({} as any);
      const upsertSpy = vi.spyOn(prisma.setting, 'upsert');
      const result = await setSetting('some_key', '   ');
      expect(result).toBeNull();
      expect(deleteSpy).toHaveBeenCalledWith({ where: { key: 'some_key' } });
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('upserts a trimmed value', async () => {
      const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
      await setSetting('some_key', '  a value  ');
      expect(upsertSpy).toHaveBeenCalledWith({
        where: { key: 'some_key' },
        update: { value: 'a value' },
        create: { key: 'some_key', value: 'a value' },
      });
    });
  });

  describe('getEmailTemplates', () => {
    it('returns the saved library when one exists', async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
        value: JSON.stringify({ templates: [{ id: 'a', name: 'Standard', message: 'Hi' }], defaultId: 'a' }),
      } as any);
      const { templates, defaultId } = await getEmailTemplates();
      expect(templates).toEqual([{ id: 'a', name: 'Standard', message: 'Hi' }]);
      expect(defaultId).toBe('a');
    });

    it("falls back to the first template's id when defaultId no longer matches any saved template", async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
        value: JSON.stringify({ templates: [{ id: 'a', name: 'Standard', message: 'Hi' }], defaultId: 'deleted-id' }),
      } as any);
      const { defaultId } = await getEmailTemplates();
      expect(defaultId).toBe('a');
    });

    it('migrates the legacy single-message setting in as the "Standard" template on first read', async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockImplementation(async ({ where }: any) => {
        if (where.key === SETTING_KEYS.EMAIL_TEMPLATES) return null;
        if (where.key === SETTING_KEYS.DEFAULT_ORDER_MESSAGE) return { value: 'Legacy custom message' } as any;
        return null;
      });
      const { templates, defaultId } = await getEmailTemplates();
      expect(templates).toEqual([{ id: 'standard', name: 'Standard', message: 'Legacy custom message' }]);
      expect(defaultId).toBe('standard');
    });

    it('falls back to the hardcoded default when nothing is saved anywhere', async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null);
      const { templates, defaultId } = await getEmailTemplates();
      expect(templates).toEqual([{ id: 'standard', name: 'Standard', message: DEFAULT_ORDER_MESSAGE }]);
      expect(defaultId).toBe('standard');
    });

    it('falls back to the hardcoded default on a database error', async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockRejectedValue(new Error('Connection timeout'));
      const { templates, defaultId } = await getEmailTemplates();
      expect(defaultId).toBe('standard');
      expect(templates[0].message).toBe(DEFAULT_ORDER_MESSAGE);
    });
  });

  describe('setEmailTemplates', () => {
    it('generates an id for any template missing one, and normalizes blank names/messages', async () => {
      const upsertSpy = vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
      const { templates, defaultId } = await setEmailTemplates(
        [{ name: '', message: '' }, { id: 'kept', name: 'Workshop', message: 'See you there!' }],
        'kept',
      );

      expect(templates[0].id).toMatch(/^tpl_/);
      expect(templates[0].name).toBe('Untitled');
      expect(templates[0].message).toBe(DEFAULT_ORDER_MESSAGE);
      expect(templates[1]).toEqual({ id: 'kept', name: 'Workshop', message: 'See you there!' });
      expect(defaultId).toBe('kept');
      expect(upsertSpy).toHaveBeenCalledWith({
        where: { key: SETTING_KEYS.EMAIL_TEMPLATES },
        update: { value: JSON.stringify({ templates, defaultId }) },
        create: { key: SETTING_KEYS.EMAIL_TEMPLATES, value: JSON.stringify({ templates, defaultId }) },
      });
    });

    it('falls back to the first template when defaultId does not match any of them', async () => {
      vi.spyOn(prisma.setting, 'upsert').mockResolvedValue({} as any);
      const { defaultId } = await setEmailTemplates([{ id: 'a', name: 'A', message: 'x' }], 'not-a-real-id');
      expect(defaultId).toBe('a');
    });

    it('throws when given an empty template list', async () => {
      await expect(setEmailTemplates([], 'anything')).rejects.toThrow();
    });
  });

  describe('getDefaultOrderMessage', () => {
    it("resolves to the default template's message", async () => {
      vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({
        value: JSON.stringify({ templates: [{ id: 'a', name: 'Standard', message: 'Custom default copy' }], defaultId: 'a' }),
      } as any);
      const message = await getDefaultOrderMessage();
      expect(message).toBe('Custom default copy');
    });
  });
});
