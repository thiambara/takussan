import { describe, expect, it } from 'vitest';
import { propertyTypeValues } from '@/lib/schemas/property';
import {
  areaLabelKey,
  isFieldRelevant,
  sanitizeByType,
  type ConditionalFieldKey,
} from '../field-matrix';

const vente = { contract: 'sale' } as const;
const location = { contract: 'rent' } as const;

describe('isFieldRelevant', () => {
  it('un terrain ne demande ni chambres, ni meublé, ni année de construction', () => {
    const ctx = { type: 'land', ...vente } as const;
    for (const cle of ['bedrooms', 'bathrooms', 'furnished', 'year_built', 'parking_spaces'] as const) {
      expect(isFieldRelevant(cle, ctx), `${cle} ne concerne pas un terrain`).toBe(false);
    }
  });

  it('un terrain demande sa surface et son statut foncier', () => {
    const ctx = { type: 'land', ...vente } as const;
    expect(isFieldRelevant('area', ctx)).toBe(true);
    expect(isFieldRelevant('title_type', ctx)).toBe(true);
  });

  it('un appartement demande son ÉTAGE, pas son nombre de niveaux', () => {
    const ctx = { type: 'apartment', ...location } as const;
    expect(isFieldRelevant('floor_number', ctx)).toBe(true);
    expect(isFieldRelevant('total_floors', ctx)).toBe(false);
  });

  it('une villa demande son nombre de NIVEAUX, pas son étage', () => {
    const ctx = { type: 'villa', ...vente } as const;
    expect(isFieldRelevant('total_floors', ctx)).toBe(true);
    expect(isFieldRelevant('floor_number', ctx)).toBe(false);
  });

  it('un studio et une chambre n’ont pas de compte de chambres à demander', () => {
    expect(isFieldRelevant('bedrooms', { type: 'studio', ...location })).toBe(false);
    expect(isFieldRelevant('bedrooms', { type: 'room', ...location })).toBe(false);
    expect(isFieldRelevant('bathrooms', { type: 'studio', ...location })).toBe(true);
  });

  it('un parking ne demande pas combien il a de places de parking', () => {
    expect(isFieldRelevant('parking_spaces', { type: 'parking', ...vente })).toBe(false);
    expect(isFieldRelevant('parking_spaces', { type: 'garage', ...vente })).toBe(false);
    expect(isFieldRelevant('parking_spaces', { type: 'villa', ...vente })).toBe(true);
  });

  it('la fréquence et la disponibilité ne concernent QUE la location', () => {
    for (const cle of ['rent_period', 'available_from'] as const) {
      expect(isFieldRelevant(cle, { type: 'villa', ...location })).toBe(true);
      expect(isFieldRelevant(cle, { type: 'villa', ...vente })).toBe(false);
    }
  });

  it('les équipements domestiques ne concernent pas un terrain, un garage ni un parking', () => {
    for (const type of ['land', 'garage', 'parking'] as const) {
      expect(isFieldRelevant('tag_ids', { type, ...vente })).toBe(false);
    }
    expect(isFieldRelevant('tag_ids', { type: 'apartment', ...location })).toBe(true);
  });

  // ── Les deux invariants qui rendent la table sûre plutôt que seulement juste ──

  it('INVARIANT — aucun type ne demande à la fois son étage ET son nombre de niveaux', () => {
    for (const type of propertyTypeValues) {
      const ctx = { type, ...vente } as const;
      expect(
        isFieldRelevant('floor_number', ctx) && isFieldRelevant('total_floors', ctx),
        `${type} demande les deux — c’est l’un OU l’autre, jamais les deux`,
      ).toBe(false);
    }
  });

  it('INVARIANT — la surface est demandée pour TOUS les types, sans exception', () => {
    for (const type of propertyTypeValues) {
      expect(isFieldRelevant('area', { type, ...vente }), `${type} sans surface`).toBe(true);
    }
  });
});

describe('areaLabelKey', () => {
  it('nomme la surface d’un terrain autrement que celle d’un logement', () => {
    expect(areaLabelKey('land')).toBe('fields.areaLand');
    expect(areaLabelKey('farm')).toBe('fields.areaLand');
    expect(areaLabelKey('apartment')).toBe('fields.areaLiving');
  });
});

describe('sanitizeByType', () => {
  it('efface ce que le type ne concerne pas, et ne touche à rien d’autre', () => {
    const purge = sanitizeByType(
      { title: 'Mon terrain', area: 300, bedrooms: 3, furnished: true, title_type: 'bail' },
      { type: 'land', contract: 'sale' },
    );
    expect(purge).toEqual({ title: 'Mon terrain', area: 300, title_type: 'bail' });
  });

  it('efface la fréquence de loyer quand on bascule vers une vente (AC4)', () => {
    const purge = sanitizeByType(
      { price: 5_000_000, rent_period: 'monthly', available_from: '2026-10-01' },
      { type: 'villa', contract: 'sale' },
    );
    expect(purge).toEqual({ price: 5_000_000 });
  });

  it('n’invente aucune clé absente de l’entrée', () => {
    const purge = sanitizeByType({ title: 'x' }, { type: 'villa', contract: 'rent' });
    expect(Object.keys(purge)).toEqual(['title']);
  });
});
