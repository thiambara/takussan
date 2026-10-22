/**
 * TCK-1203 — déclarer ou lever une absence exige la 2FA de l'agence (`AgentAbsenceController`,
 * `ProtectedActions::AGENCY_TWO_FACTOR`) : le refus passe par la garde, puis l'appel est rejoué.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { AgentAbsencesSection } from '../AgentAbsencesSection';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, token: 'jeton', isLoading: false }),
}));
vi.mock('@/hooks/useCan', () => ({
  useCan: () => ({ can: false, isLoading: false }),
}));

const fetchAbsences = vi.fn();
const fetchAgencyAgents = vi.fn();
const declareAbsence = vi.fn();
const revokeAbsence = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchAbsences: (...a: unknown[]) => fetchAbsences(...a),
  fetchAgencyAgents: (...a: unknown[]) => fetchAgencyAgents(...a),
  declareAbsence: (...a: unknown[]) => declareAbsence(...a),
  revokeAbsence: (...a: unknown[]) => revokeAbsence(...a),
}));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });
const ABSENCE = {
  id: 1, absent: { id: 7, name: 'Moussa Fall' }, substitute: { id: 8, name: 'Awa Diop' },
  starts_at: null, ends_at: '2026-10-20T23:59:59Z', status: 'active', reason: null,
};

function rendu(garde: GardeDoubleFacteurFn) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <AgentAbsencesSection agencyId={3} currentUserId={7} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

async function declarer() {
  await userEvent.click(await screen.findByRole('button', { name: 'Déclarer une absence' }));
  await screen.findByRole('option', { name: 'Awa Diop' });
  await userEvent.selectOptions(screen.getByLabelText('Remplacé par'), '8');
  await userEvent.type(screen.getByLabelText("Jusqu'au"), '2026-10-20');
  await userEvent.click(screen.getByRole('button', { name: 'Déclarer' }));
}

describe('AgentAbsencesSection — second facteur', () => {
  beforeEach(() => {
    for (const m of [fetchAbsences, fetchAgencyAgents, declareAbsence, revokeAbsence]) m.mockReset();
    fetchAgencyAgents.mockResolvedValue([{ id: 7, name: 'Moussa Fall' }, { id: 8, name: 'Awa Diop' }]);
  });

  it('la déclaration refusée passe par la garde, puis est rejouée', async () => {
    fetchAbsences.mockResolvedValue([]);
    declareAbsence.mockRejectedValueOnce(refus()).mockResolvedValueOnce({});
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    rendu(garde);

    await declarer();

    await waitFor(() => expect(declareAbsence).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    // Le formulaire se referme : la déclaration a abouti.
    await waitFor(() => expect(screen.queryByLabelText('Remplacé par')).toBeNull());
  });

  it('la levée refusée passe par la garde, puis est rejouée', async () => {
    fetchAbsences.mockResolvedValue([ABSENCE]);
    revokeAbsence.mockRejectedValueOnce(refus()).mockResolvedValueOnce(undefined);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    rendu(garde);

    await userEvent.click(await screen.findByRole('button', { name: 'Mettre fin' }));

    await waitFor(() => expect(revokeAbsence).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(revokeAbsence).toHaveBeenLastCalledWith('jeton', 3, 1);
  });

  it('garde abandonnée : la déclaration n’est pas rejouée, l’échec s’affiche', async () => {
    fetchAbsences.mockResolvedValue([]);
    declareAbsence.mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    rendu(garde);

    await declarer();

    expect(await screen.findByRole('alert')).toHaveTextContent('Second facteur requis.');
    expect(garde).toHaveBeenCalledTimes(1);
    expect(declareAbsence).toHaveBeenCalledTimes(1);
  });
});
