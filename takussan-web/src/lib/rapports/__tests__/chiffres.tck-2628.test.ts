import { describe, expect, it } from 'vitest';

import { chiffresDeLAgence, chiffresDeLAgent, chiffresDuBailleur, variationDuMoisClos, type ResumeDAgence } from '../chiffres';

const AGENCE: ResumeDAgence = {
  properties: { total: 214, published: 67 },
  leases: { active: 92 },
  finance: { revenue_month: 95_200_000, overdue_count: 16, overdue_amount: 33_700_000, unpaid_rate_percent: 3.9 },
  occupancy: { rate_percent: 73, eligible_count: 82, occupied_count: 60 },
};

describe('TCK-2628 — les chiffres de l’admin', () => {
  it('six chiffres, chacun un lien, dans l’ordre de la maquette', () => {
    const c = chiffresDeLAgence(AGENCE, { months: ['2026-10', '2026-11'], revenue: [88_100_000, 95_200_000] });
    expect(c.map((x) => x.cle)).toEqual(['encaisse', 'impayes', 'occupation', 'bauxActifs', 'biensPublies', 'tauxImpayes']);
    for (const x of c) expect(x.href).toMatch(/^\/app\//);
  });

  it('Encaissé : « +8 % sur octobre », en succès, quand novembre est clos ; Impayés : 16 échéances, en danger', () => {
    const [encaisse, impayes] = chiffresDeLAgence(AGENCE, { months: ['2026-10', '2026-11'], revenue: [88_100_000, 95_200_000] }, { moisEnCours: '2026-12' });
    expect([encaisse.contexte, encaisse.ton]).toEqual([{ cle: 'variation', pourcent: 8, mois: '2026-10' }, 'succes']);
    expect([impayes.contexte, impayes.ton, impayes.href]).toEqual([{ cle: 'echeances', n: 16 }, 'danger', '/app/reports/unpaid']);
  });

  it('le mois en cours ne se compare pas au mois clos : ni variation ni ton sur la tuile', () => {
    const [encaisse] = chiffresDeLAgence(AGENCE, { months: ['2026-10', '2026-11'], revenue: [88_100_000, 9_000_000] }, { moisEnCours: '2026-11' });
    expect([encaisse.contexte, encaisse.ton]).toEqual([undefined, undefined]);
  });

  it('variationDuMoisClos : le mois en cours retiré, octobre comparé à septembre', () => {
    const mois = ['2026-09', '2026-10', '2026-11'];
    expect(variationDuMoisClos(mois, [80, 100, 3], '2026-11')).toEqual({ pourcent: 25, mois: '2026-10', precedent: '2026-09' });
    expect(variationDuMoisClos(mois, [80, 100, 120], null)).toEqual({ pourcent: 20, mois: '2026-11', precedent: '2026-10' });
    expect(variationDuMoisClos(['2026-10', '2026-11'], [1, 2], '2026-11')).toBeNull();
  });

  it('un chiffre ne mène qu’à une liste que la persona ouvre', () => {
    const ferme = { impayes: false, equipe: false };
    const c = chiffresDeLAgence(AGENCE, undefined, { ouvertes: ferme });
    expect(c.map((x) => x.href)).toEqual([
      '/app/payments?status=paid',
      '/app/payments?status=late',
      '/app/properties?mode=gestion&occupancy=occupied',
      '/app/leases?status=active',
      '/app/properties?mode=annonces&listing=online',
      '/app/payments?status=late',
    ]);
    const kpi = chiffresDeLAgence({ ...AGENCE, kpis: [{ metric: 'members_count', label: 'Équipe', format: 'number', value: 5 }] }, undefined, { ouvertes: ferme });
    expect(kpi[0]).not.toHaveProperty('href');
  });

  it('AC4 — l’occupation dit sa base : 60 biens loués sur 82', () => {
    expect(chiffresDeLAgence(AGENCE)[2].contexte).toEqual({ cle: 'loues', occupes: 60, eligibles: 82 });
  });

  it('les KPI personnalisés de l’agence remplacent les chiffres par défaut, dans leur ordre', () => {
    const c = chiffresDeLAgence({ ...AGENCE, kpis: [{ metric: 'members_count', label: 'Équipe', format: 'number', value: 5 }] });
    expect(c).toEqual([{ cle: 'kpi:members_count', libelle: 'Équipe', valeur: 5, forme: 'nombre', href: '/app/reports/team' }]);
  });
});

describe('TCK-2628 — les chiffres de l’agent', () => {
  it('baux signés du mois et de l’année, prospects ouverts, portée portée par les liens', () => {
    const c = chiffresDeLAgent(
      { finance: { commissions_month: 0, commissions_year: 10_200_000 }, visits: { upcoming_7d: 6 }, pipeline: { lead: 20, qualified: 18, converted: 4, lost: 9 } },
      { months: ['2025-12', '2026-01', '2026-11'], signed_leases: [5, 9, 2] },
      true,
    );
    expect(c.map((x) => [x.cle, x.valeur])).toEqual([['commissions', 0], ['bauxSignes', 2], ['visites', 6], ['prospects', 38]]);
    expect(c[1].contexte).toEqual({ cle: 'bauxCetteAnnee', n: 11 });
    expect(c[0].href).toBe('/app/reports/commissions?scope=agency');
  });
});

describe('TCK-2628 — les chiffres du bailleur', () => {
  it('AC4 — « 5 biens loués sur 5 en location » à côté du taux ; jamais le taux sans sa base', () => {
    const avec = chiffresDuBailleur({ portfolio: { total: 59, rented: 5, available: 54 }, occupancy: { rate_percent: 100, eligible_count: 5, occupied_count: 5 } });
    expect([avec[1].valeur, avec[1].contexte]).toEqual([100, { cle: 'loues', occupes: 5, eligibles: 5 }]);
    expect(avec[0].contexte).toEqual({ cle: 'portefeuille', loues: 5, libres: 54, autres: 0 });
    expect(avec.map((c) => c.cle)).toEqual(['portefeuille', 'occupation', 'encaisse', 'impayes', 'bauxActifs']);
    const sans = chiffresDuBailleur({ portfolio: { total: 59, rented: 5, available: 54 }, occupancy: { rate_percent: 100 } });
    expect([sans[1].valeur, sans[1].contexte]).toEqual([null, undefined]);
  });
});
