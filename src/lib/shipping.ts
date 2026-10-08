/**
 * Ship-date estimation — turns "order placed at time T, going out via method
 * M" into an expected-ship-by date the admin panel can show, so "when will
 * this actually go out" doesn't require checking in on every order by hand.
 *
 * This is HANDLING time (build/pack + walk/drive it to the post box or load
 * the delivery run) — separate from DeliveryZone.etaDays, which is the
 * transit time *after* it ships. The two add up to the customer-facing
 * "delivery by" estimate; only handling time is modelled here because that's
 * the part the admin actually controls day-to-day.
 *
 * Every Slow Bloom kit is made to order — the whole build-and-dispatch
 * process (not just build) takes 5–7 business days end to end (confirmed by
 * the studio). PRODUCTION_DAYS is the ceiling of that range, used as the
 * default "ship by" estimate; MIN_PRODUCTION_DAYS is the floor, used to
 * validate any admin-entered override.
 *
 * Earlier versions of this file modelled dispatch as *extra* days stacked
 * on top of a separate 7-day production estimate, landing on 8–9 business
 * days total — outside the promised 5–7 day range. There's no evidence the
 * delivery method meaningfully changes the total turnaround (a couple of
 * days to walk something to the post box doesn't move the needle on a
 * multi-day build), so the estimate is now flat regardless of method:
 * PRODUCTION_DAYS covers the whole thing, full stop.
 *
 * Deliberately a plain code constant, not a DB-configurable setting — same
 * reasoning as src/lib/deliveryZones.js's postcode lists: a correction ships
 * with a normal git push, no separate admin UI needed for something that
 * changes rarely.
 */

export type HandlingMethod = 'SELF_DELIVERY' | 'AUSPOST' | 'PICKUP';

/** Business days from order to ship-out, start to finish — the ceiling of the studio's 5–7 day promise. */
export const PRODUCTION_DAYS = 7;

/**
 * The floor for any admin-entered ship-by date (manual order creation, or
 * editing an existing order's date) — the studio's own minimum, regardless
 * of delivery method. Below this the promise can't realistically be kept.
 */
export const MIN_PRODUCTION_DAYS = 5;

/** Customer-facing label for a handling method, e.g. for email/admin copy. */
const METHOD_LABELS: Record<string, string> = {
  SELF_DELIVERY: 'Self-delivery',
  AUSPOST: 'Australia Post',
  PICKUP: 'Pickup',
};

export function deliveryMethodLabel(method?: HandlingMethod | string | null): string | null {
  return (method && METHOD_LABELS[method]) || null;
}

/**
 * Adds `days` business days (Mon–Fri) to `date`, landing on a weekday.
 */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

/**
 * @param createdAt
 * @param _method - kept in the signature so call sites don't need to change, but no longer affects the estimate
 */
export function computeExpectedShipDate(createdAt: Date, _method?: HandlingMethod | string | null): Date {
  return addBusinessDays(createdAt, PRODUCTION_DAYS);
}

