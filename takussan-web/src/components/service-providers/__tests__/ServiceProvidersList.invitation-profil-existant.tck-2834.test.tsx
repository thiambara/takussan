import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { ServiceProvidersList } from '../ServiceProvidersList';

/**
 * TCK-2834 — l'invitation d'un prestataire déjà inscrit dans une autre agence : l'API la rend en ligne
 * construite depuis l'invitation (`id` nul, `pending_invitation_only`). Le carnet l'affiche en
 * invitation — « Invitation envoyée », « Invité le », Renvoyer, Révoquer —, la compte au sous-titre,
 * et ne dit pas « pas encore de compte » d'un prestataire qui en a un.
 */
const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

function donnees() {
  return {
    data: [
      {
        id: null, user_id: null, status: 'draft', created_at: '2026-11-12T10:00:00+00:00',
        specialties: null, service_areas: null, user: null,
        metadata: { first_name: 'Saisi', last_name: 'Parbee', email: 'compte@example.test', phone: '+221770002834', trades: ['plumbing'], intervention_zones: ['Ngor'] },
        pending_invitation_id: 51, pending_invitation_only: true, phone: '+221770002834',
        insured: false, average_rating: null, reviews_count: 0, completed_interventions_count: 0, response_delay_minutes: null,
      },
      {
        id: 9, user_id: 90, status: 'active', created_at: '2026-10-01T10:00:00+00:00',
        specialties: ['electrical'], service_areas: ['Plateau'],
        user: { id: 90, first_name: 'Awa', last_name: 'Ndiaye', email: 'awa@example.test' },
        metadata: null, pending_invitation_id: null, phone: '+221770000009',
        insured: true, average_rating: 4.5, reviews_count: 2, completed_interventions_count: 3, response_delay_minutes: 30,
      },
    ],
    meta: { total: 2, current_page: 1, last_page: 1, per_page: 100, zones: ['Ngor', 'Plateau'] },
    links: { first: null, last: null, prev: null, next: null },
  } as never;
}

function monter() {
  apiRequestMock.mockImplementation(async (chemin: string) =>
    chemin.startsWith('/api/invitations/') ? { data: { id: 51 } } : donnees());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees()} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

const chemins = () => apiRequestMock.mock.calls.map(([chemin]) => String(chemin));

describe('<ServiceProvidersList> — invitation d’un prestataire déjà inscrit ailleurs (TCK-2834)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    toastAdd.mockReset();
  });

  it('la ligne paraît en invitation, sans note ni « Assuré », et le sous-titre la compte', async () => {
    monter();
    const table = await screen.findByRole('table');
    const ligne = within(table).getByText('Saisi Parbee').closest('tr') as HTMLElement;

    expect(within(ligne).getByText('Invitation envoyée')).toBeInTheDocument();
    expect(within(ligne).getByText(/^Invité le /)).toBeInTheDocument();
    expect(within(ligne).queryByText(/pas encore de compte/)).toBeNull();
    expect(within(ligne).queryByText('Assuré')).toBeNull();
    expect(within(ligne).getByText('Pas encore noté')).toBeInTheDocument();
    expect(within(ligne).getByRole('button', { name: "Renvoyer l'invitation" })).toBeInTheDocument();
    expect(within(ligne).getByRole('button', { name: 'Révoquer' })).toBeInTheDocument();

    expect(screen.getByText(/1 actif · 1 invitation en attente/)).toBeInTheDocument();
  });

  it.each([
    ['resend', "Renvoyer l'invitation"],
    ['revoke', 'Révoquer'],
  ] as const)('%s part par l’invitation de la ligne', async (geste, libelle) => {
    monter();
    const ligne = within(await screen.findByRole('table')).getByText('Saisi Parbee').closest('tr') as HTMLElement;

    await userEvent.click(within(ligne).getByRole('button', { name: libelle }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
    expect(chemins()).toContain(`/api/invitations/51/${geste}`);
  });
});
