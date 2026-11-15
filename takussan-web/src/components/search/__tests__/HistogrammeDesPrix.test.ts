import { describe, it, expect } from 'vitest';

import { borneDeLaMoitie, dansLeBudget, requeteDeRepartition } from '../HistogrammeDesPrix';

/** TCK-2499 — ce que l'histogramme du budget affirme, et ce qu'il demande. */
describe('borneDeLaMoitie — une borne vraie, jamais une médiane estimée', () => {
  it('rend la fin de la première tranche où le cumul atteint la moitié', () => {
    expect(borneDeLaMoitie([
      { from: 0, to: 100, count: 1 },
      { from: 100, to: 200, count: 3 },
      { from: 200, to: 300, count: 4 },
    ])).toBe(200);
  });

  it('la moitié EXACTE est atteinte (5 biens sur 10 sous 100)', () => {
    expect(borneDeLaMoitie([
      { from: 0, to: 100, count: 5 },
      { from: 100, to: 200, count: 5 },
    ])).toBe(100);
  });

  it('rien à dire sans bien', () => {
    expect(borneDeLaMoitie([])).toBeNull();
    expect(borneDeLaMoitie([{ from: 0, to: 100, count: 0 }])).toBeNull();
  });
});

describe('dansLeBudget — une tranche [from, to[ recoupe [min, max]', () => {
  const tranche = { from: 100, to: 200, count: 1 };
  it('sans borne, toutes', () => expect(dansLeBudget(tranche)).toBe(true));
  it('un minimum égal à la fin de la tranche l’exclut', () => expect(dansLeBudget(tranche, 200)).toBe(false));
  it('un maximum égal au début de la tranche l’inclut', () => expect(dansLeBudget(tranche, undefined, 100)).toBe(true));
  it('un maximum sous le début l’exclut', () => expect(dansLeBudget(tranche, undefined, 99)).toBe(false));
});

describe('requeteDeRepartition — le contrat de TCK-2498', () => {
  it('sans transaction : aucune requête', () => {
    expect(requeteDeRepartition({ city: 'Dakar' })).toBeNull();
  });

  it('garde les filtres de la liste, retire ses bornes, son tri et sa page', () => {
    const p = new URLSearchParams(
      requeteDeRepartition({
        contract_type: 'rent',
        city: 'Dakar',
        bedrooms: 2,
        price_min: 1,
        price_max: 2,
        sort: 'price_asc',
        page: 3,
        per_page: 60,
      })!,
    );
    expect(Object.fromEntries(p)).toEqual({ bedrooms: '2', city: 'Dakar', contract_type: 'rent' });
  });
});
