/**
 * TCK-1513 (P167.03) — « Baux à signer » compte les baux `pending_signature` : son lien ouvre la
 * liste des baux sur ce statut, que `LeasesList` lit dans `?status=`. Avant, le lien menait à
 * `/app/leases` nu, qui ouvre tous les baux, tous statuts.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/i18n/locale-serveur', () => ({ localeDeLaRequete: async () => 'fr' }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => [] }));
vi.mock('@/lib/queries/dashboard', () => ({
  fetchAgentDashboard: async () => ({
    data: {
      scope: 'mine',
      period: { start: '2026-10-01', end: '2026-10-31' },
      pipeline_ops: { pending_bookings: 3, leases_to_sign: 4, tasks_today: 5 },
    },
    timeseries: null,
  }),
}));

const { default: Page } = await import('../page');

describe('Aperçu de l’agent — les liens des priorités (TCK-1513)', () => {
  it('« Baux à signer » ouvre les baux en attente de signature', async () => {
    render(await Page());

    const lien = screen.getByRole('link', { name: new RegExp(fr.dashboard.agent.leasesToSign) });
    expect(lien).toHaveAttribute('href', '/app/leases?status=pending_signature');
  });

  // TCK-1733 (P167.04) — « Tâches du jour » compte les tâches assignées à l'agent : le lien porte
  // cette portée, en plus de l'échéance.
  it('« Tâches du jour » ouvre les tâches du jour qui lui sont assignées', async () => {
    render(await Page());

    const lien = screen.getByRole('link', { name: new RegExp(fr.dashboard.agent.tasksToday) });
    expect(lien).toHaveAttribute('href', '/app/tasks?filter[due]=today&filter[assigned_to]=me');
  });
});
