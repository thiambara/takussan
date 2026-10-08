/**
 * TCK-594 (ADR-0039 §6) — le titulaire déclare où il veut être payé.
 *
 * Le numéro ne se relit jamais en clair : même quand l'API le rend au titulaire, la liste ne montre
 * que la forme masquée. L'état « vérifiée / en attente » se lit, et la première destination devient
 * celle par défaut.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { PayoutMethodsSection } from '../PayoutMethodsSection';

const CREATE = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const AUTRE = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const LISTE = vi.hoisted(() => ({ current: { isLoading: false, data: { data: [] as unknown[] } } }));
vi.mock('@/lib/queries/payments', () => ({
  useMyPayoutMethods: () => LISTE.current,
  useCreateMyPayoutMethod: () => CREATE,
  useSetDefaultPayoutMethod: () => AUTRE,
  useDeleteMyPayoutMethod: () => AUTRE,
}));

describe('PayoutMethodsSection — où recevoir ses versements (TCK-594)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    LISTE.current = { isLoading: false, data: { data: [] } };
  });

  it('ne relit que le numéro masqué, et dit si la destination est vérifiée', () => {
    LISTE.current = {
      isLoading: false,
      data: {
        data: [
          { id: 1, kind: 'wave', masked_identifier: '•••• 4567', account_identifier: '+221771234567', is_default: true, verified: true },
          { id: 2, kind: 'bank_transfer', masked_identifier: '•••• 0189', account_identifier: 'SN0120100100123456789', is_default: false, verified: false },
        ],
      },
    };
    render(withIntl(<PayoutMethodsSection />));

    expect(screen.getByText('•••• 4567')).toBeInTheDocument();
    expect(screen.queryByText(/771234567/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SN0120100100123456789/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Vérifiée/)).toBeInTheDocument();
    expect(screen.getByText('En attente de vérification')).toBeInTheDocument();
  });

  it('enregistre la première destination comme destination par défaut', async () => {
    CREATE.mutateAsync.mockResolvedValue({ data: { id: 3 } });
    render(withIntl(<PayoutMethodsSection />));

    fireEvent.change(screen.getByLabelText('Numéro de téléphone'), { target: { value: ' +221 77 123 45 67 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(CREATE.mutateAsync).toHaveBeenCalledTimes(1));
    expect(CREATE.mutateAsync.mock.calls[0][0]).toEqual({
      kind: 'wave',
      account_identifier: '+221 77 123 45 67',
      account_holder_name: null,
      is_default: true,
    });
  });

  it('dit pourquoi le serveur refuse', async () => {
    CREATE.mutateAsync.mockRejectedValue(new ApiError(422, { message: 'Le numéro est invalide.' }));
    render(withIntl(<PayoutMethodsSection />));

    fireEvent.change(screen.getByLabelText('Numéro de téléphone'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le numéro est invalide.');
  });
});
