import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { DepositRefundModal } from '../DepositRefundModal';

/**
 * TCK-1203 — restituer une caution exige la 2FA de l'agence (`LeaseDepositRefundController@store`,
 * `ProtectedActions::AGENCY_TWO_FACTOR`). L'appel nu affichait « code 2FA requis » sans moyen de
 * le saisir : la garde le résout sur place, puis l'appel est rejoué.
 */
const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });

function monter(garde: GardeDoubleFacteurFn) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <DepositRefundModal open onOpenChange={onOpenChange} leaseId={5} depositRemaining={100000} currency="XOF" />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
  return onOpenChange;
}

describe('<DepositRefundModal> — second facteur', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('un refus de second facteur ouvre la garde, puis la restitution est rejouée', async () => {
    apiRequestMock.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: {} });
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const onOpenChange = monter(garde);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(apiRequestMock.mock.calls[1][0]).toBe('/api/leases/5/deposit-refund');
  });

  it('garde abandonnée : pas de rejeu, l’erreur s’affiche et la boîte reste ouverte', async () => {
    apiRequestMock.mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    const onOpenChange = monter(garde);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
