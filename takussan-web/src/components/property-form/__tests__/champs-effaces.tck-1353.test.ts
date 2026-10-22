import { describe, expect, it } from 'vitest';

import { propertyFormSchema } from '@/lib/schemas/property';
import { CHAMPS_EFFACABLES, toUpdatePayload, withClearedFields } from '../payload';

/**
 * TCK-1353 (P149.01) — la page d'édition du bien efface ce qu'on vide : « Non précisé » des
 * nombres en liste, la description et la date de disponibilité sortaient du schéma en `undefined`,
 * donc OMIS du corps, et l'API gardait l'ancienne valeur. Un champ jamais touché reste omis.
 */
const BASE = { title: 'Appartement à Mermoz', type: 'apartment', price: 300_000, city: 'Dakar', contract_type: 'rent', rent_period: 'monthly' };
const NOUVEAUX = ['bedrooms', 'bathrooms', 'year_built', 'floor_number', 'parking_spaces', 'total_floors', 'description', 'available_from'] as const;

function corps(valeurs: Record<string, unknown>, dirty: Record<string, boolean>) {
  const v = propertyFormSchema.parse({ ...BASE, ...valeurs });
  return JSON.parse(JSON.stringify(withClearedFields(toUpdatePayload(v), v, dirty))) as Record<string, unknown>;
}

describe('withClearedFields — les champs vidés de l’édition (TCK-1353)', () => {
  it.each(NOUVEAUX)('%s vidé et modifié → null', (cle) => {
    const vide = cle === 'description' || cle === 'available_from' ? '' : undefined;
    expect(corps({ [cle]: vide }, { [cle]: true })).toHaveProperty(cle, null);
  });

  it.each(NOUVEAUX)('%s vide mais jamais touché → omis', (cle) => {
    expect(corps({}, {})).not.toHaveProperty(cle);
  });

  it('une valeur saisie part telle quelle', () => {
    expect(corps({ bedrooms: 3, description: 'Lumineux' }, { bedrooms: true, description: true })).toMatchObject({
      bedrooms: 3,
      description: 'Lumineux',
    });
  });
});

/**
 * La liste se tient depuis le schéma : chaque champ facultatif est classé. Un champ facultatif neuf
 * fait rougir ce test tant qu'on n'a pas dit comment l'édition l'efface.
 */
describe('chaque champ facultatif du schéma est classé (TCK-1353)', () => {
  const ADRESSE = ['quarter', 'region', 'street', 'postal_code', 'country', 'latitude', 'longitude', 'geo_region_id', 'geo_city_id', 'geo_neighborhood_id'];
  const VALEUR_PAR_DEFAUT = ['currency', 'furnished', 'tag_ids', 'tag_names'];
  // Hors de TCK-1353 : trois sélecteurs non mesurés ici. La surface est effaçable (TCK-1485).
  const NON_TRAITES = ['rent_period', 'title_type', 'condition'];

  it('effaçable, adresse, valeur par défaut, ou non traité', () => {
    const forme = propertyFormSchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
    const facultatifs = Object.keys(forme).filter((k) => forme[k].safeParse(undefined).success).sort();
    const classes = [...CHAMPS_EFFACABLES, ...ADRESSE, ...VALEUR_PAR_DEFAUT, ...NON_TRAITES].sort();
    expect(facultatifs).toEqual(classes);
  });
});
