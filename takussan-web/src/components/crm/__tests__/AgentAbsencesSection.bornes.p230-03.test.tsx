/**
 * P230.03 (TCK-2232) — « Jusqu'au » ne propose que ce que `StoreAgentAbsenceRequest` accepte.
 * L'écran envoie la fin de la journée choisie (`AAAA-MM-JJ 23:59:59`, lue en UTC par l'API) :
 * - `after:now` → au plus tôt le jour de l'API ;
 * - `before_or_equal:` l'INSTANT `now()->addDays(366)` → au plus tard J+365, puisque le soir de
 *   J+366 dépasse toujours cet instant.
 */
process.env.TZ = 'America/New_York';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AgentAbsencesSection } from '../AgentAbsencesSection';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, token: 'jeton', isLoading: false }),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchAbsences: () => Promise.resolve([]),
  fetchAgencyAgents: () => Promise.resolve([{ id: 7, name: 'Moussa Fall' }, { id: 8, name: 'Awa Diop' }]),
  declareAbsence: vi.fn(),
}));

describe('AgentAbsencesSection — bornes de « Jusqu’au » (P230.03)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 01:00 Z le 25 octobre : encore le 24 à New York, déjà le 25 pour l'API.
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('va du jour de l’API à J+365', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <AgentAbsencesSection agencyId={3} currentUserId={7} />
      </QueryClientProvider>,
    ));

    fireEvent.click(await screen.findByRole('button', { name: 'Déclarer une absence' }));

    const champ = screen.getByLabelText("Jusqu'au");
    expect(champ).toHaveAttribute('min', '2026-10-25');
    expect(champ).toHaveAttribute('max', '2027-10-25');
  });
});
