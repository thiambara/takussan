import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { OwnersList } from '../OwnersList';
import type { OwnerProfileSummary } from '@/lib/queries/owners';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-601 (A) — le carnet de propriétaires montre le RIB, le NINEA et la pièce MASQUÉS ; l'admin
 * a un geste « Afficher » qui dit que la consultation est enregistrée, l'agent ne l'a pas. Les
 * valeurs révélées ne vont ni dans le cache React Query ni dans `localStorage`.
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

function donnees(overrides: Partial<OwnerProfileSummary> = {}): PaginatedResponse<OwnerProfileSummary> {
  return {
    data: [
      {
        id: 3,
        user_id: 9,
        agency_id: 7,
        status: 'active',
        metadata: null,
        created_at: null,
        user: { id: 9, first_name: 'Fatou', last_name: 'Sarr', email: 'f@example.test' },
        rib_masked: 'SN•• •••• ••34',
        tax_id_masked: '•••• 4567',
        id_document_number_masked: null,
        ...overrides,
      },
    ],
    meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
    links: { first: null, last: null, prev: null, next: null },
  } as never;
}

let client: QueryClient;

function monter(ui: ReactElement, garde: GardeDoubleFacteurFn | null = null) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>{ui}</ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

function celluleIdentifiants() {
  const lignes = screen.getAllByRole('row');
  // Nom · Email · Identifiants · Statut · Actions
  return within(lignes[1]).getAllByRole('cell')[2];
}

const sensible = {
  data: { id: 3, rib: RIB_COMPLET, tax_id: '0012345672G3', id_document_type: 'cni', id_document_number: null },
};

beforeEach(() => {
  apiRequestMock.mockReset();
  toastAdd.mockReset();
  // Le rafraîchissement de la liste (initialData périmée) rend la même page.
  apiRequestMock.mockImplementation(async (chemin: string) => (
    chemin.includes('/sensitive') ? sensible : donnees()
  ));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<OwnersList> — identifiants masqués (TCK-601 · A)', () => {
  it('rend les masques, jamais la valeur, et aucun geste pour un agent', () => {
    monter(<OwnersList agencyId={7} canInvite={false} initialData={donnees()} />);

    const cellule = celluleIdentifiants();
    expect(cellule).toHaveTextContent('SN•• •••• ••34');
    expect(cellule).toHaveTextContent('•••• 4567');
    expect(cellule).not.toHaveTextContent(RIB_COMPLET);
    expect(within(cellule).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/enregistre la consultation/)).not.toBeInTheDocument();
  });

  it('un bailleur sans identifiant rend un tiret, sans bouton', () => {
    monter(
      <OwnersList
        agencyId={7}
        canInvite
        canRevealSensitive
        initialData={donnees({ rib_masked: null, tax_id_masked: null, id_document_number_masked: null })}
      />,
    );
    const cellule = celluleIdentifiants();
    expect(cellule).toHaveTextContent('—');
    expect(within(cellule).queryByRole('button')).not.toBeInTheDocument();
  });

  it('l’admin « Afficher » : le geste dit qu’il est enregistré, puis la valeur complète s’affiche', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    monter(<OwnersList agencyId={7} canInvite canRevealSensitive initialData={donnees()} />);

    const bouton = within(celluleIdentifiants()).getByRole('button', { name: 'Afficher' });
    // La mention « consultation enregistrée » est la description accessible du geste.
    expect(bouton).toHaveAccessibleDescription(/enregistre la consultation dans le journal/);

    await user.click(bouton);

    await waitFor(() => expect(celluleIdentifiants()).toHaveTextContent(RIB_COMPLET));
    expect(celluleIdentifiants()).toHaveTextContent('0012345672G3');
    expect(apiRequestMock).toHaveBeenCalledWith('/api/owners/3/sensitive', { token: 'jeton' });

    // Ni stockage du navigateur, ni cache de requêtes.
    expect(setItem.mock.calls.some((args) => String(args[1]).includes(RIB_COMPLET))).toBe(false);
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(RIB_COMPLET);

    await user.click(within(celluleIdentifiants()).getByRole('button', { name: 'Masquer' }));
    expect(celluleIdentifiants()).not.toHaveTextContent(RIB_COMPLET);
    expect(celluleIdentifiants()).toHaveTextContent('SN•• •••• ••34');
  });

  it('un refus de preuve récente passe par la garde de second facteur, puis l’appel est rejoué', async () => {
    let appels = 0;
    apiRequestMock.mockImplementation(async (chemin: string) => {
      if (!chemin.includes('/sensitive')) return donnees();
      appels += 1;
      if (appels === 1) throw new ApiError(403, { code: 'two_factor_step_up_required' });
      return sensible;
    });
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const user = userEvent.setup();
    monter(<OwnersList agencyId={7} canInvite canRevealSensitive initialData={donnees()} />, garde);

    await user.click(within(celluleIdentifiants()).getByRole('button', { name: 'Afficher' }));

    await waitFor(() => expect(celluleIdentifiants()).toHaveTextContent(RIB_COMPLET));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(appels).toBe(2);
  });

  it('un refus (403 agent, ou garde abandonnée) laisse le masque et le dit', async () => {
    apiRequestMock.mockImplementation(async (chemin: string) => {
      if (chemin.includes('/sensitive')) throw new ApiError(403, { message: 'Forbidden' });
      return donnees();
    });
    const user = userEvent.setup();
    monter(<OwnersList agencyId={7} canInvite canRevealSensitive initialData={donnees()} />);

    await user.click(within(celluleIdentifiants()).getByRole('button', { name: 'Afficher' }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalled());
    expect(toastAdd.mock.calls[0][0]).toMatchObject({
      title: 'Impossible d\'afficher ces identifiants',
      type: 'error',
    });
    expect(celluleIdentifiants()).toHaveTextContent('SN•• •••• ••34');
  });
});
