// src/lib/schemas/subscribe.js
import { z } from 'zod';

/**
 * Zod schema for newsletter subscription requests
 */
export const SubscribeSchema = z.object({
  email: z
    .string({ required_error: 'Please enter your email address' })
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

  // Optional -- when a "notify me" form is for a specific upcoming drop
  // rather than the general list, it passes that product's slug (not its
  // id, since slugs are what's readable/hardcodable in page markup --
  // see src/pages/shop-countdown.astro). Resolved to a real productId
  // server-side in api/subscribe.js; an unrecognized slug is ignored
  // rather than failing the whole signup.
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
