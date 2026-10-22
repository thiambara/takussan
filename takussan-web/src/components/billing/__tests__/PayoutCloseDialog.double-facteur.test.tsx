import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';

/**
 * TCK-1203 — clôturer une période de reversement (`PlatformPayoutController@closePeriod`) exige un
 * step-up : le refus doit ouvrir la garde, puis la clôture est rejouée.
 */
const API = vi.hoisted(() => ({ closeAdminPlatformPayoutPeriod: vi.fn() }));
vi.mock('@/lib/queries/super-admin', () => API);
const TOAST = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => TOAST }));
vi.mock('@/components/admin/super/AgencyCombobox', () => ({ AgencyCombobox: () => null }));

import { PayoutCloseDialog } from '../PayoutCloseDialog';

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

function monter(garde: GardeDoubleFacteurFn) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <PayoutCloseDialog />
        </ContexteGardeDoubleFacteur.Provider>
      </QueryClientProvider>,
    ),
  );
}

describe('<PayoutCloseDialog> — second facteur', () => {
  beforeEach(() => vi.resetAllMocks());

  it('un refus de step-up ouvre la garde, puis la clôture est rejouée', async () => {
    API.closeAdminPlatformPayoutPeriod.mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: [], excluded: [] });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    fireEvent.click(screen.getByRole('button', { name: 'Clôturer' }));

    await waitFor(() => expect(TOAST.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' })));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(API.closeAdminPlatformPayoutPeriod).toHaveBeenCalledTimes(2);
  });

  it('garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    API.closeAdminPlatformPayoutPeriod.mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(garde);

    fireEvent.click(screen.getByRole('button', { name: 'Clôturer' }));

    await waitFor(() =>
      expect(TOAST.add).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', description: 'Second facteur requis.' }),
      ),
    );
    expect(API.closeAdminPlatformPayoutPeriod).toHaveBeenCalledTimes(1);
  });
});
