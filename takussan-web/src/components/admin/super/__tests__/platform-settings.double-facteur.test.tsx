import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { patchPlatformSettings } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { PlatformSetting } from '@/types/super-admin';
import { SettingsSection } from '../platform-settings';

/**
 * TCK-1203 — enregistrer les paramètres plateforme (`PlatformSettingController@bulkUpdate`) exige un
 * step-up. Le refus s'affichait « code 2FA requis », sans boîte pour saisir le code.
 */
vi.mock('@/lib/queries/super-admin', () => ({ patchPlatformSettings: vi.fn() }));

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

const reglage: PlatformSetting = {
  key: 'platform.session_max_minutes',
  category: 'limits',
  type: 'integer',
  value: 480,
  default_value: 480,
  options: null,
  nullable: false,
  public: false,
  requires_restart: false,
  updated_at: null,
  updated_by: null,
};

function monter(garde: GardeDoubleFacteurFn) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <SettingsSection title="Limites techniques" settings={[reglage]} />
        </ContexteGardeDoubleFacteur.Provider>
      </QueryClientProvider>,
    ),
  );
}

async function modifierEtEnregistrer() {
  const user = userEvent.setup();
  const champ = screen.getByLabelText(/Durée maximale/i);
  await user.clear(champ);
  await user.type(champ, '240');
  await user.click(screen.getByRole('button', { name: /enregistrer/i }));
}

describe('<SettingsSection> — second facteur', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un refus de step-up ouvre la garde, puis l’enregistrement est rejoué', async () => {
    vi.mocked(patchPlatformSettings)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce({ data: { limits: [{ ...reglage, value: 240 }] } });
    const garde = vi.fn().mockResolvedValue(true);
    monter(garde);

    await modifierEtEnregistrer();

    expect(await screen.findByText('Paramètres enregistrés.')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(patchPlatformSettings).toHaveBeenCalledTimes(2);
  });

  it('garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(patchPlatformSettings).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(garde);

    await modifierEtEnregistrer();

    await waitFor(() => expect(garde).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(patchPlatformSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Paramètres enregistrés.')).not.toBeInTheDocument();
  });
});
