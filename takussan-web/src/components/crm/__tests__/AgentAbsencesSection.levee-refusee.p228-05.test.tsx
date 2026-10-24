/**
 * P228.05 (TCK-2218) — mettre fin à une absence, refusé par l'API (403, step-up fermé, réseau), se
 * dit sous la liste par `useMessageErreurApi()` (ADR-0019). Avant, `revoke` n'avait qu'un
 * `onSuccess`, alors que la déclaration affichait déjà son erreur.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { AgentAbsencesSection } from '../AgentAbsencesSection';

const MESSAGE_API = 'Action non autorisée.';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, token: 'jeton', isLoading: false }),
}));
vi.mock('@/hooks/useCan', () => ({
  useCan: () => ({ can: false, isLoading: false }),
}));

const fetchAbsences = vi.fn();
const revokeAbsence = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchAbsences: (...a: unknown[]) => fetchAbsences(...a),
  fetchAgencyAgents: async () => [],
  revokeAbsence: (...a: unknown[]) => revokeAbsence(...a),
}));

describe('AgentAbsencesSection — la levée refusée se dit (P228.05)', () => {
  it('un refus de l’API affiche son message', async () => {
    fetchAbsences.mockResolvedValue([{
      id: 1, absent: { id: 7, name: 'Moussa Fall' }, substitute: { id: 8, name: 'Awa Diop' },
      starts_at: null, ends_at: '2026-10-30T23:59:59Z', status: 'active', reason: null,
    }]);
    revokeAbsence.mockRejectedValue(new ApiError(403, { message: MESSAGE_API }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <AgentAbsencesSection agencyId={3} currentUserId={7} />
      </QueryClientProvider>,
    ));

    await userEvent.click(await screen.findByRole('button', { name: 'Mettre fin' }));

    expect(revokeAbsence).toHaveBeenCalledWith('jeton', 3, 1);
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });
});
