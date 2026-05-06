import { describe, it, expect, beforeEach } from 'vitest';
import {
  COMPARE_MAX_IDS,
  COMPARE_STORAGE_KEY,
  COMPARE_TTL_MS,
  highlightDivergent,
  idsToCsv,
  parseIdsCsv,
  readCompare,
  writeCompare,
  clearCompare,
  type CompareRow,
} from '../compare';

describe('lib/compare — localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads empty state when storage is empty', () => {
    expect(readCompare().ids).toEqual([]);
  });

  it('persists ids on write and reads them back', () => {
    writeCompare([3, 1, 2]);
    expect(readCompare().ids).toEqual([3, 1, 2]);
  });

  it('caps the stored ids at COMPARE_MAX_IDS (4)', () => {
    writeCompare([1, 2, 3, 4, 5, 6]);
    const state = readCompare();
    expect(state.ids).toHaveLength(COMPARE_MAX_IDS);
    expect(state.ids).toEqual([1, 2, 3, 4]);
  });

  it('deduplicates ids on write', () => {
    writeCompare([1, 1, 2, 2, 3]);
    expect(readCompare().ids).toEqual([1, 2, 3]);
  });

  it('drops the stored state when older than TTL', () => {
    const now = Date.now();
    writeCompare([1, 2], now - COMPARE_TTL_MS - 1000);
    expect(readCompare(now).ids).toEqual([]);
  });

  it('keeps the stored state within TTL', () => {
    const now = Date.now();
    writeCompare([1, 2], now - 1000);
    expect(readCompare(now).ids).toEqual([1, 2]);
  });

  it('ignores malformed JSON gracefully', () => {
    localStorage.setItem(COMPARE_STORAGE_KEY, '{not-json');
    expect(readCompare().ids).toEqual([]);
  });

  it('clears the stored state', () => {
    writeCompare([1, 2]);
    clearCompare();
    expect(readCompare().ids).toEqual([]);
  });

  it('filters non-positive / non-finite ids on read', () => {
    localStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify({ ids: [1, 0, -2, Number.NaN, 'x', 3], updated_at: Date.now() }),
    );
    expect(readCompare().ids).toEqual([1, 3]);
  });
});

describe('lib/compare — URL helpers', () => {
  it('parses a comma-separated ids string', () => {
    expect(parseIdsCsv('1,2,3')).toEqual([1, 2, 3]);
  });

  it('parses a padded / messy string', () => {
    expect(parseIdsCsv(' 1 , 2, 3  ')).toEqual([1, 2, 3]);
  });

  it('strips duplicates and invalid entries', () => {
    expect(parseIdsCsv('1,2,2,foo,-4,0,3')).toEqual([1, 2, 3]);
  });

  it('caps at COMPARE_MAX_IDS', () => {
    expect(parseIdsCsv('1,2,3,4,5,6')).toEqual([1, 2, 3, 4]);
  });

  it('returns [] on null / empty', () => {
    expect(parseIdsCsv(null)).toEqual([]);
    expect(parseIdsCsv('')).toEqual([]);
  });

  it('roundtrips via idsToCsv', () => {
    expect(idsToCsv([1, 2, 3])).toBe('1,2,3');
    expect(parseIdsCsv(idsToCsv([1, 2, 3]))).toEqual([1, 2, 3]);
  });
});

describe('lib/compare — highlightDivergent', () => {
  function row<T>(id: string, values: readonly T[]): CompareRow<T> {
    return { id, values };
  }

  it('marks a row as non-divergent when all cells are equal', () => {
    const result = highlightDivergent([row('price', [100, 100, 100])]);
    expect(result[0].divergent).toBe(false);
  });

  it('marks a row as divergent when numeric cells differ', () => {
    const result = highlightDivergent([row('price', [100, 200, 100])]);
    expect(result[0].divergent).toBe(true);
  });

  it('treats empty / null / undefined as equivalent', () => {
    const result = highlightDivergent([row('quarter', [null, undefined, ''])]);
    expect(result[0].divergent).toBe(false);
  });

  it('is case-insensitive for strings', () => {
    const result = highlightDivergent([row('city', ['Dakar', 'dakar', 'DAKAR'])]);
    expect(result[0].divergent).toBe(false);
  });

  it('treats array cells as sets (order-insensitive)', () => {
    const result = highlightDivergent([
      row('amenities', [['wifi', 'parking'], ['parking', 'wifi']]),
    ]);
    expect(result[0].divergent).toBe(false);
  });

  it('flags array cells with different memberships', () => {
    const result = highlightDivergent([
      row('amenities', [['wifi'], ['wifi', 'parking']]),
    ]);
    expect(result[0].divergent).toBe(true);
  });

  it('flags a boolean row with both true and false', () => {
    const result = highlightDivergent([row('furnished', [true, false])]);
    expect(result[0].divergent).toBe(true);
  });

  it('returns non-divergent for rows with 0 or 1 cell', () => {
    const r = highlightDivergent([row('price', []), row('price', [42])]);
    expect(r[0].divergent).toBe(false);
    expect(r[1].divergent).toBe(false);
  });

  it('handles multiple rows independently', () => {
    const result = highlightDivergent<unknown>([
      row('price', [100, 100]),
      row('area', [50, 70]),
      row('city', ['Dakar', 'Dakar']),
    ]);
    expect(result.map((r) => r.divergent)).toEqual([false, true, false]);
  });
});
