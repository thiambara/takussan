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
});
