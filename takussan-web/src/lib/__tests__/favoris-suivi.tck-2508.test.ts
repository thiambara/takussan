/**
 * TCK-2508 — les règles pures du suivi des favoris : l'écart de prix, le prix retenu à l'ajout de
 * l'anonyme (magasin local), le lien de sélection partagée, la requête des biens nouveaux.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  add,
  clear,
  FACETTES_MAX,
  FAVORITES_FACETS_STORAGE_KEY,
  FAVORITES_PRICES_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  getIds,
  getPrixALAjout,
  remove,
  replace,
  retenirFacettes,
  retenirPrixALAjout,
  toggle,
} from '@/lib/favoritesStore';
import {
  alerteDeLaSelection,
  cheminDesBiensProches,
  cheminDeSelection,
  cheminDesNouveaux,
  ecartAffichable,
  ecartDepuisLAjout,
  idsDeSelection,
  retenirLePrixVuALAjout,
  SELECTION_PARTAGEE_MAX,
} from '@/lib/favoris-suivi';

describe('ecartDepuisLAjout / ecartAffichable', () => {
  it('300 000 à l’ajout, 250 000 relu → −50 000 (AC4)', () => {
    expect(ecartDepuisLAjout(300_000, 250_000)).toBe(-50_000);
  });

  it('une hausse est positive', () => {
    expect(ecartDepuisLAjout(250_000, 300_000)).toBe(50_000);
  });

  it('sans prix à l’ajout, aucun écart — et pas 0', () => {
    expect(ecartDepuisLAjout(undefined, 250_000)).toBeNull();
    expect(ecartDepuisLAjout(null, 250_000)).toBeNull();
    expect(ecartDepuisLAjout(300_000, null)).toBeNull();
  });

  it('calcule en centimes : aucun écart fantôme sur des décimales', () => {
    expect(ecartDepuisLAjout(0.1 + 0.2, 0.3)).toBe(0);
  });

  it('ni null ni 0 ne s’affichent (AC1) ; tout autre écart, oui', () => {
    expect(ecartAffichable(null)).toBe(false);
    expect(ecartAffichable(undefined)).toBe(false);
    expect(ecartAffichable(0)).toBe(false);
    expect(ecartAffichable(-50_000)).toBe(true);
    expect(ecartAffichable(1)).toBe(true);
  });
});

describe('favoritesStore — prix à l’ajout (anonyme)', () => {
  beforeEach(() => localStorage.clear());

  it('add(id, prix) retient le prix ; la liste d’identifiants garde sa forme (number[])', () => {
    add(10, 300_000);
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? 'null')).toEqual([10]);
    expect(getPrixALAjout()).toEqual({ 10: 300_000 });
  });

  it('retenirPrixALAjout ne rebase JAMAIS un prix déjà posé', () => {
    add(10, 300_000);
    expect(retenirPrixALAjout(10, 250_000)).toBe(false);
    expect(getPrixALAjout()[10]).toBe(300_000);
  });

  it('retenirPrixALAjout ne recrée pas un favori retiré entre-temps', () => {
    add(10);
    remove(10);
    expect(retenirPrixALAjout(10, 300_000)).toBe(false);
    expect(getIds()).toEqual([]);
    expect(getPrixALAjout()).toEqual({});
  });

  it('retirer puis remettre en favori repart d’un prix neuf', () => {
    add(10, 300_000);
    toggle(10);
    expect(getPrixALAjout()).toEqual({});
    add(10, 280_000);
    expect(getPrixALAjout()[10]).toBe(280_000);
  });

  it('replace() (versement au compte) ne garde que les prix des identifiants présents', () => {
    add(10, 300_000);
    add(11, 400_000);
    replace([11, 12]);
    expect(getPrixALAjout()).toEqual({ 11: 400_000 });
  });

  it('clear() (déconnexion) efface aussi les prix', () => {
    add(10, 300_000);
    clear();
    expect(localStorage.getItem(FAVORITES_PRICES_STORAGE_KEY)).toBeNull();
  });

  it('un stockage altéré ne produit aucun prix', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, '[10]');
    localStorage.setItem(FAVORITES_PRICES_STORAGE_KEY, '{"10":"300000","abc":5,"11":-3}');
    expect(getPrixALAjout()).toEqual({});
  });
});

describe('retenirLePrixVuALAjout — relu par by-ids', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('retient le prix PUBLIC rendu par by-ids pour un favori présent', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return new Response(JSON.stringify({ data: [{ id: 10, price: 300000 }], meta: {} }), { status: 200 });
      }),
    );
    add(10);
    expect(await retenirLePrixVuALAjout(10)).toBe(true);
    expect(urls[0]).toMatch(/\/api\/public\/properties\/by-ids\?ids=10$/);
    expect(getPrixALAjout()[10]).toBe(300000);
  });

  it('un bien que by-ids ne rend pas (non public) ne reçoit aucun prix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [], meta: {} }), { status: 200 })));
    add(10);
    expect(await retenirLePrixVuALAjout(10)).toBe(false);
    expect(getPrixALAjout()).toEqual({});
  });
});

describe('sélection partagée', () => {
  it('idsDeSelection : entiers positifs, sans doublon, dans l’ordre, au plus la borne de by-ids', () => {
    expect(idsDeSelection('3,1,3,abc,-2,0,../x,2')).toEqual([3, 1, 2]);
    const beaucoup = Array.from({ length: 30 }, (_, i) => i + 1).join(',');
    expect(idsDeSelection(beaucoup)).toHaveLength(SELECTION_PARTAGEE_MAX);
    expect(SELECTION_PARTAGEE_MAX).toBe(20);
    expect(idsDeSelection(null)).toEqual([]);
  });

  it('le chemin ne porte que des identifiants de biens', () => {
    expect(cheminDeSelection('fr', [5, 9])).toBe('/fr/favorites/shared?ids=5,9');
  });
});

describe('cheminDesNouveaux — contrat de TCK-2507 / TCK-2496', () => {
  it('critères + published_after à plat + placements=false, sans page ni tri hérités', () => {
    const chemin = cheminDesNouveaux(
      { contract_type: 'rent', location: 'Mermoz', type: ['apartment', 'studio'], page: 4, sort: 'price_asc' },
      '2026-11-01T10:00:00+00:00',
    );
    expect(chemin).not.toBeNull();
    const url = new URL(chemin as string, 'http://api.test');
    expect(url.pathname).toBe('/api/public/properties/search');
    expect(url.searchParams.get('published_after')).toBe('2026-11-01T10:00:00+00:00');
    expect(url.searchParams.get('placements')).toBe('false');
    expect(url.searchParams.get('contract_type')).toBe('rent');
    expect(url.searchParams.get('location')).toBe('Mermoz');
    expect(url.searchParams.get('type')).toBe('apartment,studio');
    expect(url.searchParams.get('page')).toBeNull();
    expect(url.searchParams.get('sort')).toBe('created_desc');
    expect(url.searchParams.has('filter[published_after]')).toBe(false);
  });

  it('sans date de référence, aucune requête', () => {
    expect(cheminDesNouveaux({ contract_type: 'rent' }, null)).toBeNull();
  });
});

describe('alerteDeLaSelection — « Prévenez-moi … à {lieu} »', () => {
  const b = (id: number, quarter: string | null, city: string | null, contract_type = 'rent') =>
    ({ id, contract_type, location: { quarter, city } }) as unknown as import('@/types/property').PropertyListItem;

  it('le quartier le plus représenté, et sa transaction commune', () => {
    expect(alerteDeLaSelection([b(1, 'Fann', 'Dakar'), b(2, 'Mermoz', 'Dakar'), b(3, 'Mermoz', 'Dakar')])).toEqual({
      lieu: 'Mermoz',
      criteria: { location: 'Mermoz', contract_type: 'rent' },
    });
  });

  it('à égalité, le quartier du bien le plus récent (le premier de la sélection)', () => {
    expect(alerteDeLaSelection([b(1, 'Fann', 'Dakar'), b(2, 'Mermoz', 'Dakar')])?.lieu).toBe('Fann');
  });

  it('transactions mêlées dans le lieu : aucune transaction imposée', () => {
    expect(alerteDeLaSelection([b(1, 'Ngor', 'Dakar', 'sale'), b(2, 'Ngor', 'Dakar', 'rent')])?.criteria).toEqual({
      location: 'Ngor',
    });
  });

  it('sans quartier : la ville ; sans lieu du tout : rien', () => {
    expect(alerteDeLaSelection([b(1, null, 'Thiès', 'sale')])).toEqual({
      lieu: 'Thiès',
      criteria: { city: 'Thiès', contract_type: 'sale' },
    });
    expect(alerteDeLaSelection([b(1, null, null)])).toBeNull();
    expect(alerteDeLaSelection([])).toBeNull();
  });
});

describe('Biens proches — facettes retenues et lien filtré', () => {
  beforeEach(() => localStorage.clear());

  it('le lien porte transaction, type, ville et quartier ; sans facettes, la liste sans filtre', () => {
    expect(cheminDesBiensProches({ contract_type: 'rent', type: 'villa', city: 'Dakar', quarter: 'Point E' })).toBe(
      '/properties?contract_type=rent&type=villa&city=Dakar&location=Point+E',
    );
    expect(cheminDesBiensProches(null)).toBe('/properties');
  });

  it('retient ce que l’écran a montré, borné : le plus ancien part d’abord, un bien revu repasse en dernier', () => {
    const vus = Array.from({ length: FACETTES_MAX + 1 }, (_, i) => ({
      id: i + 1,
      type: 'apartment',
      contract_type: 'rent',
      location: { city: 'Dakar', quarter: `Q${i + 1}` },
    }));
    retenirFacettes(vus.slice(0, FACETTES_MAX));
    retenirFacettes([vus[0]]); // le n° 1 revu : il devient le plus récent
    retenirFacettes([vus[FACETTES_MAX]]);
    const paires = JSON.parse(localStorage.getItem(FAVORITES_FACETS_STORAGE_KEY) ?? '[]') as Array<[number, unknown]>;
    const gardees = Object.fromEntries(paires.map(([id, f]) => [String(id), f])) as Record<string, unknown>;
    expect(paires.at(-1)?.[0]).toBe(FACETTES_MAX + 1);
    expect(paires.at(-2)?.[0]).toBe(1);
    expect(Object.keys(gardees)).toHaveLength(FACETTES_MAX);
    expect(gardees['1']).toBeDefined();
    expect(gardees['2']).toBeUndefined();
    expect(gardees[String(FACETTES_MAX + 1)]).toEqual({ city: 'Dakar', quarter: `Q${FACETTES_MAX + 1}`, type: 'apartment', contract_type: 'rent' });
  });

  it('la déconnexion (clear) efface aussi les facettes', () => {
    retenirFacettes([{ id: 3, type: 'villa', contract_type: 'sale', location: { city: 'Dakar', quarter: 'Ngor' } }]);
    expect(localStorage.getItem(FAVORITES_FACETS_STORAGE_KEY)).not.toBeNull();
    clear();
    expect(localStorage.getItem(FAVORITES_FACETS_STORAGE_KEY)).toBeNull();
  });
});

