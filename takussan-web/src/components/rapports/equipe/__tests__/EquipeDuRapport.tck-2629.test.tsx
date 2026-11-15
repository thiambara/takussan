/**
 * TCK-2629 — l'onglet « Équipe » : le tableau des agents (bureau) et une carte par agent (téléphone), sur
 * `team-performance` (demandes traitées comprises) et le délai de réponse par agent quand il est lu.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTeamPerformance } from '@/lib/queries/agency-reporting';
import { useDelaisDeReponse } from '@/lib/queries/contact-leads';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/agency-reporting', () => ({ useTeamPerformance: vi.fn() }));
vi.mock('@/lib/queries/contact-leads', () => ({ useDelaisDeReponse: vi.fn() }));

const { EquipeDuRapport } = await import('../EquipeDuRapport');

const C = fr.rapports.equipe.colonnes;
const base = { sales_signed: 0, customers_added: 0, tasks_overdue: 0 };
const AGENTS = [
  { ...base, user_id: 1, name: 'Oumy Samb', properties_managed: 31, leads_handled: 14, visits_completed: 12, leases_signed: 3, commissions_earned: 450_000 },
  { ...base, user_id: 2, name: 'Adja Khady Tall', properties_managed: 12, leads_handled: 4, visits_completed: 3, leases_signed: 0, commissions_earned: 0 },
];

function delais(etat: 'ok' | 'refus') {
  vi.mocked(useDelaisDeReponse).mockReturnValue(
    (etat === 'ok'
      ? {
          isSuccess: true,
          data: {
            data: {
              period_days: 30,
              agency: { median_first_response_seconds: 9000, responded_count: 30, open_over_24h_count: 1 },
              agents: [
                { user: { id: 1, first_name: 'Oumy', last_name: 'Samb' }, median_first_response_seconds: 4200, responded_count: 14, open_over_24h_count: 0 },
                { user: { id: 2, first_name: 'Adja', last_name: 'Tall' }, median_first_response_seconds: 93_600, responded_count: 4, open_over_24h_count: 1 },
              ],
            },
          },
        }
      : { isSuccess: false, isError: true, data: undefined }) as never,
  );
}

beforeEach(() => {
  vi.mocked(useTeamPerformance).mockReturnValue({ isPending: false, isError: false, data: { data: { period: '2026-11', agents: AGENTS } } } as never);
  delais('ok');
});

describe('TCK-2629 — l’onglet « Équipe »', () => {
  it('le tableau a les colonnes de la maquette, demandes traitées et délai de réponse compris', () => {
    render(withIntl(<EquipeDuRapport agencyId={4} />));
    const table = screen.getByRole('table');
    const entetes = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    for (const c of [C.name, C.properties_managed, C.leads_handled, C.visits_completed, C.leases_signed, C.commissions_earned, C.delai]) {
      expect(entetes.some((e) => e?.includes(c))).toBe(true);
    }
    const oumy = within(table).getByText('Oumy Samb').closest('tr') as HTMLElement;
    expect(oumy).toHaveTextContent('14');
    expect(oumy).toHaveTextContent('1 h 10');
    const adja = within(table).getByText('Adja Khady Tall').closest('tr') as HTMLElement;
    expect(within(adja).getByText('26 h')).toHaveClass('text-destructive');
    expect(screen.getByText(/médiane de 2 h 30 sur 30 jours/)).toBeInTheDocument();
  });

  it('trié par colonne : « Demandes traitées » décroissant, puis croissant', () => {
    render(withIntl(<EquipeDuRapport agencyId={4} />));
    const table = screen.getByRole('table');
    const premier = () => within(table).getAllByRole('row').slice(1)[0];
    fireEvent.click(within(table).getByRole('button', { name: `Trier par ${C.leads_handled}` }));
    expect(premier()).toHaveTextContent('Oumy Samb');
    fireEvent.click(within(table).getByRole('button', { name: `Trier par ${C.leads_handled}` }));
    expect(premier()).toHaveTextContent('Adja Khady Tall');
  });

  it('un délai illisible (refus, panne) retire la colonne, sans casser le tableau', () => {
    delais('refus');
    render(withIntl(<EquipeDuRapport agencyId={4} />));
    const table = screen.getByRole('table');
    expect(within(table).queryByText(C.delai)).not.toBeInTheDocument();
    expect(within(table).getByText('Oumy Samb')).toBeInTheDocument();
    expect(screen.queryByText(/médiane/)).not.toBeInTheDocument();
  });

  it('au téléphone, une carte par agent : trois chiffres et « Voir », vers sa fiche dans l’équipe', () => {
    render(withIntl(<EquipeDuRapport agencyId={4} />));
    const cartes = document.querySelector('[data-slot="cartes-equipe"]') as HTMLElement;
    const oumy = within(cartes).getByText('Oumy Samb').closest('li') as HTMLElement;
    expect(oumy).toHaveTextContent(/3 baux · 12 visites · 450\s000\sF/u);
    expect(within(oumy).getByRole('link', { name: 'Voir Oumy Samb dans l’équipe' })).toHaveAttribute('href', '/app/agency/team?membre=1');
  });

  it('lit la performance du mois de l’agence', () => {
    render(withIntl(<EquipeDuRapport agencyId={4} />));
    expect(vi.mocked(useTeamPerformance)).toHaveBeenCalledWith(4, new Date().toISOString().slice(0, 7));
  });
});
