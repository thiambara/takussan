/**
 * P228.05 (TCK-2218) — l'accusé de réception des documents, refusé par l'API, se dit sous la liste
 * par `useMessageErreurApi()` (ADR-0019). Avant, `mutation.mutate` n'avait aucun chemin d'erreur.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Api from '@/lib/api';
import { withIntl } from '@/test/intl';
import { TenantOnboardingChecklistWidget } from '../TenantOnboardingChecklistWidget';

const MESSAGE_API = 'Aucune liste d’accueil pour ce bail.';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'tk', isLoading: false }),
}));

const CHECKLIST_OUVERTE = {
  id: 1,
  lease_id: 42,
  user_id: 1,
  welcome_seen_at: null,
  inventory_completed_at: null,
  first_payment_at: null,
  documents_acknowledged_at: null,
  completed_at: null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

describe('<TenantOnboardingChecklistWidget> — l’accusé refusé se dit (P228.05)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('un refus de l’API affiche son message', async () => {
    vi.spyOn(Api, 'apiRequest').mockImplementation((async (chemin: string, options?: { method?: string }) => {
      if (options?.method === 'POST') throw new Api.ApiError(404, { message: MESSAGE_API });
      if (chemin.startsWith('/api/leases')) return { data: [{ id: 42, reference_number: 'LS-ABC' }] };
      return { data: CHECKLIST_OUVERTE };
    }) as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <TenantOnboardingChecklistWidget />
      </QueryClientProvider>,
    ));

    await userEvent.click(await screen.findByRole('button', { name: /Accuser réception de vos documents/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });
});
