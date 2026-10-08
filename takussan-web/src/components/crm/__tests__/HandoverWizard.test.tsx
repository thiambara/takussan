/**
 * TCK-591 §8 — « Retirer de l'agence » passe par la passation : le portefeuille se lit, un
 * repreneur se choisit, la relecture précède l'envoi ; sans repreneur, le retrait exige l'aveu
 * `leave_unassigned` ; un portefeuille vide se retire sans détour.
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
const removeMember = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchMemberPortfolio: (...a: unknown[]) => fetchMemberPortfolio(...a),
  fetchAgencyAgents: (...a: unknown[]) => fetchAgencyAgents(...a),
  handOverPortfolio: (...a: unknown[]) => handOverPortfolio(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
}));

const VIDE = {
  tasks: 0, visits: 0, maintenance: 0, responsible_properties: 0, held_properties: 0, collaborations: 0, customers: 0,
};
const TOUT = ['tasks', 'visits', 'maintenance', 'responsible_properties', 'held_properties', 'collaborations', 'customers'];
const partant = { id: 7, first_name: 'Moussa', last_name: 'Fall' };

function rendu() {
  const onDone = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <HandoverWizard agencyId={3} member={partant} onClose={vi.fn()} onDone={onDone} />
    </QueryClientProvider>,
  ));
  return onDone;
}

describe('HandoverWizard', () => {
  beforeEach(() => {
    for (const m of [fetchMemberPortfolio, fetchAgencyAgents, handOverPortfolio, removeMember]) m.mockReset();
    fetchAgencyAgents.mockResolvedValue([{ id: 7, name: 'Moussa Fall' }, { id: 8, name: 'Awa Diop' }]);
  });

  it('transmet au repreneur choisi, après relecture, puis retire', async () => {
    fetchMemberPortfolio.mockResolvedValue({
      user_id: 7,
      portfolio: { ...VIDE, tasks: 3, customers: 2 },
      transferable: TOUT,
      pending: [],
    });
    handOverPortfolio.mockResolvedValue({ moved: { tasks: 3, customers: 2 }, unassigned: {}, removed: true });
    const onDone = rendu();

    expect(await screen.findByText('Tâches ouvertes')).toBeInTheDocument();
    // Le partant ne se reprend pas lui-même.
    expect(screen.queryByRole('option', { name: 'Moussa Fall' })).toBeNull();
    await userEvent.selectOptions(await screen.findByLabelText('Repreneur'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Relire' }));

    expect(screen.getByTestId('handover-review')).toHaveTextContent('Awa Diop reprendra ce que Moussa Fall porte');
    expect(handOverPortfolio).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Transmettre et retirer' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(handOverPortfolio).toHaveBeenCalledWith('jeton', 3, 7, {
      successor_id: 8,
      remove_after: true,
      leave_unassigned: false,
    });
    expect(removeMember).not.toHaveBeenCalled();
  });

  it('sans repreneur, le retrait attend l’aveu « sans responsable »', async () => {
    fetchMemberPortfolio.mockResolvedValue({
      user_id: 7, portfolio: { ...VIDE, visits: 1 }, transferable: ['visits'], pending: [],
    });
    removeMember.mockResolvedValue(undefined);
    rendu();

    expect(await screen.findByText('Visites à venir')).toBeInTheDocument();
    const retirer = await screen.findByRole('button', { name: "Retirer de l'agence" });
    expect(retirer).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(retirer);

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('jeton', 3, 7, true));
  });

  /** TCK-603 AC5 — les biens se transmettent comme le reste : ni « pas encore transmissible », ni aveu. */
  it('les biens du partant se transmettent sans aveu', async () => {
    fetchMemberPortfolio.mockResolvedValue({
      user_id: 7,
      portfolio: { ...VIDE, responsible_properties: 2, held_properties: 1 },
      transferable: TOUT,
      pending: [],
    });
    handOverPortfolio.mockResolvedValue({
      moved: { responsible_properties: 2, held_properties: 1 }, unassigned: {}, removed: true,
    });
    const onDone = rendu();

    const portefeuille = await screen.findByTestId('handover-portfolio');
    expect(portefeuille).toHaveTextContent('Biens dont il est l’agent responsable2');
    expect(portefeuille).toHaveTextContent('Biens saisis à son nom1');
    expect(portefeuille).not.toHaveTextContent('pas encore transmissible');
    await userEvent.selectOptions(await screen.findByLabelText('Repreneur'), '8');
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Relire' }));

    const relecture = screen.getByTestId('handover-review');
    expect(relecture).toHaveTextContent('2 × Biens dont il est l’agent responsable');
    expect(relecture).toHaveTextContent('1 × Biens saisis à son nom');
    await userEvent.click(screen.getByRole('button', { name: 'Transmettre et retirer' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(handOverPortfolio).toHaveBeenCalledWith('jeton', 3, 7, {
      successor_id: 8, remove_after: true, leave_unassigned: false,
    });
  });

  it('un portefeuille vide se retire sans passation ni aveu', async () => {
    fetchMemberPortfolio.mockResolvedValue({ user_id: 7, portfolio: VIDE, transferable: [], pending: [] });
    removeMember.mockResolvedValue(undefined);
    rendu();

    expect(await screen.findByText(/Son portefeuille est vide/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Retirer de l'agence" }));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('jeton', 3, 7, false));
  });
});
