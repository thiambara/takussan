import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchAdminIntegrationSchema,
  patchAdminIntegration,
  testAdminIntegration,
} from '@/lib/queries/super-admin';
import type { AdminIntegration } from '@/types/super-admin';
import { IntegrationEditDialog, IntegrationTestButton } from '../integrations';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminIntegrationSchema: vi.fn(),
  patchAdminIntegration: vi.fn(),
  testAdminIntegration: vi.fn(),
}));

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
  masked_credentials: { api_key: '••••1234', webhook_secret: '••••9999' },
};

function renderWithQuery(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(withIntl(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  ));
}

describe('super-admin integrations UI', () => {
  it('renders masked credentials and submits only replacement values', async () => {
    vi.mocked(fetchAdminIntegrationSchema).mockResolvedValue({
      data: {
        provider: 'wave',
        label: 'Wave',
        category: 'payments',
        fields: [
          { name: 'api_key', label: 'API key', type: 'password', secret: true, required: true },
          { name: 'webhook_secret', label: 'Webhook secret', type: 'password', secret: true, required: true },
        ],
      },
    });
    vi.mocked(patchAdminIntegration).mockResolvedValue({ data: integration });
    const user = userEvent.setup();
    renderWithQuery(<IntegrationEditDialog integration={integration} open onOpenChange={vi.fn()} />);

    expect(await screen.findByPlaceholderText('••••1234')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/API key/i), 'wave-new-secret');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchAdminIntegration).toHaveBeenCalledWith(7, {
      credentials: { api_key: 'wave-new-secret' },
    }));
  });

  it('tests a connection and displays latency', async () => {
    vi.mocked(testAdminIntegration).mockResolvedValue({ data: { success: true, latency_ms: 12, error: null } });
    const user = userEvent.setup();
    renderWithQuery(<IntegrationTestButton integrationId={7} />);

    await user.click(screen.getByRole('button', { name: /tester/i }));

    expect(await screen.findByText('12 ms')).toBeInTheDocument();
  });
});
