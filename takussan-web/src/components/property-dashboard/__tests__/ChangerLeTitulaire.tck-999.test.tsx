import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

/**
 * TCK-999 (P15.06, Q5) — « Changer le titulaire » : la confirmation dit, AVANT d'écrire, ce qui suit
 * le bien (ses baux en brouillon) et ce qui reste (les baux signés, les reversements faits). Le geste
 * ne part qu'à la confirmation, vers le bailleur choisi.
 */

const bailleurs = vi.hoisted(() => ({
  etat: {
    isLoading: false,
    data: {
      data: [
        { id: 501, user_id: 71, metadata: null, user: { id: 71, first_name: 'Awa', last_name: 'Diop', email: 'awa@x.sn' } },
        { id: 503, user_id: null, metadata: { first_name: 'Invité', last_name: 'Sans compte' }, user: null },
      ],
    },
  },
}));
vi.mock('@/components/property-form/ChoixDuBailleur', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/property-form/ChoixDuBailleur')>()),
  useBailleursActifs: () => bailleurs.etat,
}));

const api = vi.hoisted(() => ({ apercu: vi.fn(), transferer: vi.fn() }));
vi.mock('@/lib/queries/titulaire-du-bien', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/titulaire-du-bien')>()),
  lireApercuDuTransfert: (...a: unknown[]) => api.apercu(...a),
  transfererLeTitulaire: (...a: unknown[]) => api.transferer(...a),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton' }) }));
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
const routeur = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

import { ChangerLeTitulaire } from '../ChangerLeTitulaire';

const APERCU = {
  data: {
    property_id: 42,
    current_owner: { id: 9, name: 'Agent Fall' },
    new_owner: { id: 71, name: 'Awa Diop' },
    leases_moving: [
      { id: 1, reference_number: 'LS-B1', status: 'draft', tenant_name: 'Fatou Sow' },
      { id: 2, reference_number: 'LS-B2', status: 'draft', tenant_name: null },
    ],
    leases_staying: [{ id: 3, reference_number: 'LS-A1', status: 'active', tenant_name: 'Moussa Ndiaye' }],
  },
};

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ChangerLeTitulaire propertyId={42} agencyId={3} />
    </QueryClientProvider>,
  ));
}

async function ouvrirEtChoisir() {
  const user = userEvent.setup();
  monter();
  await user.click(screen.getByRole('button', { name: 'Changer le titulaire' }));
  fireEvent.change(await screen.findByLabelText('Nouveau titulaire'), { target: { value: '71' } });
  return user;
}

describe('ChangerLeTitulaire (TCK-999)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.apercu.mockResolvedValue(APERCU);
    api.transferer.mockResolvedValue({ data: { property_id: 42, user_id: 71, leases_moved: [1, 2], leases_kept: [3] } });
  });

  it('propose les bailleurs qui ont un compte, et rien ne part avant le choix', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Changer le titulaire' }));

    const choix = await screen.findByLabelText('Nouveau titulaire');
    expect(screen.getByRole('option', { name: 'Awa Diop' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Invité/ })).not.toBeInTheDocument();
    expect(choix).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Confirmer le changement' })).toBeDisabled();
    expect(api.apercu).not.toHaveBeenCalled();
  });

  it('dit ce qui suit le bien et ce qui reste, avant toute écriture', async () => {
    await ouvrirEtChoisir();

    const apercu = await screen.findByTestId('apercu-du-transfert');
    expect(api.apercu).toHaveBeenCalledWith('jeton', 42, 71, expect.anything());
    expect(apercu).toHaveTextContent('2 baux en brouillon passeront à Awa Diop.');
    expect(apercu).toHaveTextContent("Le bail LS-A1 (Actif) de Moussa Ndiaye reste au nom de l'agence.");
    expect(apercu).toHaveTextContent('Les reversements déjà faits ne changent pas.');
    expect(api.transferer).not.toHaveBeenCalled();
  });

  it('transfère au bailleur choisi à la confirmation, puis relit la fiche', async () => {
    const user = await ouvrirEtChoisir();
    await screen.findByTestId('apercu-du-transfert');

    await user.click(screen.getByRole('button', { name: 'Confirmer le changement' }));

    await waitFor(() => expect(api.transferer).toHaveBeenCalledWith('jeton', 42, 71, 'fr'));
    await waitFor(() => expect(routeur.refresh).toHaveBeenCalled());
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Le bien est désormais au nom de Awa Diop.' }));
  });

  it('un aperçu refusé par l’API se dit, et la confirmation reste fermée', async () => {
    api.apercu.mockRejectedValue(new ApiError(422, {
      code: 'property.owner_transfer_forbidden',
      message: 'Ce bien ne change pas de titulaire.',
    }));

    await ouvrirEtChoisir();

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce bien ne change pas de titulaire.');
    expect(screen.getByRole('button', { name: 'Confirmer le changement' })).toBeDisabled();
    expect(api.transferer).not.toHaveBeenCalled();
  });
});
