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
