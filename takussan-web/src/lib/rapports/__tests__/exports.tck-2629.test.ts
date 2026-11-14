import { describe, expect, it } from 'vitest';

import { bornesDuPrereglage, cartesPermises, exportsPermis, prereglageDe } from '../exports';

/** TCK-2629 — les préréglages de période et les types permis, partagés par cartes, formulaire et « Refaire ». */
describe('TCK-2629 — préréglages de période', () => {
  const LE_10_NOVEMBRE = new Date('2026-11-10T10:00:00Z');

  it('« Mois dernier » le 2026-11-10 : du 1er au 31 octobre (AC1)', () => {
    expect(bornesDuPrereglage('moisDernier', LE_10_NOVEMBRE)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('en janvier, « Mois dernier » est décembre de l’année d’avant', () => {
    expect(bornesDuPrereglage('moisDernier', new Date('2027-01-05T00:30:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('« Ce mois » et « Année » : bornes pleines', () => {
    expect(bornesDuPrereglage('ceMois', new Date('2028-02-10T00:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(bornesDuPrereglage('annee', LE_10_NOVEMBRE)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('une période retrouve son préréglage, une période libre n’en a pas', () => {
    expect(prereglageDe({ from: '2026-10-01', to: '2026-10-31' }, LE_10_NOVEMBRE)).toBe('moisDernier');
    expect(prereglageDe({ from: '2026-10-02', to: '2026-10-31' }, LE_10_NOVEMBRE)).toBeNull();
  });
});

describe('TCK-2629 — types permis et cartes prêtes', () => {
  it('le personnel : par capacité ; le bailleur : ses trois types, quelles que soient les capacités', () => {
    expect(exportsPermis(true, { 'crm.export': true })).toEqual(['customers']);
    expect(exportsPermis(false, { 'reports.export': true, 'crm.export': true })).toEqual(['payments', 'leases', 'properties']);
  });

  it('une carte dont le type n’est pas permis n’est pas rendue', () => {
    expect(cartesPermises(['payments']).map((c) => c.id)).toEqual(['paiements']);
    expect(cartesPermises(['payments', 'leases', 'properties']).map((c) => c.id)).toEqual(['paiements', 'baux']);
  });
});
