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
    const cles: ConditionalFieldKey[] = [
      'bedrooms', 'bathrooms', 'furnished', 'year_built', 'parking_spaces',
    ];
    for (const cle of cles) {
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
    const cles: ConditionalFieldKey[] = ['rent_period', 'available_from'];
    for (const cle of cles) {
      expect(isFieldRelevant(cle, { type: 'villa', ...location })).toBe(true);
      expect(isFieldRelevant(cle, { type: 'villa', ...vente })).toBe(false);
    }
  });

  it('un entrepôt et une usine ont un statut foncier — ce n’est pas réservé à l’habitat', () => {
    expect(isFieldRelevant('title_type', { type: 'warehouse', ...vente })).toBe(true);
    expect(isFieldRelevant('title_type', { type: 'factory', ...vente })).toBe(true);
  });

  it('un lot dans un immeuble ou un emplacement n’ont pas de statut foncier propre', () => {
    expect(isFieldRelevant('title_type', { type: 'apartment', ...vente })).toBe(false);
    expect(isFieldRelevant('title_type', { type: 'parking', ...vente })).toBe(false);
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

describe('sanitizeByType — mode `erase` (TCK-469)', () => {
  const terrain = { type: 'land', contract: 'sale' } as const;

  it('substitue la valeur d’effacement au lieu d’omettre la clé', () => {
    const sortie = sanitizeByType(
      { title: 'Mon terrain', area: 300, bedrooms: 3, year_built: 2010 },
      terrain,
      'erase',
    );
    expect(sortie).toHaveProperty('bedrooms', null);
    expect(sortie).toHaveProperty('year_built', null);
  });

  /**
   * ⚠ Le pendant indispensable du test ci-dessus : purger TOUT le satisferait aussi. Ici, `area`
   * et `title_type` sont pertinents pour un terrain — ils doivent traverser INTACTS, et surtout
   * pas à `null`.
   */
  it('ne touche pas aux champs que le nouveau type justifie encore', () => {
    const sortie = sanitizeByType(
      { title: 'Mon terrain', area: 300, title_type: 'bail', bedrooms: 3 },
      terrain,
      'erase',
    );
    expect(sortie.area).toBe(300);
    expect(sortie.title_type).toBe('bail');
    expect(sortie.title).toBe('Mon terrain');
  });

  /**
   * `furnished` est la seule exception, et elle est structurelle : sa colonne est
   * `boolean NOT NULL DEFAULT false` et `UpdatePropertyRequest` la déclare `['sometimes',
   * 'boolean']` — un `null` y produirait un 422, pas un effacement.
   */
  it('efface `furnished` par `false`, jamais par `null`', () => {
    const sortie = sanitizeByType({ furnished: true }, terrain, 'erase');
    expect(sortie.furnished).toBe(false);
    expect(sortie.furnished).not.toBeNull();
  });

  /** AC3 — une clé absente de l’entrée le reste : rien à écraser en base. */
  it('n’ajoute aucune clé que l’entrée ne portait pas', () => {
    const sortie = sanitizeByType({ title: 'Mon terrain' }, terrain, 'erase');
    expect(Object.keys(sortie)).toEqual(['title']);
  });

  /** `tag_ids` ne voyage pas dans le corps du bien : il reste omis, même en mode `erase`. */
  it('omet `tag_ids` dans les deux modes', () => {
    const sortie = sanitizeByType({ title: 'x', tag_ids: [1, 2] }, terrain, 'erase');
    expect(sortie).not.toHaveProperty('tag_ids');
  });

  it('le mode par défaut reste `omit` — le contrat de la création ne bouge pas', () => {
    const sortie = sanitizeByType({ title: 'x', bedrooms: 3 }, terrain);
    expect(sortie).not.toHaveProperty('bedrooms');
  });
});
