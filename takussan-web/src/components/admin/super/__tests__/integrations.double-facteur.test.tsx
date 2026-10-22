import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { fetchAdminIntegrationSchema, patchAdminIntegration, testAdminIntegration } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { AdminIntegration } from '@/types/super-admin';
import { IntegrationEditDialog, IntegrationTestButton } from '../integrations';

/**
 * TCK-1203 — tester et modifier une intégration plateforme (`Admin\IntegrationController@test|update`)
 * exigent un step-up : le refus doit ouvrir la garde, puis l'appel est rejoué.
 */
vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminIntegrationSchema: vi.fn(),
  patchAdminIntegration: vi.fn(),
  testAdminIntegration: vi.fn(),
}));

const refus = () => new ApiError(403, { code: 'two_factor_step_up_required', message: 'Second facteur requis.' });

const integration: AdminIntegration = {
  id: 7,
  provider: 'wave',
  label: 'Wave',
  category: 'payments',
  critical: true,
  agency_id: null,
  is_active: true,
  status: 'unknown',
  last_used_at: null,
  last_health_check_at: null,
  metadata: {},
  masked_credentials: { api_key: '••••1234' },
};

function monter(node: React.ReactNode, garde: GardeDoubleFacteurFn) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ContexteGardeDoubleFacteur.Provider value={garde}>{node}</ContexteGardeDoubleFacteur.Provider>
      </QueryClientProvider>,
    ),
  );
}

async function modifierLaCle() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/API key/i), 'wave-new-secret');
  await user.click(screen.getByRole('button', { name: /enregistrer/i }));
}

describe('intégrations plateforme — second facteur', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchAdminIntegrationSchema).mockResolvedValue({
      data: {
        provider: 'wave',
        label: 'Wave',
        category: 'payments',
        fields: [{ name: 'api_key', label: 'API key', type: 'password', secret: true, required: true }],
      },
    });
  });

  it('le test de connexion : la garde s’ouvre, puis le test est rejoué', async () => {
    vi.mocked(testAdminIntegration)
      .mockRejectedValueOnce(refus())
      .mockResolvedValueOnce({ data: { success: true, latency_ms: 12, error: null } });
    const garde = vi.fn().mockResolvedValue(true);
    monter(<IntegrationTestButton integrationId={7} />, garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /tester/i }));

    expect(await screen.findByText('12 ms')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(testAdminIntegration).toHaveBeenCalledTimes(2);
  });

  it('le test de connexion, garde abandonnée : pas de rejeu', async () => {
    vi.mocked(testAdminIntegration).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    monter(<IntegrationTestButton integrationId={7} />, garde);

    await userEvent.setup().click(screen.getByRole('button', { name: /tester/i }));

    await waitFor(() => expect(garde).toHaveBeenCalledTimes(1));
    expect(testAdminIntegration).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('12 ms')).not.toBeInTheDocument();
  });

  it('la modification : la garde s’ouvre, puis l’enregistrement est rejoué', async () => {
    vi.mocked(patchAdminIntegration).mockRejectedValueOnce(refus()).mockResolvedValueOnce({ data: integration });
    const garde = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();
    monter(<IntegrationEditDialog integration={integration} open onOpenChange={onOpenChange} />, garde);

    await modifierLaCle();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(patchAdminIntegration).toHaveBeenCalledTimes(2);
  });

  it('la modification, garde abandonnée : pas de rejeu, et le refus s’affiche', async () => {
    vi.mocked(patchAdminIntegration).mockRejectedValue(refus());
    const garde = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();
    monter(<IntegrationEditDialog integration={integration} open onOpenChange={onOpenChange} />, garde);

    await modifierLaCle();

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(patchAdminIntegration).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
