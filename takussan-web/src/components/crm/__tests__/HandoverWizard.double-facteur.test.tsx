/**
 * TCK-1203 — la passation (`AgentHandoverController@store`) et le retrait (`removeAgent`) exigent la
 * 2FA de l'agence : le refus passe par la garde, puis l'appel est rejoué ; une garde abandonnée
 * laisse l'erreur affichée.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
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
const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Preuve récente requise.' });

function rendu(garde: GardeDoubleFacteurFn) {
  const onDone = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <HandoverWizard agencyId={3} member={{ id: 7, first_name: 'Moussa', last_name: 'Fall' }} onClose={vi.fn()} onDone={onDone} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
  return onDone;
}

describe('HandoverWizard — second facteur', () => {
  beforeEach(() => {
    for (const m of [fetchMemberPortfolio, fetchAgencyAgents, handOverPortfolio, removeMember]) m.mockReset();
    fetchAgencyAgents.mockResolvedValue([{ id: 7, name: 'Moussa Fall' }, { id: 8, name: 'Awa Diop' }]);
  });

  it('la passation refusée passe par la garde, puis est rejouée', async () => {
    fetchMemberPortfolio.mockResolvedValue({ user_id: 7, portfolio: { ...VIDE, tasks: 3 }, transferable: ['tasks'], pending: [] });
    handOverPortfolio.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ moved: { tasks: 3 }, unassigned: {}, removed: true });
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const onDone = rendu(garde);

    await screen.findByText('Tâches ouvertes');
    await userEvent.selectOptions(await screen.findByLabelText('Repreneur'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Relire' }));
    await userEvent.click(screen.getByRole('button', { name: 'Transmettre et retirer' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(handOverPortfolio).toHaveBeenCalledTimes(2);
  });

  it('le retrait seul refusé passe par la garde, puis est rejoué', async () => {
    fetchMemberPortfolio.mockResolvedValue({ user_id: 7, portfolio: VIDE, transferable: [], pending: [] });
    removeMember.mockRejectedValueOnce(refus()).mockResolvedValueOnce(undefined);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const onDone = rendu(garde);

    await userEvent.click(await screen.findByRole('button', { name: "Retirer de l'agence" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(removeMember).toHaveBeenCalledTimes(2);
    expect(removeMember).toHaveBeenLastCalledWith('jeton', 3, 7, false);
  });

  it('garde abandonnée : pas de rejeu, l’échec s’affiche', async () => {
    fetchMemberPortfolio.mockResolvedValue({ user_id: 7, portfolio: VIDE, transferable: [], pending: [] });
    removeMember.mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    const onDone = rendu(garde);

    await userEvent.click(await screen.findByRole('button', { name: "Retirer de l'agence" }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Preuve récente requise.');
    expect(garde).toHaveBeenCalledTimes(1);
    expect(removeMember).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});
