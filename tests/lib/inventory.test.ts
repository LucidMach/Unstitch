import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import {
  reserveUnitsForDrop,
  markUnitsSold,
  releaseUnits,
  revertUnitsToStock,
  InsufficientStockError,
} from '../../src/lib/inventory.js';

describe('InsufficientStockError', () => {
  it('carries dropId/requested/available and a descriptive message', () => {
    const err = new InsufficientStockError('drop-1', 5, 2);
    expect(err.name).toBe('InsufficientStockError');
    expect(err.dropId).toBe('drop-1');
    expect(err.requested).toBe(5);
    expect(err.available).toBe(2);
    expect(err.message).toContain('drop-1');
    expect(err.message).toContain('5');
    expect(err.message).toContain('2');
  });
});

describe('reserveUnitsForDrop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('locks and reserves exactly `quantity` units, oldest edition first', async () => {
    const lockedRows = [
      { id: 'unit-1', serial: 'SN0001' },
      { id: 'unit-2', serial: 'SN0002' },
    ];
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue(lockedRows),
      $executeRaw: vi.fn().mockResolvedValue(2),
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(mockTx));

    const result = await reserveUnitsForDrop('drop-1', 2);

    expect(result).toEqual(lockedRows);
    expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('throws InsufficientStockError (without reserving anything) when fewer units are locked than requested', async () => {
    const lockedRows = [{ id: 'unit-1', serial: 'SN0001' }]; // only 1, quantity requested is 3
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue(lockedRows),
      $executeRaw: vi.fn().mockResolvedValue(0),
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(mockTx));

    await expect(reserveUnitsForDrop('drop-1', 3)).rejects.toMatchObject({
      name: 'InsufficientStockError',
      dropId: 'drop-1',
      requested: 3,
      available: 1,
    });
    // No UPDATE should run when the stock check fails.
    expect(mockTx.$executeRaw).not.toHaveBeenCalled();
  });

  it('reserving zero available units throws with available: 0', async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn(),
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => fn(mockTx));

    await expect(reserveUnitsForDrop('drop-1', 1)).rejects.toMatchObject({ available: 0 });
  });
});

describe('markUnitsSold', () => {
  it('runs a raw UPDATE on the passed tx client for the given unit ids/customer', async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(2) };
    await markUnitsSold(tx as any, ['unit-1', 'unit-2'], 'cust-1');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('is a no-op (no query) for an empty unitIds array', async () => {
    const tx = { $executeRaw: vi.fn() };
    await markUnitsSold(tx as any, [], 'cust-1');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('releaseUnits', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a raw UPDATE against the top-level prisma client', async () => {
    const spy = vi.spyOn(prisma, '$executeRaw').mockResolvedValue(2 as any);
    await releaseUnits(['unit-1', 'unit-2']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for an empty unitIds array', async () => {
    const spy = vi.spyOn(prisma, '$executeRaw').mockResolvedValue(0 as any);
    await releaseUnits([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('revertUnitsToStock', () => {
  it('runs a raw UPDATE on the passed tx client clearing ownership', async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1) };
    await revertUnitsToStock(tx as any, ['unit-1']);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for an empty unitIds array', async () => {
    const tx = { $executeRaw: vi.fn() };
    await revertUnitsToStock(tx as any, []);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
