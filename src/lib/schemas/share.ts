/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import { z } from 'zod';

export const ShareSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email cannot exceed 255 characters'),
  projectName: z
    .string()
    .trim()
    .max(100, 'Project name cannot exceed 100 characters')
    .optional()
    .default('Unstitch 3D Creation'),
  designData: z
    .record(z.string(), z.any())
    .refine((val) => val && typeof val === 'object' && Array.isArray(val.tiles), {
      message: 'Invalid design data: tiles array is required',
    }),
  previewImage: z
    .string()
    .max(4 * 1024 * 1024, 'Preview image exceeds maximum allowed size')
    .optional()
    .refine((val) => !val || val.startsWith('data:image/'), {
      message: 'Preview image must be a valid base64 image data URL',
    }),
  _gotcha: z.string().optional(),
});

export type ShareInput = z.infer<typeof ShareSchema>;


// "Send a copy to Unstitch": the Snap & Share pop-up sends the picture of a build to the studio inbox.
// Same endpoint as the email-to-yourself share (12-function cap); the body carries mode: 'studio'.
export const StudioShareSchema = z.object({
  mode: z.literal('studio'),
  projectName: z
    .string()
    .trim()
    .max(100, 'Project name cannot exceed 100 characters')
    .optional()
    .default('Unstitch 3D Creation'),
  // Optional name or Instagram handle so the team can say hi / credit the maker.
  from: z.string().trim().max(100, 'Name or handle cannot exceed 100 characters').optional().default(''),
  previewImage: z
    .string()
    .min(1, 'Image is required')
    .max(4 * 1024 * 1024, 'Image exceeds maximum allowed size')
    .regex(/^data:image\/(png|jpeg|webp);base64,/, 'Image must be a PNG, JPEG or WebP data URL'),
  _gotcha: z.string().optional(),
});

export type StudioShareInput = z.infer<typeof StudioShareSchema>;
