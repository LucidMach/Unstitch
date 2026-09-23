import { describe, it, expect } from 'vitest';
import { generateOrderNumber } from '../../src/lib/orderNumber.js';

describe('generateOrderNumber', () => {
  it('matches the UX-<year>-<6 digits> format', () => {
    const orderNumber = generateOrderNumber();
    expect(orderNumber).toMatch(/^UX-\d{4}-\d{6}$/);
  });

  it('embeds the current year', () => {
    const orderNumber = generateOrderNumber();
    const year = new Date().getFullYear();
    expect(orderNumber.startsWith(`UX-${year}-`)).toBe(true);
  });

  it('generates distinct values across many calls', () => {
    const numbers = new Set(Array.from({ length: 200 }, () => generateOrderNumber()));
    // Random 6-digit suffix over 200 samples should essentially never collide.
    expect(numbers.size).toBeGreaterThan(190);
  });
});
