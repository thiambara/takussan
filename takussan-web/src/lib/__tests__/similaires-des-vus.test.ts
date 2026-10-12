import { describe, expect, it } from 'vitest';

import { fusionnerSimilaires } from '../similaires-des-vus';
import type { PropertyListItem } from '@/types/property';

const bien = (id: number) => ({ id, slug: `bien-${id}` }) as PropertyListItem;
const ids = (biens: readonly PropertyListItem[]) => biens.map((b) => b.id);

describe('fusionnerSimilaires', () => {
  it('prend les similaires à tour de rôle, source après source', () => {
    const r = fusionnerSimilaires([bien(1), bien(2)], [[bien(10), bien(11)], [bien(20), bien(21)]], 10);
    expect(ids(r)).toEqual([10, 20, 11, 21]);
  });

  it('écarte un bien déjà consulté, et un doublon entre deux sources', () => {
    const r = fusionnerSimilaires([bien(1), bien(2)], [[bien(2), bien(10)], [bien(10), bien(20)]], 10);
    expect(ids(r)).toEqual([10, 20]);
  });

  it('s’arrête au nombre qui manque', () => {
    const r = fusionnerSimilaires([bien(1)], [[bien(10), bien(11), bien(12)], [bien(20)]], 3);
    expect(ids(r)).toEqual([10, 20, 11]);
  });

  it('sans source, rien', () => {
    expect(fusionnerSimilaires([bien(1)], [], 5)).toEqual([]);
  });
});
