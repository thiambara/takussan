import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { postUserLifecycleAction } from '@/lib/queries/super-admin';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { UserLifecycleActions } from '../UserLifecycleActions';

/**
 * TCK-1203 — bloquer, réactiver, effacer un compte (`UserLifecycleController@block|reactivate|erase`)
 * exigent un step-up : le refus doit ouvrir la garde, puis le geste est rejoué.
 */
vi.mock('@/lib/queries/super-admin', () => ({ postUserLifecycleAction: vi.fn() }));

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

function monter(garde: GardeDoubleFacteurFn) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ContexteGardeDoubleFacteur.Provider value={garde}>
            {avecGestes(<UserLifecycleActions userId={5} status="active" />)}
          </ContexteGardeDoubleFacteur.Provider>
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

async function bloquer() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Bloquer' }));
  await user.type(screen.getByTestId('confirm-action-reason'), 'Fraude signalée par trois agences.');
  await user.type(screen.getByTestId('confirm-action-input'), 'BLOQUER');
  await user.click(screen.getByTestId('confirm-action-submit'));
}

describe('<UserLifecycleActions> — second facteur', () => {
  beforeEach(() => vi.resetAllMocks());

  it('un refus de step-up ouvre la garde, puis le blocage est rejoué', async () => {
    vi.mocked(postUserLifecycleAction)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce({ data: { status: 'blocked' } });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await bloquer();

    expect(await screen.findByText('Action effectuée.')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(postUserLifecycleAction).toHaveBeenCalledTimes(2);
    expect(postUserLifecycleAction).toHaveBeenLastCalledWith(5, 'block', 'Fraude signalée par trois agences.');
  });

  it('garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(postUserLifecycleAction).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(garde);

    await bloquer();

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(postUserLifecycleAction).toHaveBeenCalledTimes(1);
  });
});
