import { describe, it, expect, vi } from 'vitest';
import {
  isVictorianPostcode,
  resolveZoneKeyForPostcode,
  resolveDeliveryZone,
  OutOfDeliveryAreaError,
} from '../../src/lib/deliveryZones.js';

describe('isVictorianPostcode', () => {
  it('accepts postcodes in the 3000-3999 VIC range', () => {
    expect(isVictorianPostcode('3000')).toBe(true);
    expect(isVictorianPostcode('3999')).toBe(true);
    expect(isVictorianPostcode('3456')).toBe(true);
  });

  it('accepts postcodes in the 8000-8999 VIC PO box range', () => {
    expect(isVictorianPostcode('8000')).toBe(true);
    expect(isVictorianPostcode('8999')).toBe(true);
  });

  it('rejects postcodes outside Victoria', () => {
    expect(isVictorianPostcode('2000')).toBe(false); // NSW
    expect(isVictorianPostcode('4000')).toBe(false); // QLD
    expect(isVictorianPostcode('7000')).toBe(false); // TAS
  });

  it('rejects non-numeric or empty input without throwing', () => {
    expect(isVictorianPostcode('abcd')).toBe(false);
    expect(isVictorianPostcode('')).toBe(false);
    expect(isVictorianPostcode(undefined as any)).toBe(false);
    expect(isVictorianPostcode(null as any)).toBe(false);
  });

  it('handles boundary values just outside the ranges', () => {
    expect(isVictorianPostcode('2999')).toBe(false);
    expect(isVictorianPostcode('4000')).toBe(false);
    expect(isVictorianPostcode('7999')).toBe(false);
    expect(isVictorianPostcode('9000')).toBe(false);
  });
});

describe('resolveZoneKeyForPostcode', () => {
  it('resolves a known 0-5km postcode to LOCAL_0_5', () => {
    expect(resolveZoneKeyForPostcode('3000')).toBe('LOCAL_0_5');
    expect(resolveZoneKeyForPostcode('3121')).toBe('LOCAL_0_5');
  });

  it('resolves a known 5-10km postcode to LOCAL_5_10', () => {
    expect(resolveZoneKeyForPostcode('3011')).toBe('LOCAL_5_10');
    expect(resolveZoneKeyForPostcode('3101')).toBe('LOCAL_5_10');
  });

  it('falls back to AUSPOST for anything not in either list', () => {
    expect(resolveZoneKeyForPostcode('3300')).toBe('AUSPOST');
    expect(resolveZoneKeyForPostcode('3999')).toBe('AUSPOST');
  });

  it('trims whitespace before matching', () => {
    expect(resolveZoneKeyForPostcode('  3000  ')).toBe('LOCAL_0_5');
  });
});

describe('resolveDeliveryZone', () => {
  function fakePrisma(zone: any) {
    return { deliveryZone: { findFirst: vi.fn().mockResolvedValue(zone) } };
  }

  it('throws OutOfDeliveryAreaError for a non-Victorian postcode', async () => {
    const prisma = fakePrisma(null);
    await expect(resolveDeliveryZone(prisma as any, '2000')).rejects.toBeInstanceOf(OutOfDeliveryAreaError);
    expect(prisma.deliveryZone.findFirst).not.toHaveBeenCalled();
  });

  it('queries for a SELF_DELIVERY zone with maxDistanceKm 5 for a 0-5km postcode', async () => {
    const zoneRow = { id: 'zone-1', name: 'Local (0-5km)', feeCents: 500 };
    const prisma = fakePrisma(zoneRow);

    const result = await resolveDeliveryZone(prisma as any, '3000');

    expect(prisma.deliveryZone.findFirst).toHaveBeenCalledWith({
      where: { method: 'SELF_DELIVERY', maxDistanceKm: 5, active: true },
    });
    expect(result).toEqual({ ...zoneRow, zoneKey: 'LOCAL_0_5' });
  });

  it('queries for a SELF_DELIVERY zone with maxDistanceKm 10 for a 5-10km postcode', async () => {
    const zoneRow = { id: 'zone-2', name: 'Local (5-10km)', feeCents: 900 };
    const prisma = fakePrisma(zoneRow);

    const result = await resolveDeliveryZone(prisma as any, '3011');

    expect(prisma.deliveryZone.findFirst).toHaveBeenCalledWith({
      where: { method: 'SELF_DELIVERY', maxDistanceKm: 10, active: true },
    });
    expect(result?.zoneKey).toBe('LOCAL_5_10');
  });

  it('queries for an AUSPOST zone for a postcode outside the local lists', async () => {
    const zoneRow = { id: 'zone-3', name: 'Australia Post', feeCents: 1500 };
    const prisma = fakePrisma(zoneRow);

    const result = await resolveDeliveryZone(prisma as any, '3300');

    expect(prisma.deliveryZone.findFirst).toHaveBeenCalledWith({
      where: { method: 'AUSPOST', active: true },
    });
    expect(result?.zoneKey).toBe('AUSPOST');
  });

  it('returns null when no matching active zone row exists', async () => {
    const prisma = fakePrisma(null);
    const result = await resolveDeliveryZone(prisma as any, '3000');
    expect(result).toBeNull();
  });
});
