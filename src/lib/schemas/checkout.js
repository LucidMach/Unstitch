// src/lib/schemas/checkout.js
import { z } from 'zod';

/**
 * Zod schema for create-checkout-session requests.
 *
 * The client only ever sends WHAT to buy and HOW MANY — never a price.
 * The server looks up the real Product/Drop by slug and prices from
 * `basePriceCents` in the database, so a tampered client request can change
 * the quantity at most, never the amount charged.
 */
export const CreateCheckoutSessionSchema = z.object({
  slug: z
    .string({ required_error: 'Missing product slug' })
    .trim()
    .min(1)
    .max(160)
    .default('slow-bloom'),

  quantity: z
    .number({ required_error: 'Missing quantity', invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(10, 'Quantity must be 10 or fewer per order'),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Please enter a valid email address' })
    .max(255)
    .optional()
    .nullable()
    .transform((val) => val || undefined),
});
