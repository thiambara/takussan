/**
 * TCK-955 (ADR-0070 § 5 et 8) — sur la fiche client, l'admin a le geste « Afficher » du numéro de
 * pièce : il appelle `/api/customers/{id}/sensitive` hors de React Query, passe par la garde de
 * step-up sur un refus, et « Masquer » oublie la valeur. L'agent n'a pas le geste.
 */
import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import type { CustomerDetail } from '@/types/customer';
import { CustomerForm } from '../CustomerForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/app/actions/dashboard-customers', () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
}));

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton', isLoading: false }),
}));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const fiche = {
  id: 7,
  first_name: 'Awa',
  last_name: 'Diop',
  email: null,
  phone: '+221771234567',
  status: 'active',
  pipeline_stage: 'lead',
  occupation: null,
  created_at: '2026-10-18T10:00:00Z',
  birth_date: null,
  id_type: 'id_card',
  id_number_masked: '•••• 8877',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  added_by_id: 1,
  user_id: null,
  metadata: null,
} satisfies CustomerDetail;

const sensible = { data: { id: 7, id_type: 'id_card', id_number: 'SN-998877' } };

function monter(ui: ReactElement, garde: GardeDoubleFacteurFn | null = null) {
  return render(withIntl(
    <ContexteGardeDoubleFacteur.Provider value={garde}>{ui}</ContexteGardeDoubleFacteur.Provider>,
  ));
}

describe('CustomerForm — révélation du numéro de pièce', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    toastAdd.mockReset();
  });

  it('l’admin « Afficher » : l’appel part vers /sensitive, la valeur s’affiche, « Masquer » l’oublie', async () => {
    apiRequestMock.mockResolvedValueOnce(sensible);
    const user = userEvent.setup();
    monter(<CustomerForm mode="edit" customer={fiche} canRevealIdNumber />);

    const bouton = screen.getByRole('button', { name: 'Afficher' });
    expect(bouton).toHaveAccessibleDescription(/enregistre la consultation dans le journal/);
    expect(screen.getByTestId('numero-de-piece')).toHaveTextContent('•••• 8877');

    await user.click(bouton);

    await waitFor(() => expect(screen.getByTestId('numero-de-piece')).toHaveTextContent('SN-998877'));
    expect(apiRequestMock).toHaveBeenCalledWith('/api/customers/7/sensitive', { token: 'jeton' });
    expect(screen.getByLabelText('Numéro')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Masquer' }));
    expect(screen.getByTestId('numero-de-piece')).toHaveTextContent('•••• 8877');
    expect(screen.queryByText('SN-998877')).not.toBeInTheDocument();
  });

  it('l’agent n’a pas le geste', () => {
    monter(<CustomerForm mode="edit" customer={fiche} />);

    expect(screen.queryByRole('button', { name: 'Afficher' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('numero-de-piece')).not.toBeInTheDocument();
  });

  it('un refus de step-up ouvre la garde de second facteur, puis l’appel est rejoué', async () => {
    apiRequestMock
      .mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_step_up_required' }))
      .mockResolvedValueOnce(sensible);
    const garde = vi.fn<GardeDoubleFacteurFn>().mockResolvedValue(true);
    const user = userEvent.setup();
    monter(<CustomerForm mode="edit" customer={fiche} canRevealIdNumber />, garde);

    await user.click(screen.getByRole('button', { name: 'Afficher' }));

    await waitFor(() => expect(screen.getByTestId('numero-de-piece')).toHaveTextContent('SN-998877'));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });
});
