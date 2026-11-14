import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { chiffresDeLAgence, seuilsDesAlertes } from '@/lib/rapports/chiffres';
import { withIntl } from '@/test/intl';

import { TuilesDuRapport } from '../TuilesDuRapport';

/** Le résumé de la démo (GET /api/dashboard/agency, admin, 2026-11-14). */
const RESUME = {
  properties: { total: 214, published: 67 },
  leases: { active: 90 },
  finance: { revenue_month: 95_202_604, overdue_count: 16, overdue_amount: 33_715_000, unpaid_rate_percent: 3.91 },
  occupancy: { rate_percent: 46.94, eligible_count: 147, occupied_count: 69 },
};

const tuile = (cle: string) => screen.getAllByRole('link').find((a) => a.getAttribute('data-chiffre') === cle) as HTMLElement;
const espaces = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ');

describe('TCK-2801 — AC1 : un pourcentage mesuré à une décimale au plus', () => {
  it('3,91 → « 3,9 % » (la page écrivait « 4 % ») ; 46,94 → « 46,9 % »', () => {
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME)} colonnes={6} />));
    expect(espaces(tuile('tauxImpayes').textContent)).toBe('Taux d’impayés3,9 %');
    expect(espaces(tuile('occupation').textContent)).toMatch(/^Occupation46,9 %/);
  });
});

describe('TCK-2801 — AC4 : « seuil d’alerte » sous le taux d’impayés, quand une alerte active le porte', () => {
  const alerte = (o: Partial<{ metric: string; threshold: number | string; is_enabled: boolean; operator: '>' | '<' }>) => ({
    metric: 'unpaid_rate_percent',
    threshold: '10.00',
    is_enabled: true,
    operator: '>' as const,
    ...o,
  });

  it('une alerte active sur `unpaid_rate_percent` → « seuil d’alerte : 10 % »', () => {
    const seuils = seuilsDesAlertes([alerte({ metric: 'overdue_count', threshold: 3 }), alerte({})]);
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, undefined, { seuils })} colonnes={6} />));
    expect(espaces(tuile('tauxImpayes').textContent)).toBe('Taux d’impayés3,9 %seuil d’alerte : 10 %');
  });

  it('inactive, sur une autre métrique, ou sans lecture : aucun sous-texte', () => {
    expect(seuilsDesAlertes([alerte({ is_enabled: false }), alerte({ metric: 'occupancy_rate_percent' })])).toEqual({ occupancy_rate_percent: 10 });
    for (const seuils of [seuilsDesAlertes([alerte({ is_enabled: false })]), undefined]) {
      const { unmount } = render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, undefined, { seuils })} colonnes={6} />));
      expect(espaces(tuile('tauxImpayes').textContent)).toBe('Taux d’impayés3,9 %');
      unmount();
    }
  });

  it('l’agence qui a choisi ses chiffres : la tuile `kpi:unpaid_rate_percent` porte le seuil (relevé rempli du 2026-11-14 : il manquait)', () => {
    const seuils = seuilsDesAlertes([alerte({}), alerte({ metric: 'occupancy_rate_percent', operator: '<', threshold: 20 })]);
    const kpis = [
      { metric: 'unpaid_rate_percent', label: 'Taux d’impayés', format: 'percent' as const, value: 3.91 },
      { metric: 'occupancy_rate_percent', label: 'Taux d’occupation', format: 'percent' as const, value: 46.94 },
    ];
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence({ ...RESUME, kpis }, undefined, { seuils })} colonnes={6} />));
    const configurees = screen.getAllByRole('link').filter((a) => a.getAttribute('data-chiffre')?.startsWith('kpi:'));
    expect(configurees.map((a) => espaces(a.textContent))).toEqual(['Taux d’impayés3,9 %seuil d’alerte : 10 %', 'Taux d’occupation46,9 %']);
  });

  it('un seuil saisi garde ses décimales (7,25)', () => {
    const seuils = seuilsDesAlertes([alerte({ threshold: '7.25' })]);
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, undefined, { seuils })} colonnes={6} />));
    expect(espaces(tuile('tauxImpayes').textContent)).toMatch(/seuil d’alerte : 7,25 %$/);
  });
});
