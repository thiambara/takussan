import { describe, expect, it } from 'vitest';
import { toCreatePayload, toUpdatePayload, type PropertyUpdatePayload } from '../payload';
import { propertyFormSchema } from '@/lib/schemas/property';

/**
 * TCK-633 (lot D) — les identifiants du référentiel et les équipements proposés dans le corps.
 *
 * Deux règles : l'identifiant d'une ville ou d'un quartier CHOISI part DANS le bloc adresse, à
 * côté du texte (`StorePropertyRequest` déclare `address.geo_city_id`) ; la région du référentiel
 * et les noms d'équipements ne partent JAMAIS au premier niveau — le premier n'a pas de colonne,
 * le second a son endpoint (`PUT …/tags`).
 */
const saisie = { title: 'Villa', type: 'villa', contract_type: 'sale', price: 1000, city: 'Dakar' };

describe('le référentiel dans le corps de requête', () => {
  it('l’identifiant de la ville et du quartier choisis part dans le bloc adresse', () => {
    const valeurs = propertyFormSchema.parse({
      ...saisie, quarter: 'Liberté 4', geo_region_id: 1, geo_city_id: 10, geo_neighborhood_id: 100,
    });
    expect(toCreatePayload(valeurs).address).toEqual({
      city: 'Dakar', neighborhood: 'Liberté 4', geo_city_id: 10, geo_neighborhood_id: 100,
    });
  });

  it('un identifiant nul (texte retapé) est omis : le serveur rapproche alors le nom lui-même', () => {
    const valeurs = propertyFormSchema.parse({ ...saisie, quarter: 'Keur Gorgui Nord', geo_city_id: 10, geo_neighborhood_id: null });
    expect(toUpdatePayload(valeurs).address).toEqual({ city: 'Dakar', neighborhood: 'Keur Gorgui Nord', geo_city_id: 10 });
  });

  it('ni la région du référentiel ni les identifiants ne restent au premier niveau', () => {
    const valeurs = propertyFormSchema.parse({ ...saisie, geo_region_id: 1, geo_city_id: 10, geo_neighborhood_id: 100 });
    for (const corps of [toCreatePayload(valeurs), toUpdatePayload(valeurs)]) {
      for (const cle of ['geo_region_id', 'geo_city_id', 'geo_neighborhood_id']) {
        expect(corps, `${cle} ne doit pas rester au premier niveau`).not.toHaveProperty(cle);
      }
    }
  });

  it('un identifiant nul ou négatif est refusé dès le formulaire', () => {
    expect(propertyFormSchema.safeParse({ ...saisie, geo_city_id: 0 }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...saisie, geo_neighborhood_id: -3 }).success).toBe(false);
  });
});

describe('les équipements proposés', () => {
  it('`tag_names` vaut [] par défaut et ses noms sont épurés', () => {
    expect(propertyFormSchema.parse(saisie).tag_names).toEqual([]);
    expect(propertyFormSchema.parse({ ...saisie, tag_names: ['  Forage  '] }).tag_names).toEqual(['Forage']);
  });

  it('un nom vide ou de plus de 100 caractères est refusé', () => {
    expect(propertyFormSchema.safeParse({ ...saisie, tag_names: ['   '] }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...saisie, tag_names: ['x'.repeat(101)] }).success).toBe(false);
  });

  it('`tag_names` ne part jamais dans le corps du bien', () => {
    const valeurs = propertyFormSchema.parse({ ...saisie, tag_ids: [3], tag_names: ['Forage'] });
    expect(toCreatePayload(valeurs)).not.toHaveProperty('tag_names');
    expect(toUpdatePayload(valeurs)).not.toHaveProperty('tag_ids');
  });
});

/** Vérifié par `npx tsc --noEmit`, pas par vitest : la directive devient INUTILISÉE si l'interdit tombe. */
export const interditsDeTypage: Pick<PropertyUpdatePayload, 'tag_names' | 'geo_region_id'>[] = [
  // @ts-expect-error — `tag_names` au premier niveau ne compile pas.
  { tag_names: ['Forage'] },
  // @ts-expect-error — `geo_region_id` non plus.
  { geo_region_id: 1 },
];
