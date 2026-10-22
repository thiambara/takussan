import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import type { PlatformPayout } from '@/types/super-admin';

/**
 * TCK-1203 — approuver, marquer payé et annuler un reversement plateforme
 * (`PlatformPayoutController@approve|markPaid|cancel`) exigent un step-up : le refus doit ouvrir la
 * garde, puis le geste est rejoué.
 */
const API = vi.hoisted(() => ({
  fetchAdminPlatformPayout: vi.fn(),
  approveAdminPlatformPayout: vi.fn(),
  markAdminPlatformPayoutPaid: vi.fn(),
  cancelAdminPlatformPayout: vi.fn(),
}));
vi.mock('@/lib/queries/super-admin', () => API);
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3 } }) }));
const TOAST = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => TOAST }));

import { PayoutDetailPanel } from '../PayoutDetailPanel';

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

const BASE: PlatformPayout = {
  id: 7,
  agency_id: 3,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  gross_amount: 500000,
  platform_fee_amount: 50000,
  net_amount: 450000,
  currency: 'XOF',
  status: 'pending',
  closed_by_id: 1,
  approved_by: null,
  processed_at: null,
  failure_reason: null,
  metadata: null,
  created_at: null,
  updated_at: null,
};

function ouvrir(payout: PlatformPayout, garde: GardeDoubleFacteurFn, onClose = vi.fn()) {
  API.fetchAdminPlatformPayout.mockResolvedValue({ data: payout });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <PayoutDetailPanel payoutId={payout.id} onClose={onClose} />
        </ContexteGardeDoubleFacteur.Provider>
      </QueryClientProvider>,
    ),
  );
}

const succes = () => expect(TOAST.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));

describe('<PayoutDetailPanel> — second facteur', () => {
  beforeEach(() => vi.resetAllMocks());

  it('l’approbation : la garde s’ouvre, puis l’approbation est rejouée', async () => {
    API.approveAdminPlatformPayout.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: BASE });
    const garde = vi.fn().mockResolvedValue(true);
    ouvrir(BASE, garde);

    fireEvent.click(await screen.findByRole('button', { name: 'Approuver' }));

    await waitFor(succes);
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(API.approveAdminPlatformPayout).toHaveBeenCalledTimes(2);
  });

  it('l’approbation, garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    API.approveAdminPlatformPayout.mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    ouvrir(BASE, garde);

    fireEvent.click(await screen.findByRole('button', { name: 'Approuver' }));

    await waitFor(() =>
      expect(TOAST.add).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', description: 'Second facteur requis.' }),
      ),
    );
    expect(API.approveAdminPlatformPayout).toHaveBeenCalledTimes(1);
  });

  it('le marquage payé : la garde s’ouvre, puis le marquage est rejoué', async () => {
    API.markAdminPlatformPayoutPaid.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: BASE });
    const garde = vi.fn().mockResolvedValue(true);
    ouvrir({ ...BASE, status: 'approved', approved_by: 2 }, garde);

    fireEvent.change(await screen.findByRole('textbox', { name: 'Référence du virement' }), {
      target: { value: 'VIR-2026-0042' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Marquer payé' }));

    await waitFor(succes);
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(API.markAdminPlatformPayoutPaid).toHaveBeenCalledTimes(2);
  });

  it('l’annulation : la garde s’ouvre, puis l’annulation est rejouée', async () => {
    API.cancelAdminPlatformPayout.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: BASE });
    const garde = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    ouvrir(BASE, garde, onClose);

    fireEvent.change(await screen.findByPlaceholderText("Raison de l'annulation"), { target: { value: 'Doublon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(API.cancelAdminPlatformPayout).toHaveBeenCalledTimes(2);
  });
});
