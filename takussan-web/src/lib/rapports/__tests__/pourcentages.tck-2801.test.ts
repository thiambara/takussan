import { describe, expect, it } from 'vitest';

import { formatteursPour } from '@/lib/format/useFormatteurs';

import { chiffresDeLAgence, type ResumeDAgence } from '../chiffres';
import { bornesLisibles, moisCourant } from '../periode';
import { pourcentMesure, pourcentSaisi } from '../pourcentages';

const fr = formatteursPour('fr');
const espaces = (s: string) => s.replace(/[  ]/g, ' ');

describe('TCK-2801 — une règle pour les pourcentages de « Rapports »', () => {
  it('une valeur MESURÉE : une décimale au plus (3,91 → « 3,9 % », 46,94 → « 46,9 % », 47 → « 47 % »)', () => {
    expect(espaces(pourcentMesure(fr, 3.91))).toBe('3,9 %');
    expect(espaces(pourcentMesure(fr, 46.94))).toBe('46,9 %');
    expect(espaces(pourcentMesure(fr, 47))).toBe('47 %');
  });

  it('un seuil SAISI s’écrit tel qu’on l’a saisi, deux décimales au plus', () => {
    expect(espaces(pourcentSaisi(fr, 7.25))).toBe('7,25 %');
    expect(espaces(pourcentSaisi(fr, 10))).toBe('10 %');
  });
});

describe('TCK-2801 — face à un seuil, assez de décimales pour lire qu’il est atteint (consigne de team-lead)', () => {
  it('3,95 mesuré pour un seuil de 3,95 : « 3,95 % », jamais « 4 % » (qui le dirait franchi)', () => {
    expect(espaces(pourcentMesure(fr, 3.95, 3.95))).toBe('3,95 %');
  });

  it('10,04 pour un seuil de 10 : « 10,04 % » (« 10 % » le dirait égal) ; 9,96 : « 9,96 % »', () => {
    expect(espaces(pourcentMesure(fr, 10.04, 10))).toBe('10,04 %');
    expect(espaces(pourcentMesure(fr, 9.96, 10))).toBe('9,96 %');
  });

  it('quand une décimale dit déjà le bon côté du seuil, une seule : 3,91 pour 10 → « 3,9 % » ; 10 pour 10 → « 10 % »', () => {
    expect(espaces(pourcentMesure(fr, 3.91, 10))).toBe('3,9 %');
    expect(espaces(pourcentMesure(fr, 3.96, 3.95))).toBe('4 %');
    expect(espaces(pourcentMesure(fr, 10, 10))).toBe('10 %');
  });
});

describe('TCK-2801 — la période en mois longs', () => {
  it('un même mois : « 1 » puis « 30 novembre 2026 »', () => {
    const b = bornesLisibles('2026-11-01T00:00:00+00:00', '2026-11-30T23:59:59+00:00', 'fr');
    expect(espaces(`Du ${b.debut} au ${b.fin}`)).toBe('Du 1 au 30 novembre 2026');
  });

  it('deux mois : chaque borne entière', () => {
    const b = bornesLisibles('2026-10-15', '2026-11-14', 'fr');
    expect(espaces(`${b.debut} | ${b.fin}`)).toBe('15 octobre 2026 | 14 novembre 2026');
  });

  it('le mois en cours au fuseau de Dakar (UTC) : premier et dernier jour', () => {
    expect(moisCourant(new Date('2026-11-14T10:00:00Z'))).toEqual({ debut: '2026-11-01', fin: '2026-11-30' });
    expect(moisCourant(new Date('2028-02-29T23:59:00Z'))).toEqual({ debut: '2028-02-01', fin: '2028-02-29' });
  });
});

describe('TCK-2801 — AC4 : le seuil d’alerte suit « Taux d’impayés », configuré ou non', () => {
  const AGENCE: ResumeDAgence = {
    properties: { total: 214, published: 67 },
    leases: { active: 90 },
    finance: { revenue_month: 0, overdue_count: 16, overdue_amount: 33_715_000, unpaid_rate_percent: 3.91 },
    occupancy: { rate_percent: 46.94, eligible_count: 147, occupied_count: 69 },
  };
  const seuils = { unpaid_rate_percent: 10, occupancy_rate_percent: 20 };

  it('l’agence qui a choisi ses chiffres (`kpi-configs`) garde le sous-texte sous son « Taux d’impayés » — relevé du 2026-11-14 : il manquait', () => {
    const c = chiffresDeLAgence(
      {
        ...AGENCE,
        kpis: [
          { metric: 'unpaid_rate_percent', label: 'Taux d’impayés', format: 'percent', value: 3.91 },
          { metric: 'occupancy_rate_percent', label: 'Taux d’occupation', format: 'percent', value: 46.94 },
        ],
      },
      undefined,
      { seuils },
    );
    expect(c[0].contexte).toEqual({ cle: 'seuil', valeur: 10 });
    // Le sous-texte est celui de la maquette, sous le seul taux d'impayés : aucun autre chiffre n'en porte.
    expect(c[1].contexte).toBeUndefined();
  });

  it('sans alerte, aucun sous-texte', () => {
    const c = chiffresDeLAgence({ ...AGENCE, kpis: [{ metric: 'unpaid_rate_percent', label: 'Taux d’impayés', format: 'percent', value: 3.91 }] });
    expect(c[0].contexte).toBeUndefined();
  });
});
