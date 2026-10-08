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
    .string({ message: 'Missing product slug' })
    .trim()
    .min(1)
    .max(160)
    .default('slow-bloom'),

  quantity: z
    .number({ message: 'Quantity must be a number' })
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
    .string({ message: 'Postcode is required' })
    .trim()
    .regex(/^[0-9]{4}$/, 'Enter a valid 4-digit postcode'),

  // Optional gift note, collected in the bag drawer before redirecting to
  // Stripe. Order.giftWrap / Order.giftMessage already existed in the
  // schema (unused until now) — see api/create-checkout-session.js, which
  // carries these through as Stripe Checkout Session metadata, and
  // api/stripe-webhook.js, which writes them onto the Order it creates.
  giftWrap: z.boolean().optional().default(false),

  giftMessage: z
    .string()
    .trim()
    .max(500, 'Gift message must be 500 characters or fewer')
    .optional()
    .nullable()
    .transform((val) => (val ? val : undefined)),
});

export type CreateCheckoutSessionInput = z.infer<typeof CreateCheckoutSessionSchema>;

