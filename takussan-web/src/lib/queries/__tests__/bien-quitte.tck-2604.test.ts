/**
 * TCK-2604 — `bienQuitte` réduit la fiche partagée aux huit champs que la connexion montre.
 * Le rendu de la page double ce module : c'est ici que la réduction elle-même est éprouvée.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PropertyDetail } from '@/types/property';

const getPropertyMock = vi.fn();
vi.mock('../public-property', () => ({ getProperty: (...args: unknown[]) => getPropertyMock(...args) }));

const { bienQuitte } = await import('../bien-quitte');

function fiche(champs: Record<string, unknown>): { etat: 'trouve'; bien: PropertyDetail } {
  return {
    etat: 'trouve',
    bien: {
      slug: 'studio-meuble-mermoz-a1b2c3',
      title: 'Studio meublé',
      location: { quarter: 'Mermoz', city: 'Dakar' },
      main_photo_url: 'http://127.0.0.1:8002/storage/studio.jpg',
      price: 250000,
      currency: 'XOF',
      contract_type: 'rent',
      rent_period: null,
      agency: { name: '  Dakar Immo ' },
      ...champs,
    } as unknown as PropertyDetail,
  };
}

beforeEach(() => getPropertyMock.mockReset());

describe('bienQuitte', () => {
  it('lit la fiche partagée et n’en garde que ce que la connexion montre', async () => {
    getPropertyMock.mockResolvedValue(fiche({}));
    expect(await bienQuitte('studio-meuble-mermoz-a1b2c3', 'fr')).toEqual({
      slug: 'studio-meuble-mermoz-a1b2c3',
      titre: 'Studio meublé',
      quartier: 'Mermoz',
      photo: 'http://127.0.0.1:8002/storage/studio.jpg',
      prix: 250000,
      devise: 'XOF',
      periode: 'monthly',
      agence: 'Dakar Immo',
    });
    expect(getPropertyMock).toHaveBeenCalledWith('studio-meuble-mermoz-a1b2c3', 'fr');
  });

  it('sans agence, sans prix, à la vente : rien d’inventé', async () => {
    getPropertyMock.mockResolvedValue(fiche({ agency: null, price: 0, contract_type: 'sale', main_photo_url: null, location: { quarter: null, city: 'Dakar' } }));
    expect(await bienQuitte('x-a1b2c3', 'fr')).toMatchObject({ agence: null, prix: null, periode: null, photo: null, quartier: 'Dakar' });
    getPropertyMock.mockResolvedValue(fiche({ agency: { name: '   ' } }));
    expect((await bienQuitte('x-a1b2c3', 'fr'))?.agence).toBeNull();
  });

  it.each(['introuvable', 'indisponible'] as const)('« %s » : aucun bien, la forme directe', async (etat) => {
    getPropertyMock.mockResolvedValue({ etat });
    expect(await bienQuitte('x-a1b2c3', 'fr')).toBeNull();
  });
});
