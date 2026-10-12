import { describe, expect, it } from 'vitest';

import type { PropertyListItem } from '@/types/property';
import { badgeDe, lireEmplacements, placementDe } from '../lecture-recherche';

/**
 * TCK-633 lot F (ADR-0061 §7) — la lecture des champs neufs de la recherche : `sponsored` (racine),
 * `placement` (`organic` | `reserved` dans `data`) et `badge`. Une valeur inconnue ne s'affiche pas.
 */
const bien = (extra: Record<string, unknown>) => ({ id: 1, slug: 'a', ...extra }) as unknown as PropertyListItem;

describe('lecture-recherche (TCK-633 lot F)', () => {
  it('lit `sponsored` à la racine, et rien quand il manque ou n’est pas une liste', () => {
    expect(lireEmplacements({ data: [], sponsored: [bien({})] })).toHaveLength(1);
    expect(lireEmplacements({ data: [] })).toEqual([]);
    expect(lireEmplacements({ sponsored: 'x' })).toEqual([]);
    expect(lireEmplacements(undefined)).toEqual([]);
  });

  it('`placement` vaut `organic` par défaut, `reserved` seulement quand l’API le dit', () => {
    expect(placementDe(bien({ placement: 'reserved' }))).toBe('reserved');
    expect(placementDe(bien({ placement: 'organic' }))).toBe('organic');
    expect(placementDe(bien({}))).toBe('organic');
    expect(placementDe(bien({ placement: 'autre' }))).toBe('organic');
  });

  it('`badge` : deux valeurs connues, sinon rien', () => {
    expect(badgeDe(bien({ badge: 'urgent' }))).toBe('urgent');
    expect(badgeDe(bien({ badge: 'price_drop' }))).toBe('price_drop');
    expect(badgeDe(bien({ badge: 'autre' }))).toBeNull();
    expect(badgeDe(bien({}))).toBeNull();
  });
});
