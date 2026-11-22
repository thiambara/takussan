/**
 * TCK-2791 — les chiffres de « Rapports » sous « Mois dernier » : la variation d'« Encaissé » compare le mois
 * SERVI (clos) au précédent, jamais le mois en cours ; « Baux signés » se lit au point du mois servi ; les états
 * du jour (listés par l'API dans `period.as_of_today`) se disent « aujourd'hui » ; sous le mois en cours, rien
 * ne change.
 */
import { describe, expect, it } from 'vitest';

import { chiffresDeLAgence, chiffresDeLAgent, chiffresDuBailleur, etatsDuJourAMarquer, type ResumeDAgence } from '../chiffres';
import { avecLaPeriode, moisEnCoursDeLaReponse, moisPrecedent, periodeTransmise } from '../periode';

const AGENCE: ResumeDAgence = {
  properties: { total: 214, published: 67 },
  leases: { active: 92 },
  finance: { revenue_month: 88_000_000, overdue_count: 16, overdue_amount: 33_700_000, unpaid_rate_percent: 3.9 },
  occupancy: { rate_percent: 73, eligible_count: 82, occupied_count: 60 },
  kpis: [
    { metric: 'revenue_month', label: 'Encaissé', format: 'currency', value: 88_000_000, as_of_today: false },
    { metric: 'leases_active', label: 'Baux', format: 'number', value: 92, as_of_today: true },
  ],
};
const ETATS_AGENCE = ['finance.overdue_amount', 'occupancy.rate_percent', 'leases.active', 'properties.published', 'finance.unpaid_rate_percent'];
const SERIE = { months: ['2026-09', '2026-10', '2026-11'], revenue: [80_000_000, 88_000_000, 4_000_000] };

describe('TCK-2791 — la période de l’adresse, une liste fermée', () => {
  it('seul `last_month` vaut le mois dernier ; tout le reste (inconnu, tableau, absent) vaut le mois en cours', () => {
    expect(periodeTransmise('last_month')).toBe('last_month');
    for (const v of ['yesterday', 'LAST_MONTH', '', undefined, null, ['last_month']]) expect(periodeTransmise(v as never)).toBe('current_month');
  });

  it('l’adresse garde ses paramètres ; le mois en cours n’écrit rien', () => {
    expect(avecLaPeriode('/app/reports?scope=agency', 'last_month')).toBe('/app/reports?scope=agency&period=last_month');
    expect(avecLaPeriode('/app/reports', 'current_month')).toBe('/app/reports');
  });

  it('le mois dernier : décembre de l’année d’avant en janvier, février un 31 mars', () => {
    expect(moisPrecedent(new Date('2027-01-10T12:00:00Z'))).toEqual({ debut: '2026-12-01', fin: '2026-12-31' });
    expect(moisPrecedent(new Date('2026-03-31T12:00:00Z'))).toEqual({ debut: '2026-02-01', fin: '2026-02-28' });
  });

  it('le mois en cours vu par la réponse : le mois servi, ou celui qui le suit sous « Mois dernier »', () => {
    expect(moisEnCoursDeLaReponse({ start: '2026-11-01T00:00:00+00:00', key: 'current_month' })).toBe('2026-11');
    expect(moisEnCoursDeLaReponse({ start: '2026-10-01T00:00:00+00:00', key: 'last_month' })).toBe('2026-11');
    expect(moisEnCoursDeLaReponse({ start: '2026-12-01T00:00:00+00:00', key: 'last_month' })).toBe('2027-01');
    expect(moisEnCoursDeLaReponse({ start: '2026-11-01' })).toBe('2026-11');
  });

  it('les états du jour ne se marquent que sous `last_month`', () => {
    expect(etatsDuJourAMarquer({ key: 'current_month', as_of_today: ['leases.active'] })).toBeNull();
    expect(etatsDuJourAMarquer({ key: 'last_month', as_of_today: ['leases.active'] })).toEqual(['leases.active']);
    expect(etatsDuJourAMarquer(undefined)).toBeNull();
  });
});

describe('TCK-2791 — l’admin sous « Mois dernier »', () => {
  it('Encaissé d’octobre comparé à septembre (+10 %), jamais novembre en cours', () => {
    const [encaisse] = chiffresDeLAgence({ ...AGENCE, kpis: [] }, SERIE, { moisEnCours: '2026-11', moisServi: '2026-10', etatsDuJour: ETATS_AGENCE });
    expect([encaisse.contexte, encaisse.ton, encaisse.aujourdhui]).toEqual([{ cle: 'variation', pourcent: 10, mois: '2026-09' }, 'succes', undefined]);
  });

  it('sous le mois en cours, la tuile ne compare toujours pas (le mois servi n’est pas clos)', () => {
    const [encaisse] = chiffresDeLAgence({ ...AGENCE, kpis: [] }, SERIE, { moisEnCours: '2026-11', moisServi: '2026-11' });
    expect(encaisse.contexte).toBeUndefined();
  });

  it('les cinq états du jour se marquent « aujourd’hui », Encaissé non ; sous le mois en cours, aucun', () => {
    const passe = chiffresDeLAgence({ ...AGENCE, kpis: [] }, SERIE, { moisEnCours: '2026-11', moisServi: '2026-10', etatsDuJour: ETATS_AGENCE });
    expect(passe.filter((c) => c.aujourdhui).map((c) => c.cle)).toEqual(['impayes', 'occupation', 'bauxActifs', 'biensPublies', 'tauxImpayes']);
    const courant = chiffresDeLAgence({ ...AGENCE, kpis: [] }, SERIE, { moisEnCours: '2026-11', moisServi: '2026-11', etatsDuJour: null });
    expect(courant.some((c) => c.aujourdhui)).toBe(false);
  });

  it('les chiffres choisis par l’agence : la marque suit `as_of_today` de l’API, sous « Mois dernier » seulement', () => {
    const passe = chiffresDeLAgence(AGENCE, SERIE, { moisServi: '2026-10', etatsDuJour: ETATS_AGENCE });
    expect(passe.map((c) => [c.cle, c.aujourdhui])).toEqual([
      ['kpi:revenue_month', undefined],
      ['kpi:leases_active', true],
    ]);
    expect(chiffresDeLAgence(AGENCE, SERIE, { etatsDuJour: null }).some((c) => c.aujourdhui)).toBe(false);
  });
});

describe('TCK-2791 — l’agent et le bailleur sous « Mois dernier »', () => {
  const serieAgent = { months: ['2025-01', '2025-12', '2026-01'], signed_leases: [2, 3, 1] };

  it('Baux signés : le point de décembre (3), cumulé sur 2025 (janvier compris) ; commissions « en 2025 » ; visites et prospects du jour', () => {
    const c = chiffresDeLAgent(
      { finance: { commissions_month: 50_000, commissions_year: 900_000 }, visits: { upcoming_7d: 2 }, pipeline: { lead: 4 } },
      serieAgent,
      false,
      { moisServi: '2025-12', etatsDuJour: ['visits.upcoming_7d', 'pipeline'] },
    );
    const parCle = Object.fromEntries(c.map((x) => [x.cle, x]));
    expect(parCle.bauxSignes?.valeur).toBe(3);
    expect(parCle.bauxSignes?.contexte).toEqual({ cle: 'bauxDuMoisDernier', n: 5, annee: '2025' });
    expect(parCle.commissions?.contexte).toEqual({ cle: 'enAnnee', montant: 900_000, annee: '2025' });
    expect([parCle.commissions?.aujourdhui, parCle.visites?.aujourdhui, parCle.prospects?.aujourdhui]).toEqual([undefined, true, true]);
  });

  it('la série de 12 mois ne voit pas janvier de l’année servie (janvier, « Mois dernier ») : aucun cumul plutôt qu’un faux', () => {
    // Le 10 janvier 2026 : février 2025 … janvier 2026.
    const douze = [...Array.from({ length: 11 }, (_, i) => `2025-${String(i + 2).padStart(2, '0')}`), '2026-01'];
    const c = chiffresDeLAgent({}, { months: douze, signed_leases: douze.map(() => 1) }, false, { moisServi: '2025-12', etatsDuJour: [] });
    const baux = c.find((x) => x.cle === 'bauxSignes');
    expect([baux?.valeur, baux?.contexte]).toEqual([1, undefined]);
  });

  it('sous le mois en cours : le dernier point, « cette année », aucune marque (comportement d’avant)', () => {
    const c = chiffresDeLAgent({ finance: { commissions_month: 1, commissions_year: 900_000 } }, serieAgent, false);
    const parCle = Object.fromEntries(c.map((x) => [x.cle, x]));
    expect(parCle.bauxSignes?.valeur).toBe(1);
    expect(parCle.bauxSignes?.contexte).toEqual({ cle: 'bauxCetteAnnee', n: 1 });
    expect(parCle.commissions?.contexte).toEqual({ cle: 'cetteAnnee', montant: 900_000 });
    expect(c.some((x) => x.aujourdhui)).toBe(false);
  });

  it('le bailleur : plus de « sur … attendus » (l’attendu est celui d’aujourd’hui), le portefeuille et les impayés du jour', () => {
    const resume = {
      portfolio: { total: 10, rented: 4, available: 5 },
      leases: { active: 4 },
      finance: { cashflow_month: 400_000, expected_monthly: 500_000, overdue_count: 1, overdue_amount: 100_000 },
      occupancy: { rate_percent: 80, eligible_count: 5, occupied_count: 4 },
    };
    const etats = ['portfolio.total', 'occupancy.rate_percent', 'finance.expected_monthly', 'finance.overdue_amount', 'leases.active'];
    const passe = chiffresDuBailleur(resume, { etatsDuJour: etats });
    const encaisse = passe.find((c) => c.cle === 'encaisse');
    expect([encaisse?.contexte, encaisse?.aujourdhui]).toEqual([undefined, undefined]);
    expect(passe.filter((c) => c.aujourdhui).map((c) => c.cle)).toEqual(['portefeuille', 'occupation', 'impayes', 'bauxActifs']);
    expect(chiffresDuBailleur(resume).find((c) => c.cle === 'encaisse')?.contexte).toEqual({ cle: 'surAttendus', montant: 500_000 });
  });
});

describe('TCK-2791 — la marque « aujourd’hui » se dérive de `as_of_today`, jamais d’une liste recopiée', () => {
  const marques = (etats: readonly string[]) =>
    chiffresDeLAgence({ ...AGENCE, kpis: [] }, SERIE, { moisEnCours: '2026-11', moisServi: '2026-10', etatsDuJour: etats })
      .filter((c) => c.aujourdhui)
      .map((c) => c.cle);

  it.each([
    ['finance.overdue_amount', 'impayes'],
    ['occupancy.rate_percent', 'occupation'],
    ['leases.active', 'bauxActifs'],
    ['properties.published', 'biensPublies'],
    ['finance.unpaid_rate_percent', 'tauxImpayes'],
  ])('retirer `%s` de la liste de l’API n’efface que la marque de « %s »', (chemin, cle) => {
    const toutes = marques(ETATS_AGENCE);
    expect(marques(ETATS_AGENCE.filter((e) => e !== chemin))).toEqual(toutes.filter((c) => c !== cle));
  });

  it('une tuile choisie par l’agence suit son propre `as_of_today` : à faux, plus de marque', () => {
    const kpis = AGENCE.kpis?.map((k) => ({ ...k, as_of_today: false }));
    expect(chiffresDeLAgence({ ...AGENCE, kpis }, SERIE, { moisServi: '2026-10', etatsDuJour: ETATS_AGENCE }).some((c) => c.aujourdhui)).toBe(false);
  });
});
