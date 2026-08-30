import { describe, expect, it } from 'vitest';
import { toCreatePayload, toUpdatePayload } from '../payload';
import type { PropertyFormPayload } from '@/lib/schemas/property';

function valeurs(patch: Partial<PropertyFormPayload> = {}): PropertyFormPayload {
  return {
    title: 'Villa aux Almadies',
    type: 'villa',
    contract_type: 'rent',
    price: 350_000,
    currency: 'XOF',
    rent_period: 'monthly',
    city: 'Dakar',
    furnished: false,
    tag_ids: [],
    ...patch,
  } as PropertyFormPayload;
}

describe('toCreatePayload', () => {
  /**
   * AC1 — LE test de non-régression du ticket.
   *
   * Sur le code d'avant TCK-464, ce chemin ne produisait AUCUNE ligne `addresses` : la condition
   * `hasAddress` ne testait ni `city`, ni `quarter`, ni `region`, et les trois partaient au
   * premier niveau du POST où `StorePropertyRequest` ne les déclare pas — donc `validated()` les
   * jetait. La ville, seul champ d'adresse OBLIGATOIRE du formulaire, n'était écrite nulle part.
   */
  it('AC1 — la ville seule suffit à produire un bloc adresse', () => {
    const payload = toCreatePayload(valeurs({ city: 'Dakar' }), 'submit');
    expect(payload.address).toEqual({ city: 'Dakar' });
  });

  it('mappe le quartier sur `neighborhood`, le nom de colonne de la table', () => {
    const payload = toCreatePayload(valeurs({ quarter: 'Almadies' }), 'submit');
    expect(payload.address).toEqual({ city: 'Dakar', neighborhood: 'Almadies' });
  });

  it('n’émet aucun bloc adresse quand aucun champ de localisation n’est renseigné', () => {
    const sansVille = { ...valeurs() } as Record<string, unknown>;
    delete sansVille.city;
    const payload = toCreatePayload(sansVille as unknown as PropertyFormPayload, 'submit');
    expect(payload.address).toBeUndefined();
  });

  it('ne laisse AUCUN champ d’adresse au premier niveau du payload', () => {
    const payload = toCreatePayload(
      valeurs({ city: 'Dakar', quarter: 'Almadies', street: 'Rue 12', country: 'SN' }),
      'submit',
    );
    for (const cle of ['city', 'quarter', 'region', 'street', 'postal_code', 'country', 'latitude', 'longitude']) {
      expect(payload, `${cle} ne doit pas rester au premier niveau`).not.toHaveProperty(cle);
    }
  });

  it('AC4 — une bascule vers la vente purge la fréquence et la disponibilité', () => {
    const payload = toCreatePayload(
      valeurs({ contract_type: 'sale', rent_period: 'monthly', available_from: '2026-10-01' }),
      'submit',
    );
    expect(payload).not.toHaveProperty('rent_period');
    expect(payload).not.toHaveProperty('available_from');
  });

  it('purge les champs qu’un terrain ne porte pas', () => {
    const payload = toCreatePayload(
      valeurs({ type: 'land', contract_type: 'sale', bedrooms: 3, year_built: 2010, furnished: true }),
      'submit',
    );
    expect(payload).not.toHaveProperty('bedrooms');
    expect(payload).not.toHaveProperty('year_built');
    expect(payload).not.toHaveProperty('furnished');
  });

  it('sort les tags du payload — ils passent par leur propre endpoint', () => {
    const payload = toCreatePayload(valeurs({ tag_ids: [1, 2] }), 'submit');
    expect(payload).not.toHaveProperty('tag_ids');
  });

  it('traduit l’intention en statut, et publie toujours en privé', () => {
    expect(toCreatePayload(valeurs(), 'draft').status).toBe('draft');
    expect(toCreatePayload(valeurs(), 'submit').status).toBe('pending_review');
    expect(toCreatePayload(valeurs(), 'submit').visibility).toBe('private');
  });
});

describe('toUpdatePayload', () => {
  it('emporte le bloc adresse et ne fixe aucun statut', () => {
    const payload = toUpdatePayload(valeurs({ city: 'Thiès', street: 'Rue 4' }));
    expect(payload.address).toEqual({ city: 'Thiès', street: 'Rue 4' });
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('visibility');
  });

  /**
   * TCK-469 AC1 — LE test du ticket. Avant lui, `bedrooms` était OMIS du corps : le backend
   * laissait donc `3` en base sur un terrain, et plus aucun écran ne rendait le champ qui aurait
   * permis de le corriger.
   */
  it('AC1 — un appartement à 3 chambres basculé en terrain envoie `bedrooms: null`', () => {
    const payload = toUpdatePayload(
      valeurs({ type: 'land', contract_type: 'sale', bedrooms: 3 }),
    );
    expect(payload).toHaveProperty('bedrooms', null);
  });

  /**
   * ⚠ Le garde-fou du précédent : « tout purger » cocherait AC1 aussi. Ce que la bascule ne
   * justifie PAS d'effacer doit traverser intact — ni omis, ni mis à `null`.
   */
  it('AC1 — les champs que le terrain justifie encore traversent intacts', () => {
    const payload = toUpdatePayload(
      valeurs({
        type: 'land',
        contract_type: 'sale',
        bedrooms: 3,
        area: 800,
        title_type: 'titre_foncier',
      }),
    );
    expect(payload.area).toBe(800);
    expect(payload.title_type).toBe('titre_foncier');
    expect(payload.title).toBe('Villa aux Almadies');
    expect(payload.price).toBe(350_000);
  });

  it('AC1 — `furnished` s’efface par `false`, la colonne n’acceptant pas `null`', () => {
    const payload = toUpdatePayload(
      valeurs({ type: 'land', contract_type: 'sale', furnished: true }),
    );
    expect(payload.furnished).toBe(false);
  });

  /**
   * AC3 — une valeur que le formulaire n'a jamais portée ne doit pas apparaître dans le corps :
   * une clé émise à `null` écraserait en base un champ que personne n'a touché.
   */
  it('AC3 — n’émet aucune clé absente des valeurs du formulaire', () => {
    const source = { ...valeurs({ type: 'land', contract_type: 'sale' }) } as Record<
      string,
      unknown
    >;
    for (const cle of ['bedrooms', 'bathrooms', 'year_built', 'parking_spaces']) {
      delete source[cle];
      expect(source).not.toHaveProperty(cle);
    }
    const payload = toUpdatePayload(source as unknown as PropertyFormPayload) as Record<
      string,
      unknown
    >;
    for (const cle of ['bedrooms', 'bathrooms', 'year_built', 'parking_spaces']) {
      expect(payload, `${cle} n’était pas dans l’entrée`).not.toHaveProperty(cle);
    }
  });
});

/**
 * TCK-469 AC2 — la création n'a PAS changé : elle omet, et n'émet aucun `null`. Les tests de
 * `toCreatePayload` ci-dessus vérifient l'omission clé par clé ; celui-ci ferme l'autre moitié,
 * celle qu'un « on efface partout » aurait franchie sans bruit.
 */
describe('toCreatePayload — AC2 de TCK-469 : le contrat de création ne bouge pas', () => {
  it('n’émet aucune valeur `null` dans le corps', () => {
    const payload = toCreatePayload(
      valeurs({
        type: 'land',
        contract_type: 'sale',
        bedrooms: 3,
        year_built: 2010,
        furnished: true,
        rent_period: 'monthly',
        available_from: '2026-10-01',
      }),
      'submit',
    ) as Record<string, unknown>;

    const nulles = Object.entries(payload)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    expect(nulles, 'aucune clé ne doit partir à null à la création').toEqual([]);
    expect(payload).not.toHaveProperty('furnished');
  });
});
