import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { overrideAdminFeatureFlag, patchAdminFeatureFlag } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { AdminFeatureFlag } from '@/types/super-admin';
import { FeatureFlagTable } from '../feature-flags';

/**
 * TCK-1203 — régler un drapeau et le forcer pour sa session (`FeatureFlagController@update|override`)
 * exigent un step-up : le refus doit ouvrir la garde, puis l'appel est rejoué.
 */
vi.mock('@/lib/queries/super-admin', () => ({
  overrideAdminFeatureFlag: vi.fn(),
  patchAdminFeatureFlag: vi.fn(),
}));

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

const flag: AdminFeatureFlag = {
  key: 'property_compare',
  client_visible: true,
  enabled: false,
  segments: {},
  updated_at: null,
};

function monter(garde: GardeDoubleFacteurFn) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <FeatureFlagTable flags={[flag]} />
        </ContexteGardeDoubleFacteur.Provider>
      </QueryClientProvider>,
    ),
  );
}

async function configurerEtEnregistrer() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /configurer/i }));
  await user.click(screen.getByRole('button', { name: /enregistrer/i }));
}

describe('<FeatureFlagTable> — second facteur', () => {
  beforeEach(() => vi.clearAllMocks());

  it('le réglage : la garde s’ouvre, puis l’enregistrement est rejoué', async () => {
    vi.mocked(patchAdminFeatureFlag).mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: [flag] });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await configurerEtEnregistrer();

    await waitFor(() => expect(patchAdminFeatureFlag).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('le réglage, garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(patchAdminFeatureFlag).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(garde);

    await configurerEtEnregistrer();

    expect(await screen.findByRole('alert')).toHaveTextContent('Second facteur requis.');
    expect(patchAdminFeatureFlag).toHaveBeenCalledTimes(1);
  });

  it('le forçage de session : la garde s’ouvre, puis la bascule est rejouée', async () => {
    vi.mocked(overrideAdminFeatureFlag)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce({ data: { key: 'property_compare', enabled: true } });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /^tester$/i }));

    expect(await screen.findByRole('button', { name: /vous testez/i })).toBeInTheDocument();
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(overrideAdminFeatureFlag).toHaveBeenCalledTimes(2);
  });

  it('le forçage de session, garde abandonnée : pas de rejeu', async () => {
    vi.mocked(overrideAdminFeatureFlag).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /^tester$/i }));

    await waitFor(() => expect(garde).toHaveBeenCalledTimes(1));
    expect(overrideAdminFeatureFlag).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /vous testez/i })).not.toBeInTheDocument();
  });
});
