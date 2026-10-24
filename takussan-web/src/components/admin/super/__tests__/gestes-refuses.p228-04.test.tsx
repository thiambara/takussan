/**
 * P228.04 (TCK-2216) — six gestes de la console plateforme disent leur refus dans un
 * `role="alert"`, par `useMessageErreurApi()` (ADR-0019), comme les dialogues voisins des mêmes
 * fichiers : la suppression et le test d'une règle d'alerte, la désactivation d'une annonce, la
 * bascule de session d'un drapeau, le test d'une intégration et l'annulation d'une maintenance.
 * Avant, chaque `useMutation` n'avait qu'un `onSuccess`, et l'écran ne lisait pas son erreur.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import {
  cancelMaintenance,
  deactivateAdminAnnouncement,
  deleteAlertRule,
  fetchAdminAgencies,
  fetchAdminAnnouncements,
  overrideAdminFeatureFlag,
  testAdminIntegration,
  testAlertRule,
} from '@/lib/queries/super-admin';
import type { AdminFeatureFlag, AlertRule, Announcement } from '@/types/super-admin';
import { withIntl } from '@/test/intl';
import { AlertRuleTable, AlertTestButton } from '../alerts';
import { AnnouncementsConsole } from '../announcements';
import { SessionOverrideToggle } from '../feature-flags';
import { IntegrationTestButton } from '../integrations';
import { MaintenanceScheduler } from '../maintenance';

vi.mock('@/lib/queries/super-admin', () => ({
  cancelMaintenance: vi.fn(),
  createAdminAnnouncement: vi.fn(),
  createAlertRule: vi.fn(),
  deactivateAdminAnnouncement: vi.fn(),
  deleteAlertRule: vi.fn(),
  fetchAdminAgencies: vi.fn(),
  fetchAdminAnnouncements: vi.fn(),
  overrideAdminFeatureFlag: vi.fn(),
  patchAdminAnnouncement: vi.fn(),
  patchAdminFeatureFlag: vi.fn(),
  patchAlertRule: vi.fn(),
  scheduleMaintenance: vi.fn(),
  testAdminIntegration: vi.fn(),
  testAlertRule: vi.fn(),
}));

const MESSAGE_API = 'Refusé par l’API';
const refus = () => new ApiError(422, { message: MESSAGE_API });

function rendre(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(withIntl(<QueryClientProvider client={client}>{node}</QueryClientProvider>));
}

const regle: AlertRule = {
  id: 1,
  event: 'super_admin_setting_updated',
  channels: ['email'],
  recipients: { emails: ['ops@example.test'] },
  is_active: true,
  last_triggered_at: null,
  failure_count: 0,
};

const annonce: Announcement = {
  id: 7,
  title: { fr: 'Maintenance samedi', en: 'Maintenance on Saturday', wo: 'Maintenance samedi' },
  body: { fr: 'Coupure de 2 h', en: '2 h outage', wo: 'Coupure de 2 h' },
  severity: 'warning',
  segment: {},
  starts_at: '2026-08-01T08:00:00.000000Z',
  ends_at: null,
  is_active: true,
  created_by: 1,
  created_at: '2026-08-01T08:00:00.000000Z',
  updated_at: '2026-08-01T08:00:00.000000Z',
};

const drapeau: AdminFeatureFlag = {
  key: 'nouvelle_recherche',
  client_visible: true,
  enabled: false,
  segments: {},
  updated_at: null,
  enabled_for_me: false,
};

describe('console plateforme — les gestes refusés se disent (P228.04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suppression d’une règle d’alerte : le refus se dit dans la modale', async () => {
    vi.mocked(deleteAlertRule).mockRejectedValue(refus());
    const user = userEvent.setup();
    rendre(<AlertRuleTable rules={[regle]} catalogue={[regle.event]} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.type(screen.getByTestId('confirm-action-input'), 'SUPPRIMER');
    await user.click(screen.getByTestId('confirm-action-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('test d’une règle d’alerte', async () => {
    vi.mocked(testAlertRule).mockRejectedValue(refus());
    rendre(<AlertTestButton ruleId={1} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tester' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('désactivation d’une annonce', async () => {
    vi.mocked(fetchAdminAgencies).mockResolvedValue({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 100 },
    });
    vi.mocked(fetchAdminAnnouncements).mockResolvedValue({
      data: [annonce],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 30 },
    });
    vi.mocked(deactivateAdminAnnouncement).mockRejectedValue(refus());
    rendre(<AnnouncementsConsole />);

    await userEvent.click(await screen.findByRole('button', { name: 'Désactiver' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('bascule de session d’un drapeau', async () => {
    vi.mocked(overrideAdminFeatureFlag).mockRejectedValue(refus());
    rendre(<SessionOverrideToggle flag={drapeau} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tester' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('test d’une intégration', async () => {
    vi.mocked(testAdminIntegration).mockRejectedValue(refus());
    rendre(<IntegrationTestButton integrationId={3} />);

    await userEvent.click(screen.getByRole('button', { name: 'Tester' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('annulation d’une maintenance', async () => {
    vi.mocked(cancelMaintenance).mockRejectedValue(refus());
    rendre(
      <MaintenanceScheduler
        status={{
          active: false,
          show_banner: false,
          window: {
            id: 2,
            starts_at: '2026-11-01T08:00:00.000Z',
            ends_at: '2026-11-01T10:00:00.000Z',
            mode: 'banner',
            severity: 'scheduled',
            messages: { fr: 'Maintenance prévue' },
            banner_lead_minutes: 30,
          },
          generated_at: '2026-10-24T10:00:00.000Z',
        }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Annuler la fenêtre' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });
});
