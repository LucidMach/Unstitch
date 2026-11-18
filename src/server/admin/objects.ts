// src/server/admin/objects.ts -- authenticated CRUD for the catalogue objects
// added from Admin > Objects (wired in at /api/admin/objects via
// api/admin/[...action].ts).
//
// GET    /api/admin/objects            -> every object (no photo bytes), in display order
// GET    /api/admin/objects?image=<id> -> that object's photo bytes (for the edit preview)
// POST   /api/admin/objects            -> create (no id) or update (id). The photo is sent as a
//                                         data URL the admin page has already resized; omit it to
//                                         keep the current photo, or send removeImage: true.
// DELETE /api/admin/objects?id=<uuid>  -> permanently removes an object

import { z } from 'zod';
import { sendJson, parseRequestBody, formatZodError } from '../../lib/apiHelper.js';
import { requireAdmin } from '../../lib/adminAuth.js';
import prisma from '../../lib/prisma.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Links must start with http:// or https://')
  .optional()
  .nullable();

const ObjectSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only'),
  name: z.string().trim().min(1, 'Name is required').max(200),
  tagline: z.string().trim().min(1, 'Card tagline is required').max(200),
  summary: z.string().trim().min(1, 'Summary is required').max(1500),
  objectType: z.string().trim().min(1, 'Object type is required').max(120),
  tiles: z.coerce.number().int().min(1).max(9999).optional().nullable(),
  materials: z.array(z.string().trim().min(1).max(100)).max(12).default([]),
  buildTime: z.string().trim().max(80).optional().nullable(),
  credits: z
    .array(z.object({ name: z.string().trim().min(1).max(120), role: z.string().trim().max(80).optional().nullable(), url: optionalUrl }))
    .max(10)
    .default([]),
  imageAlt: z.string().trim().min(1, 'Describe the photo (alt text)').max(400),
  imageDataUrl: z.string().max(3_500_000).optional().nullable(),
  imageWidth: z.coerce.number().int().min(1).max(10000).optional().nullable(),
  imageHeight: z.coerce.number().int().min(1).max(10000).optional().nullable(),
  removeImage: z.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0),
  hidden: z.boolean().default(false),
});

const LIST_SELECT = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  summary: true,
  objectType: true,
  tiles: true,
  materials: true,
  buildTime: true,
  credits: true,
  imageAlt: true,
  imageMime: true,
  imageWidth: true,
  imageHeight: true,
  sortOrder: true,
  hidden: true,
  updatedAt: true,
} as const;

// The usual reason these calls fail right after this feature is added: the
// database table hasn't been created yet, or the Prisma client wasn't
// regenerated. Say so, instead of a generic error.
function setupHint(err: any): string | null {
  const msg = String(err?.message || '');
  if (err?.code === 'P2021' || err?.code === 'P2022' || /designObject|design_objects|does not exist/i.test(msg)) {
    return 'The catalogue table is not set up yet. Run "pnpm db:generate" then "pnpm db:push", and restart the dev server.';
  }
  return null;
}

export default async function handler(req: any, res: any): Promise<any> {
  if (!prisma) return sendJson(res, 503, { error: 'Not configured' });
  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST') {
    const parsed = ObjectSchema.safeParse(parseRequestBody(req));
    if (!parsed.success) {
      const formatted = formatZodError(parsed.error);
      return sendJson(res, 400, { error: formatted.message, fieldErrors: formatted.fieldErrors });
    }
    const { id, imageDataUrl, removeImage, imageWidth, imageHeight, ...fields } = parsed.data;

    let image: { data: Buffer; mime: string } | null = null;
    if (imageDataUrl) {
      const m = DATA_URL_RE.exec(imageDataUrl);
      if (!m) return sendJson(res, 400, { error: 'The photo must be a WebP, JPEG or PNG image.' });
      const data = Buffer.from(m[2], 'base64');
      if (data.length > MAX_IMAGE_BYTES) {
        return sendJson(res, 400, { error: 'That photo is too large. Try a smaller one.' });
      }
      image = { data, mime: m[1] };
    }

    try {
      const clash = await prisma.designObject.findUnique({ where: { slug: fields.slug }, select: { id: true } });
      if (clash && clash.id !== id) {
        return sendJson(res, 409, { error: `Another object already uses the slug "${fields.slug}".` });
      }

      const data: Record<string, unknown> = {
        ...fields,
        tiles: fields.tiles ?? null,
        buildTime: fields.buildTime || null,
        credits: fields.credits.map((c) => ({
          name: c.name,
          ...(c.role ? { role: c.role } : {}),
          ...(c.url ? { url: c.url } : {}),
        })),
      };
      if (image) {
        data.imageData = image.data;
        data.imageMime = image.mime;
        data.imageWidth = imageWidth ?? null;
        data.imageHeight = imageHeight ?? null;
      } else if (removeImage) {
        data.imageData = null;
        data.imageMime = null;
        data.imageWidth = null;
        data.imageHeight = null;
      }

      let object;
      if (id) {
        const existing = await prisma.designObject.findUnique({ where: { id }, select: { id: true } });
        if (!existing) return sendJson(res, 404, { error: 'Object not found.' });
        object = await prisma.designObject.update({ where: { id }, data, select: LIST_SELECT });
      } else {
        object = await prisma.designObject.create({ data: data as any, select: LIST_SELECT });
      }
      return sendJson(res, 200, { object });
    } catch (err) {
      console.error('[admin/objects] Save failed:', err);
      return sendJson(res, 500, { error: setupHint(err) || 'Failed to save the object.' });
    }
  }

  if (req.method === 'DELETE') {
    const { searchParams } = new URL(req.url, 'http://placeholder.local');
    const id = searchParams.get('id');
    if (!id) return sendJson(res, 400, { error: 'Missing id.' });
    try {
      const existing = await prisma.designObject.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return sendJson(res, 404, { error: 'Object not found.' });
      await prisma.designObject.delete({ where: { id } });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('[admin/objects] Delete failed:', err);
      return sendJson(res, 500, { error: 'Failed to delete the object.' });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const { searchParams } = new URL(req.url, 'http://placeholder.local');
  const imageId = searchParams.get('image');

  try {
    if (imageId) {
      const row = await prisma.designObject.findUnique({
        where: { id: imageId },
        select: { imageData: true, imageMime: true },
      });
      if (!row?.imageData || !row.imageMime) return sendJson(res, 404, { error: 'No photo.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', row.imageMime);
      res.setHeader('Cache-Control', 'private, no-store');
      res.end(Buffer.from(row.imageData));
      return res;
    }

    const objects = await prisma.designObject.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 500,
      select: LIST_SELECT,
    });
    return sendJson(res, 200, { objects });
  } catch (err) {
    console.error('[admin/objects] Lookup failed:', err);
    return sendJson(res, 500, { error: setupHint(err) || 'Unable to load objects.' });
  }
}
