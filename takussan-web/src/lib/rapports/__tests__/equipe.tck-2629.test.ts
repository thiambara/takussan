import { describe, expect, it } from 'vitest';

import type { TeamPerformanceRow } from '@/lib/queries/agency-reporting';

import { joindreLesDelais, morceauxDuDelai, trierLEquipe } from '../equipe';

const agent = (user_id: number, name: string, extra: Partial<TeamPerformanceRow> = {}): TeamPerformanceRow => ({
  user_id,
  name,
  leases_signed: 0,
  sales_signed: 0,
  visits_completed: 0,
  customers_added: 0,
  commissions_earned: 0,
  properties_managed: 0,
  tasks_overdue: 0,
  leads_handled: 0,
  ...extra,
});

/** TCK-2629 — l'onglet Équipe : délai joint par agent, tri, et le délai en mots. */
describe('TCK-2629 — l’équipe', () => {
  const delais = [
    { user: { id: 1 }, median_first_response_seconds: 4200 },
    { user: { id: 2 }, median_first_response_seconds: 93_600 },
  ];

  it('joint le délai de chaque agent par son identifiant ; sans mesure, null', () => {
    const l = joindreLesDelais([agent(1, 'Oumy'), agent(2, 'Adja'), agent(3, 'Ibrahima')], delais);
    expect(l.map((x) => x.delai)).toEqual([4200, 93_600, null]);
    expect(joindreLesDelais([agent(1, 'Oumy')], null)[0]!.delai).toBeNull();
  });

  it('le tri par délai met un agent sans mesure EN FIN, dans les deux sens', () => {
    const l = joindreLesDelais([agent(3, 'Ibrahima'), agent(2, 'Adja'), agent(1, 'Oumy')], delais);
    expect(trierLEquipe(l, 'delai').map((x) => x.user_id)).toEqual([1, 2, 3]);
    expect(trierLEquipe(l, '-delai').map((x) => x.user_id)).toEqual([2, 1, 3]);
  });

  it('le tri par demandes traitées', () => {
    const l = joindreLesDelais([agent(1, 'A', { leads_handled: 4 }), agent(2, 'B', { leads_handled: 14 })], null);
    expect(trierLEquipe(l, '-leads_handled').map((x) => x.user_id)).toEqual([2, 1]);
  });

  it('le délai en morceaux : « 45 min », « 1 h 10 », « 26 h »', () => {
    expect(morceauxDuDelai(45 * 60)).toEqual({ forme: 'minutes', h: 0, m: 45 });
    expect(morceauxDuDelai(70 * 60)).toEqual({ forme: 'heuresMinutes', h: 1, m: 10 });
    expect(morceauxDuDelai(26 * 3600)).toEqual({ forme: 'heures', h: 26, m: 0 });
  });
});
