import { describe, expect, it } from 'vitest';

import {
  aUneRecherche,
  compteDesChambres,
  delaiDeReponse,
  elargissementsDeFiche,
  initiales,
  nomAbrege,
  parametresDuTotalDeFiche,
  parametresFixesDeFiche,
} from '@/lib/fiche-publique';
import type { SearchResult } from '@/types/search';

type Facettes = SearchResult['meta']['facets'];

/**
 * TCK-2522 / TCK-2523 — les règles pures des fiches publiques. Chaque bloc nomme la mutation
 * plausible qu'il refuse : un test qui resterait vert sous elle ne garderait rien.
 */
describe('TCK-2522 · AC3 — les élargissements de « aucun bien » comptés par les facettes', () => {
  // Relevé du 2026-11-09 sur Dakar Immo : `?agency=dakar-immo&contract_type=sale&type=garage`
  // → 0 bien ; facette `contract_type` = [{rent: 2}] ; facette `type` = 9 options, somme 22.
  const facettes: Facettes = {
    contract_type: [{ value: 'rent', count: 2 }],
    type: [
      { value: 'villa', count: 5 },
      { value: 'land', count: 4 },
      { value: 'office', count: 3 },
      { value: 'room', count: 3 },
      { value: 'apartment', count: 2 },
      { value: 'shop', count: 2 },
      { value: 'house', count: 1 },
      { value: 'studio', count: 1 },
      { value: 'warehouse', count: 1 },
    ],
    neighborhood: [{ value: 'Mermoz', count: 40 }],
    bedrooms: [{ value: 1, count: 50 }],
  };

  it('propose les deux élargissements, chacun au compte EXACT de sa facette', () => {
    expect(elargissementsDeFiche({ contract_type: 'sale', type: ['garage'] }, facettes)).toEqual([
      { cle: 'contract_type', compte: 2 },
      { cle: 'type', compte: 22 },
    ]);
  });

  it("ne propose que l'élargissement d'un filtre POSÉ", () => {
    // Mutation refusée : proposer « retirer le type » alors qu'aucun type n'est filtré.
    expect(elargissementsDeFiche({ contract_type: 'sale' }, facettes)).toEqual([{ cle: 'contract_type', compte: 2 }]);
    expect(elargissementsDeFiche({ type: ['garage'] }, facettes)).toEqual([{ cle: 'type', compte: 22 }]);
  });

  it('un élargissement qui ne rend aucun bien n’est pas proposé', () => {
    // Relevé : `contract_type=sale&type=studio&bedrooms=3` → facette `contract_type` vide.
    expect(elargissementsDeFiche({ contract_type: 'sale', type: ['studio'] }, { contract_type: [], type: [{ value: 'villa', count: 0 }] })).toEqual([]);
  });

  it('sans facettes servies (panne, ancienne API), aucun compte inventé', () => {
    expect(elargissementsDeFiche({ contract_type: 'sale', type: ['garage'] }, undefined)).toEqual([]);
  });

  it('jamais le quartier ni les chambres : leur somme est un plancher, pas un compte', () => {
    // Mutation refusée : sommer `neighborhood` (40) ou prendre `bedrooms` comme compte d'élargissement.
    const proposes = elargissementsDeFiche({ location: 'Mermoz', bedrooms: 6 }, facettes);
    expect(proposes).toEqual([]);
  });
});

describe('TCK-2522 — les paramètres fixes de la recherche d’une fiche', () => {
  it('portent le périmètre, aucun sponsorisé, les quatre facettes et douze biens par page', () => {
    expect(parametresFixesDeFiche({ agency: 'dakar-immo' })).toEqual({
      agency: 'dakar-immo',
      placements: 'false',
      facets: 'contract_type,type,bedrooms,neighborhood',
      per_page: '12',
    });
  });

  it('le total « sur M » ne demande ni facettes ni filtres, une ligne seulement', () => {
    expect(parametresDuTotalDeFiche({ agent: 'awa-diop' })).toEqual({ agent: 'awa-diop', placements: 'false', per_page: '1' });
  });
});

describe('TCK-2523 — la recherche d’une fiche de personne n’apparaît qu’au-delà de six biens', () => {
  it.each([
    [0, false],
    [6, false],
    [7, true],
    [55, true],
  ])('%i biens → recherche : %s', (total, attendu) => {
    expect(aUneRecherche(total)).toBe(attendu);
  });
});

describe('TCK-2523 (décision 1b) — le nom abrégé d’un propriétaire', () => {
  it('prénom et initiale du nom', () => {
    expect(nomAbrege('Sokhna', 'Gueye', 'Sokhna Gueye')).toBe('Sokhna G.');
  });

  it('jamais le nom complet, même sans prénom séparé', () => {
    expect(nomAbrege(null, null, 'Sokhna Fatou Gueye')).toBe('Sokhna G.');
    expect(nomAbrege(undefined, undefined, 'Sokhna')).toBe('Sokhna');
  });

  it('prénom seul quand le nom manque', () => {
    expect(nomAbrege('Sokhna', '  ', 'Sokhna Gueye')).toBe('Sokhna');
  });

  it('initiales : deux lettres au plus', () => {
    expect(initiales('Dakar Immo Conseil')).toBe('DI');
    expect(initiales('awa')).toBe('A');
  });
});

describe('TCK-2518 — le délai de réponse', () => {
  it.each([
    [null, null],
    [undefined, null],
    [Number.POSITIVE_INFINITY, null],
    [Number.NaN, null],
    [-5, null],
  ])('%s → rien à afficher (jamais « 0 »)', (minutes, attendu) => {
    expect(delaiDeReponse(minutes as number | null | undefined)).toBe(attendu);
  });

  it.each([
    [0, { unite: 'minutes', valeur: 1 }],
    [42, { unite: 'minutes', valeur: 42 }],
    [59, { unite: 'minutes', valeur: 59 }],
    [60, { unite: 'heures', valeur: 1 }],
    [150, { unite: 'heures', valeur: 3 }],
    [1439, { unite: 'jours', valeur: 1 }],
    [2880, { unite: 'jours', valeur: 2 }],
  ])('%i minutes → %o', (minutes, attendu) => {
    expect(delaiDeReponse(minutes)).toEqual(attendu);
  });
});

describe('compteDesChambres — facette cumulée', () => {
  const facette = [
    { value: 1, count: 30 },
    { value: 2, count: 20 },
    { value: 5, count: 4 },
  ];
  it('prend la plus petite valeur servie qui atteint le seuil', () => {
    expect(compteDesChambres(facette, 2)).toBe(20);
    // Sans valeur 3 ni 4 servie, « 3+ » vaut le compte de 5.
    expect(compteDesChambres(facette, 3)).toBe(4);
  });
  it('rien au-dessus : 0', () => {
    expect(compteDesChambres(facette, 6)).toBe(0);
    expect(compteDesChambres(undefined, 1)).toBe(0);
  });
});
