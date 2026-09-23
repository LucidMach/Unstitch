import { describe, it, expect } from 'vitest';
import {
  addBusinessDays,
  computeExpectedShipDate,
  deliveryMethodLabel,
  PRODUCTION_DAYS,
} from '../../src/lib/shipping.js';

describe('addBusinessDays', () => {
  it('skips weekends when adding business days', () => {
    // Monday 2026-01-05 + 5 business days -> Monday 2026-01-12
    const monday = new Date('2026-01-05T00:00:00Z');
    const result = addBusinessDays(monday, 5);
    expect(result.getUTCDay()).toBe(1); // Monday
    expect(result.toISOString().slice(0, 10)).toBe('2026-01-12');
  });

  it('adding 1 business day from a Friday lands on Monday', () => {
    const friday = new Date('2026-01-09T00:00:00Z'); // Friday
    const result = addBusinessDays(friday, 1);
    expect(result.getUTCDay()).toBe(1); // Monday
    expect(result.toISOString().slice(0, 10)).toBe('2026-01-12');
  });

  it('adding 0 days returns the same date unchanged', () => {
    const date = new Date('2026-01-05T00:00:00Z');
    const result = addBusinessDays(date, 0);
    expect(result.getTime()).toBe(date.getTime());
  });

  it('does not mutate the input date', () => {
    const date = new Date('2026-01-05T00:00:00Z');
    const original = date.getTime();
    addBusinessDays(date, 3);
    expect(date.getTime()).toBe(original);
  });
});

describe('computeExpectedShipDate', () => {
  it('adds PRODUCTION_DAYS business days regardless of method', () => {
    const monday = new Date('2026-01-05T00:00:00Z');
    const withMethod = computeExpectedShipDate(monday, 'AUSPOST');
    const withoutMethod = computeExpectedShipDate(monday, undefined);
    const expected = addBusinessDays(monday, PRODUCTION_DAYS);

    expect(withMethod.getTime()).toBe(expected.getTime());
    expect(withoutMethod.getTime()).toBe(expected.getTime());
  });
});

describe('deliveryMethodLabel', () => {
  it('maps known methods to their customer-facing labels', () => {
    expect(deliveryMethodLabel('SELF_DELIVERY')).toBe('Self-delivery');
    expect(deliveryMethodLabel('AUSPOST')).toBe('Australia Post');
    expect(deliveryMethodLabel('PICKUP')).toBe('Pickup');
  });

  it('returns null for an unknown or missing method', () => {
    expect(deliveryMethodLabel('CARRIER_PIGEON')).toBeNull();
    expect(deliveryMethodLabel(undefined)).toBeNull();
    expect(deliveryMethodLabel(null)).toBeNull();
    expect(deliveryMethodLabel('')).toBeNull();
  });
});
