import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAlertRule, patchAlertRule, testAlertRule } from '@/lib/queries/super-admin';
import type { AlertRule } from '@/types/super-admin';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import { AlertRuleDialog, AlertRuleTable } from '../alerts';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({
  createAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
  patchAlertRule: vi.fn(),
  testAlertRule: vi.fn(),
}));

const catalogue = ['super_admin_setting_updated', 'super_admin_payout_approved'];
const rule: AlertRule = {
  id: 1,
  event: 'super_admin_setting_updated',
  channels: ['email'],
  recipients: { emails: ['ops@example.test'] },
  is_active: true,
  last_triggered_at: null,
  failure_count: 2,
};

function renderWithQuery(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  ));
}

describe('alert rules UI', () => {
  it('creates an alert rule with channels picked, not typed (TCK-600)', async () => {
    vi.mocked(createAlertRule).mockResolvedValue({ data: rule });
    const user = userEvent.setup();
    renderWithQuery(<AlertRuleDialog rule={null} catalogue={catalogue} open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Slack' }));
    await user.clear(screen.getByLabelText(/Emails/i));
    await user.type(screen.getByLabelText(/Emails/i), 'ops@example.test');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(createAlertRule).toHaveBeenCalledWith({
      event: 'super_admin_setting_updated',
      channels: ['email', 'slack'],
      recipients: { emails: ['ops@example.test'], webhooks: [] },
      is_active: true,
    }));
  });

  it('cannot save without any channel', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AlertRuleDialog rule={null} catalogue={catalogue} open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'E-mail' }));

    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it('translates the event from its key, and tests then edits a rule', async () => {
    vi.mocked(patchAlertRule).mockResolvedValue({ data: rule });
    vi.mocked(testAlertRule).mockResolvedValue({ data: { queued: true } });
    const user = userEvent.setup();
    renderWithQuery(<AlertRuleTable rules={[rule]} catalogue={catalogue} />);

    expect(screen.getByText('Paramètre plateforme modifié')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^tester$/i }));
    expect(await screen.findByRole('button', { name: /test envoyé/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /éditer/i }));
    await user.click(screen.getByRole('button', { name: 'Discord' }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchAlertRule).toHaveBeenCalledWith(1, expect.objectContaining({
      event: 'super_admin_setting_updated',
      channels: ['email', 'discord'],
    })));
  });

  it('has a label for every alertable event of the API, in the three locales', () => {
    const source = readFileSync(join(process.cwd(), '..', 'takussan-api', 'app', 'Domain', 'Alerts', 'AlertableEvents.php'), 'utf8');
    const corps = /function keys\(\)[\s\S]*?return \[([\s\S]*?)\];/.exec(source)?.[1] ?? '';
    const cles = [...corps.matchAll(/^\s*'([a-z0-9_]+)',/gm)].map((m) => m[1]);

    expect(cles.length).toBeGreaterThan(20);
    for (const dictionnaire of [fr, en, wo]) {
      expect(Object.keys(dictionnaire.superAdmin.alerts.events).sort()).toEqual([...cles].sort());
    }
  });
});
