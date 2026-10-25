/**
 * P235.02 (TCK-2369) — un nom vide (`''`) ne laisse pas de trou dans « {absent} est remplacé par
 * {substitute} » : `??` ne remplaçait que `null`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AgentAbsencesSection } from '../AgentAbsencesSection';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, token: 'jeton', isLoading: false }),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchAbsences: () => Promise.resolve([{
    id: 1,
    absent: { id: 8, name: '' },
    substitute: { id: 9, name: '' },
    starts_at: '2026-10-20T00:00:00+00:00',
    ends_at: '2026-10-30T23:59:59+00:00',
    status: 'active',
    reason: null,
  }]),
  fetchAgencyAgents: () => Promise.resolve([]),
}));

describe('AgentAbsencesSection — noms vides (P235.02)', () => {
  it('rend « — » pour un absent et un remplaçant sans nom', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <AgentAbsencesSection agencyId={3} currentUserId={7} />
      </QueryClientProvider>,
    ));

    expect(await screen.findByText(/^— est remplacé par — jusqu'au/)).toBeInTheDocument();
  });
});
