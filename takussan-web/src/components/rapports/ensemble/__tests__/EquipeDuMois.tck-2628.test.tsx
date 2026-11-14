import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTeamPerformance } from '@/lib/queries/agency-reporting';
import { withIntl } from '@/test/intl';

const invitations = vi.hoisted(() => ({ n: 0 }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: invitations.n }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('@/lib/queries/agency-reporting', () => ({ useTeamPerformance: vi.fn() }));

const { EquipeDuMois } = await import('../EquipeDuMois');

const AISSATOU = {
  user_id: 1,
  name: 'Aïssatou Ndiaye',
  leases_signed: 2,
  sales_signed: 0,
  visits_completed: 9,
  customers_added: 3,
  commissions_earned: 450_000,
  properties_managed: 31,
  tasks_overdue: 0,
};

beforeEach(() => {
  invitations.n = 0;
  vi.mocked(useTeamPerformance).mockReturnValue({ isPending: false, isError: false, data: { data: { period: '2026-11', agents: [AISSATOU] } } } as never);
});

describe('TCK-2628 — « Équipe ce mois » de la vue d’ensemble', () => {
  it('lit la performance du mois de la période, et mène à l’onglet Équipe', () => {
    render(withIntl(<EquipeDuMois agencyId={4} periode="2026-11" agencyIsStandard />));
    expect(vi.mocked(useTeamPerformance)).toHaveBeenCalledWith(4, '2026-11');
    expect(screen.getByRole('link', { name: 'Onglet Équipe' }).getAttribute('href')).toBe('/app/reports/team');
  });

  it('au téléphone une rangée par agent, au bureau le tableau ; les colonnes que l’API rend', () => {
    render(withIntl(<EquipeDuMois agencyId={4} periode="2026-11" agencyIsStandard />));
    const rangee = within(screen.getByRole('list')).getByRole('listitem');
    expect(rangee.textContent?.replace(/\s/g, ' ')).toBe('Aïssatou Ndiaye2 baux · 9 visites450 000 F');
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Agent',
      'Biens gérés',
      'Visites effectuées',
      'Baux signés',
      'Commissions acquises',
    ]);
  });

  it('« N invitations sans réponse » seulement quand il y en a', () => {
    const { rerender } = render(withIntl(<EquipeDuMois agencyId={4} periode="2026-11" agencyIsStandard />));
    expect(screen.queryByText(/invitations? sans réponse/)).toBeNull();
    invitations.n = 31;
    rerender(withIntl(<EquipeDuMois agencyId={4} periode="2026-11" agencyIsStandard />));
    expect(screen.getByText('31 invitations sans réponse.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir l’équipe' }).getAttribute('href')).toBe('/app/agency/team?vue=invitations');
  });

  it('une lecture en échec le dit, sans tableau vide', () => {
    vi.mocked(useTeamPerformance).mockReturnValue({ isPending: false, isError: true } as never);
    render(withIntl(<EquipeDuMois agencyId={4} periode="2026-11" agencyIsStandard />));
    expect(screen.getByText('Impossible de charger la performance de l’équipe.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
