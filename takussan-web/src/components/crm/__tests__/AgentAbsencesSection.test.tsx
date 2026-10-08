/**
 * TCK-591 §8 — « Déclarer une absence » : l'agent déclare la sienne (le select « Qui » n'est
 * proposé qu'avec `team.delegate_role`), la fin court jusqu'au soir de la date choisie, et une
 * absence en cours se lit « X est remplacé par Y ».
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AgentAbsencesSection } from '../AgentAbsencesSection';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, token: 'jeton', isLoading: false }),
}));
const can = { value: false };
vi.mock('@/hooks/useCan', () => ({
  useCan: () => ({ can: can.value, isLoading: false }),
}));

const fetchAbsences = vi.fn();
const fetchAgencyAgents = vi.fn();
const declareAbsence = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchAbsences: (...a: unknown[]) => fetchAbsences(...a),
  fetchAgencyAgents: (...a: unknown[]) => fetchAgencyAgents(...a),
  declareAbsence: (...a: unknown[]) => declareAbsence(...a),
}));

function rendu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <AgentAbsencesSection agencyId={3} currentUserId={7} />
    </QueryClientProvider>,
  ));
}

describe('AgentAbsencesSection', () => {
  beforeEach(() => {
    for (const m of [fetchAbsences, fetchAgencyAgents, declareAbsence]) m.mockReset();
    can.value = false;
    fetchAgencyAgents.mockResolvedValue([{ id: 7, name: 'Moussa Fall' }, { id: 8, name: 'Awa Diop' }]);
  });

  it('un agent déclare SA propre absence, jusqu’au soir de la date choisie', async () => {
    fetchAbsences.mockResolvedValue([]);
    declareAbsence.mockResolvedValue({});
    rendu();

    expect(await screen.findByText('Aucune absence en cours.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Déclarer une absence' }));
    expect(screen.queryByLabelText('Qui est absent')).toBeNull();

    const remplacant = screen.getByLabelText('Remplacé par');
    await screen.findByRole('option', { name: 'Awa Diop' });
    // On ne se remplace pas soi-même.
    expect(screen.queryByRole('option', { name: 'Moussa Fall' })).toBeNull();
    await userEvent.selectOptions(remplacant, '8');
    await userEvent.type(screen.getByLabelText("Jusqu'au"), '2026-10-20');
    await userEvent.click(screen.getByRole('button', { name: 'Déclarer' }));

    await waitFor(() => expect(declareAbsence).toHaveBeenCalledWith('jeton', 3, {
      user_id: 7, substitute_id: 8, ends_at: '2026-10-20 23:59:59', reason: null,
    }));
  });

  it('avec team.delegate_role, on choisit qui est absent ; une absence en cours se lit', async () => {
    can.value = true;
    fetchAbsences.mockResolvedValue([{
      id: 1, absent: { id: 8, name: 'Awa Diop' }, substitute: { id: 7, name: 'Moussa Fall' },
      starts_at: null, ends_at: '2026-10-20T23:59:59Z', status: 'active', reason: null,
    }]);
    rendu();

    expect(await screen.findByText(/Awa Diop est remplacé par Moussa Fall/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Déclarer une absence' }));
    expect(screen.getByLabelText('Qui est absent')).toBeInTheDocument();
  });

  it('un 403 tait la zone (profil hors personnel)', async () => {
    const { ApiError } = await import('@/lib/api');
    fetchAbsences.mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    rendu();
    await waitFor(() => expect(fetchAbsences).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('agent-absences')).toBeNull());
  });
});
