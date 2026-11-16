/**
 * TCK-616 AC6 — après une passation qui touche des baux, l'assistant affiche le bilan avant de
 * fermer : combien de brouillons sont passés au repreneur, et un lien vers chaque bail resté au nom
 * du partant (`leases.to_review`). Sans bail touché, il se ferme comme avant.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { HandoverWizard } from '../HandoverWizard';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

const fetchMemberPortfolio = vi.fn();
const fetchAgencyAgents = vi.fn();
const handOverPortfolio = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchMemberPortfolio: (...a: unknown[]) => fetchMemberPortfolio(...a),
  fetchAgencyAgents: (...a: unknown[]) => fetchAgencyAgents(...a),
  handOverPortfolio: (...a: unknown[]) => handOverPortfolio(...a),
}));

const TOUT = ['tasks', 'visits', 'maintenance', 'responsible_properties', 'held_properties', 'collaborations', 'customers', 'contact_leads'];
const PORTEFEUILLE = {
  tasks: 0, visits: 0, maintenance: 0, responsible_properties: 0, held_properties: 1, collaborations: 0, customers: 0,
  contact_leads: 0,
};

async function transmettre(leases: { moved: number; to_review: number[] }) {
  handOverPortfolio.mockResolvedValue({ moved: { held_properties: 1 }, unassigned: {}, removed: true, leases });
  const onDone = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <HandoverWizard agencyId={3} member={{ id: 7, first_name: 'Moussa', last_name: 'Fall' }} onClose={vi.fn()} onDone={onDone} />
    </QueryClientProvider>,
  ));

  await userEvent.click(await screen.findByRole('combobox', { name: 'Repreneur' }));
  await userEvent.click(await screen.findByRole('option', { name: 'Awa Diop' }));
  await userEvent.click(screen.getByRole('button', { name: 'Relire' }));
  await userEvent.click(screen.getByRole('button', { name: 'Transmettre et retirer' }));
  await waitFor(() => expect(handOverPortfolio).toHaveBeenCalled());

  return onDone;
}

describe('HandoverWizard — les baux au bilan (TCK-616)', () => {
  beforeEach(() => {
    for (const m of [fetchMemberPortfolio, fetchAgencyAgents, handOverPortfolio]) m.mockReset();
    fetchAgencyAgents.mockResolvedValue([{ id: 7, name: 'Moussa Fall' }, { id: 8, name: 'Awa Diop' }]);
    fetchMemberPortfolio.mockResolvedValue({ user_id: 7, portfolio: PORTEFEUILLE, transferable: TOUT, pending: [] });
  });

  it('compte les brouillons transmis et lie chaque bail à revoir, puis ferme sur demande', async () => {
    const onDone = await transmettre({ moved: 2, to_review: [41, 42] });

    const bilan = await screen.findByTestId('handover-leases');
    expect(bilan).toHaveTextContent('2 baux en brouillon sont passés à Awa Diop.');
    expect(bilan).toHaveTextContent('Ces 2 baux, déjà engagés, restent au nom de Moussa Fall');
    expect(screen.getByRole('link', { name: 'Bail n° 41' })).toHaveAttribute('href', '/app/leases/41');
    expect(screen.getByRole('link', { name: 'Bail n° 42' })).toHaveAttribute('href', '/app/leases/42');
    expect(onDone).not.toHaveBeenCalled();

    // La croix du dialogue porte aussi « Fermer » : le bouton du bilan se vise par son repère.
    expect(screen.getByTestId('handover-leases-close')).toHaveTextContent('Fermer');
    await userEvent.click(screen.getByTestId('handover-leases-close'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('un seul bail à revoir, aucun brouillon : seule la liste paraît', async () => {
    await transmettre({ moved: 0, to_review: [9] });

    const bilan = await screen.findByTestId('handover-leases');
    expect(bilan).not.toHaveTextContent('brouillon');
    expect(bilan).toHaveTextContent('Ce bail, déjà engagé, reste au nom de Moussa Fall');
    expect(screen.getByRole('link', { name: 'Bail n° 9' })).toHaveAttribute('href', '/app/leases/9');
  });

  it('sans bail touché, la fenêtre se ferme comme avant', async () => {
    const onDone = await transmettre({ moved: 0, to_review: [] });

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('handover-leases')).toBeNull();
  });
});
