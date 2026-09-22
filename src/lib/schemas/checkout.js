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

  // Collected on our own site *before* redirecting to Stripe, so the
  // delivery fee can be resolved and added as a real line item up front —
  // see src/lib/deliveryZones.js. Stripe's own hosted page separately
  // collects a full shipping address afterwards; if a customer types a
  // different postcode there, the charged fee won't match their actual
  // zone (a known limitation — re-collecting/re-pricing after Stripe's own
  // address step would need a bigger checkout redesign).
  postcode: z
    .string({ required_error: 'Postcode is required' })
    .trim()
    .regex(/^[0-9]{4}$/, 'Enter a valid 4-digit postcode'),
});
