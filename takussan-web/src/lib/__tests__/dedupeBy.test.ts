import { describe, it, expect } from 'vitest';
import { dedupeAcross, excludeSeen } from '../dedupeBy';

describe('dedupeAcross (TCK-164)', () => {
  it('keeps each id only in its first appearing row', () => {
    const result = dedupeAcross(
      [
        [{ id: 1 }, { id: 2 }],
        [{ id: 2 }, { id: 3 }],
        [{ id: 1 }, { id: 4 }],
      ],
      (item) => item.id,
    );
    expect(result).toEqual([
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }],
      [{ id: 4 }],
    ]);
  });

  it('returns empty arrays untouched', () => {
    expect(dedupeAcross([[], []], (i: { id: number }) => i.id)).toEqual([[], []]);
  });
});

describe('excludeSeen', () => {
  it('drops items whose id is already in the seen set', () => {
    const seen = new Set([2, 4]);
    const result = excludeSeen(
      [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      seen,
      (i) => i.id,
    );
    expect(result).toEqual([{ id: 1 }, { id: 3 }]);
  });
});
