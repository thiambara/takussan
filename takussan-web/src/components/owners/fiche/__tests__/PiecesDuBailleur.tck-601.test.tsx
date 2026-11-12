import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import type { OwnerProfileDetail } from '@/lib/queries/owners';
import { PiecesDuBailleur } from '../PiecesDuBailleur';

/**
 * TCK-601 (A), repris par TCK-2641 — les identifiants (RIB, NINEA, pièce) quittent le carnet pour
 * la fiche du bailleur. Ils y sont rendus MASQUÉS ; l'admin a un geste « Afficher » qui dit que la
 * consultation est enregistrée, l'agent ne l'a pas. Les valeurs révélées ne vont ni dans le cache
 * React Query ni dans `localStorage`.
 */
const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton', isLoading: false }),
}));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

const RIB_COMPLET = 'SN012 01234 0123456789012 34';

function owner(surcharges: Partial<OwnerProfileDetail> = {}): OwnerProfileDetail {
  return {
    id: 3, user_id: 9, agency_id: 7, status: 'active', joined_at: null, owner_type: 'individual', company_name: null,
    contact: { first_name: 'Fatou', last_name: 'Sarr', full_name: 'Fatou Sarr', email: 'f@example.test', phone: null },
    pending_invitation_id: null, properties_count: 0, occupied_properties_count: 0, figures: null, last_payout: null,
    next_payout: null, works_approval_threshold: null, agency_commission_rate: null, lease_commission_rates: [],
    rib_masked: 'SN•• •••• ••34', tax_id_masked: '•••• 4567', id_document_number_masked: null,
    ...surcharges,
  };
}

const vide = { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 }, links: {} };
const sensible = {
  data: { id: 3, rib: RIB_COMPLET, tax_id: '0012345672G3', id_document_type: 'cni', id_document_number: null },
};

let client: QueryClient;

function monter(ui: ReactElement, garde: GardeDoubleFacteurFn | null = null) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>{ui}</ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

const bloc = () => document.querySelector('[data-slot="pieces-du-bailleur"]') as HTMLElement;

beforeEach(() => {
  apiRequestMock.mockReset();
  toastAdd.mockReset();
  apiRequestMock.mockImplementation(async (chemin: string) => (chemin.includes('/sensitive') ? sensible : vide));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<PiecesDuBailleur> — identifiants masqués (TCK-601 · A, TCK-2641)', () => {
  it('rend les masques, jamais la valeur, et aucun geste pour un agent', () => {
    monter(<PiecesDuBailleur owner={owner()} peutAfficher={false} />);
    expect(bloc()).toHaveTextContent('SN•• •••• ••34');
    expect(bloc()).toHaveTextContent('•••• 4567');
    expect(bloc()).not.toHaveTextContent(RIB_COMPLET);
    expect(screen.queryByRole('button', { name: /^Afficher/ })).not.toBeInTheDocument();
  });

  it('un bailleur sans identifiant ni document ne propose aucun geste', async () => {
    monter(<PiecesDuBailleur owner={owner({ rib_masked: null, tax_id_masked: null })} peutAfficher />);
    expect(await screen.findByText('Aucun document pour l’instant.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Afficher/ })).not.toBeInTheDocument();
  });

  it('les documents sont lus au coffre par cible : le profil du bailleur', async () => {
    monter(<PiecesDuBailleur owner={owner()} peutAfficher />);
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    const chemin = String(apiRequestMock.mock.calls[0]?.[0]);
    expect(decodeURIComponent(chemin)).toContain('filter[documentable_type]=owner_profile');
    expect(decodeURIComponent(chemin)).toContain('filter[documentable_id]=3');
  });

  it('l’admin « Afficher » : le geste dit qu’il est enregistré, puis la valeur complète s’affiche', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    monter(<PiecesDuBailleur owner={owner()} peutAfficher />);

    const bouton = screen.getByRole('button', { name: 'Afficher en clair : RIB' });
    expect(bouton).toHaveAccessibleDescription(/inscrit la consultation au journal de l’agence/);

    await user.click(bouton);

    await waitFor(() => expect(bloc()).toHaveTextContent(RIB_COMPLET));
    expect(bloc()).toHaveTextContent('0012345672G3');
    expect(apiRequestMock).toHaveBeenCalledWith('/api/owners/3/sensitive', { token: 'jeton' });

    // Ni stockage du navigateur, ni cache de requêtes.
    expect(setItem.mock.calls.some((args) => String(args[1]).includes(RIB_COMPLET))).toBe(false);
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(RIB_COMPLET);

    await user.click(screen.getByRole('button', { name: 'Masquer : RIB' }));
    expect(bloc()).not.toHaveTextContent(RIB_COMPLET);
    expect(bloc()).toHaveTextContent('SN•• •••• ••34');
  });

  it('un refus de preuve récente passe par la garde de second facteur, puis l’appel est rejoué', async () => {
    let appels = 0;
    apiRequestMock.mockImplementation(async (chemin: string) => {
      if (!chemin.includes('/sensitive')) return vide;
      appels += 1;
      if (appels === 1) throw new ApiError(403, { code: 'two_factor_step_up_required' });
      return sensible;
    });
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const user = userEvent.setup();
    monter(<PiecesDuBailleur owner={owner()} peutAfficher />, garde);

    await user.click(screen.getByRole('button', { name: 'Afficher en clair : RIB' }));

    await waitFor(() => expect(bloc()).toHaveTextContent(RIB_COMPLET));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(appels).toBe(2);
  });

  it('un refus (403 agent, ou garde abandonnée) laisse le masque et le dit', async () => {
    apiRequestMock.mockImplementation(async (chemin: string) => {
      if (chemin.includes('/sensitive')) throw new ApiError(403, { message: 'Forbidden' });
      return vide;
    });
    const user = userEvent.setup();
    monter(<PiecesDuBailleur owner={owner()} peutAfficher />);

    await user.click(screen.getByRole('button', { name: 'Afficher en clair : RIB' }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalled());
    expect(toastAdd.mock.calls[0][0]).toMatchObject({ title: 'Les identifiants n’ont pas pu être affichés', type: 'error' });
    expect(bloc()).toHaveTextContent('SN•• •••• ••34');
  });
});
