// src/lib/schemas/subscribe.ts
import { z } from 'zod';

/**
 * Zod schema for newsletter subscription requests
 */
export const SubscribeSchema = z.object({
  email: z
    .string({ message: 'Please enter your email address' })
    .trim()
    .toLowerCase()
    .email({ message: 'Please enter a valid email address' })
    .max(255, 'Email address is too long'),

  name: z
    .string()
    .trim()
    .max(100, 'Name must be under 100 characters')
    .optional()
    .nullable()
    .transform((val) => val || null),

  source: z
    .string()
    .trim()
    .max(60, 'Source must be under 60 characters')
    .optional()
    .nullable()
    .transform((val) => val || 'newsletter'),

  productSlug: z
    .string()
    .trim()
    .max(160, 'Product reference is too long')
    .optional()
    .nullable()
    .transform((val) => val || undefined),

  // Honeypot spam trap
  _gotcha: z
    .string()
    .max(0, 'Spam detected')
    .optional()
    .nullable()
    .transform((val) => val || ''),
});

export type SubscribeInput = z.infer<typeof SubscribeSchema>;

