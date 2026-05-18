import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAlertRule, patchAlertRule, testAlertRule } from '@/lib/queries/super-admin';
import type { AlertRule } from '@/types/super-admin';
import { AlertRuleDialog, AlertRuleTable } from '../alerts';

vi.mock('@/lib/queries/super-admin', () => ({
  createAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
  patchAlertRule: vi.fn(),
  testAlertRule: vi.fn(),
}));

const catalogue = { super_admin_setting_updated: 'Paramètre modifié' };
const rule: AlertRule = {
  id: 1,
  event: 'super_admin_setting_updated',
  label: 'Paramètre modifié',
  channels: ['email'],
  recipients: { emails: ['ops@example.test'] },
  is_active: true,
  last_triggered_at: null,
  failure_count: 2,
};

function renderWithQuery(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <NextIntlClientProvider locale="fr" messages={{ common: { actions: { close: 'Fermer' } } }}>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('alert rules UI', () => {
  it('creates an alert rule', async () => {
    vi.mocked(createAlertRule).mockResolvedValue({ data: rule });
    const user = userEvent.setup();
    renderWithQuery(<AlertRuleDialog rule={null} catalogue={catalogue} open onOpenChange={vi.fn()} />);

    await user.clear(screen.getByLabelText(/Emails/i));
    await user.type(screen.getByLabelText(/Emails/i), 'ops@example.test');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(createAlertRule).toHaveBeenCalledWith({
      event: 'super_admin_setting_updated',
      channels: ['email'],
      recipients: { emails: ['ops@example.test'], webhooks: [] },
      is_active: true,
    }));
  });

  it('edits and tests a rule', async () => {
    vi.mocked(patchAlertRule).mockResolvedValue({ data: rule });
    vi.mocked(testAlertRule).mockResolvedValue({ data: { queued: true } });
    const user = userEvent.setup();
    renderWithQuery(<AlertRuleTable rules={[rule]} catalogue={catalogue} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^tester$/i }));
    expect(await screen.findByRole('button', { name: /test envoyé/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /éditer/i }));
    await user.clear(screen.getByLabelText(/Canaux/i));
    await user.type(screen.getByLabelText(/Canaux/i), 'email,slack');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchAlertRule).toHaveBeenCalled());
  });
});
