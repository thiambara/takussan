import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { lireLeCarnet } from '@/lib/owners/carnet';
import type { OwnerProfileSummary } from '@/lib/queries/owners';
import { withIntl } from '@/test/intl';
import { OwnersList, type OwnersListProps } from '../OwnersList';

/**
 * TCK-2910 — « Filtres et tri » du carnet au téléphone (maquette `app-bailleurs` a, e0) : le bouton rond
 * à droite de la recherche ouvre une feuille avec le tri (nom, reste à verser, dernier versement) et les
 * trois vues. Le tri choisi s'écrit dans l'URL et part à l'API (`sort`), jamais trié côté client.
 */
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/owners',
}));
const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const sene = {
  id: 1, user_id: 9, agency_id: 7, status: 'active', created_at: null,
  metadata: { owner_type: 'individual', first_name: 'Mouhamed', last_name: 'Sène' },
  user: { id: 9, first_name: 'Mouhamed', last_name: 'Sène', email: 'm@example.test' },
  properties_count: 7, occupied_properties_count: 6, remaining_to_pay: 3117369, collected_this_month: 0, last_payout_at: null,
};
const donnees = {
  data: [sene] as unknown as OwnerProfileSummary[],
  meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as never;

function monter(props: Partial<OwnersListProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <OwnersList agencyId={7} canInvite initialData={donnees} lienVersLaFiche lectureArgent {...props} />
    </QueryClientProvider>,
  ));
}

const sortEnvoye = () => {
  const appel = apiRequest.mock.calls.map(([c]) => String(c)).find((c) => c.startsWith('/api/owners'));
  return appel ? new URL(appel, 'http://api.test').searchParams.get('sort') : null;
};

beforeEach(() => {
  replace.mockReset();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => donnees);
});

describe('TCK-2910 — « Filtres et tri » du carnet', () => {
  it('le bouton ouvre le tri et les vues ; « Dernier versement » s’écrit dans l’URL', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Filtres et tri' }));
    const feuille = within(await screen.findByRole('dialog'));
    expect(feuille.getByRole('group', { name: 'Trier par' })).toBeInTheDocument();
    expect(feuille.getByRole('button', { name: 'Reste à verser' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(feuille.getByRole('group', { name: 'Afficher' })).getByRole('button', { name: /Invitations/ })).toBeInTheDocument();
    await user.click(feuille.getByRole('button', { name: 'Dernier versement' }));
    expect(replace).toHaveBeenLastCalledWith('?tri=versement', { scroll: false });
    await user.click(feuille.getByRole('button', { name: 'Nom' }));
    expect(replace).toHaveBeenLastCalledWith('?tri=nom', { scroll: false });
  });

  it('le tri de l’URL part à l’API (`sort=-last_payout_at`) et se nomme au-dessus des cartes', async () => {
    monter({ etat: lireLeCarnet({ tri: 'versement' }) });
    await waitFor(() => expect(sortEnvoye()).toBe('-last_payout_at'));
    expect(screen.getByText('Tri : dernier versement')).toBeInTheDocument();
  });

  it('sans lecture de l’argent, seul le nom se propose et part', async () => {
    const user = userEvent.setup();
    monter({ lectureArgent: false, etat: lireLeCarnet({ tri: 'versement' }) });
    await waitFor(() => expect(sortEnvoye()).toBe('name'));
    await user.click(screen.getByRole('button', { name: 'Filtres et tri' }));
    const feuille = within(await screen.findByRole('dialog'));
    expect(feuille.getByRole('button', { name: 'Nom' })).toHaveAttribute('aria-pressed', 'true');
    expect(feuille.queryByRole('button', { name: 'Dernier versement' })).not.toBeInTheDocument();
    expect(feuille.queryByRole('button', { name: 'Reste à verser' })).not.toBeInTheDocument();
  });
});
