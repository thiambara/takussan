import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { fetchAuditLog } from '@/lib/queries/super-admin';
import { ConsoleRecentActivity } from '../ConsoleRecentActivity';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({ fetchAuditLog: vi.fn() }));

const entree = (id: number) => ({
  id,
  log_name: 'Admin',
  event: 'super_admin_setting_updated',
  description: `Paramètre ${id} modifié`,
  causer_type: 'App\\Models\\User',
  causer_id: 7,
  subject_type: null,
  subject_id: null,
  properties: null,
  created_at: '2026-08-27T09:00:00+00:00',
});

function renderActivity(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>));
}

describe('ConsoleRecentActivity (TCK-360)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('demande CINQ entrées et les rend, avec le lien vers l’audit complet', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({
      data: [1, 2, 3, 4, 5].map(entree),
      meta: { total: 42, current_page: 1, last_page: 9, per_page: 5 },
    });

    renderActivity(<ConsoleRecentActivity />);

    const liste = await screen.findByTestId('super-admin-recent-activity');
    expect(liste.querySelectorAll('li')).toHaveLength(5);
    expect(fetchAuditLog).toHaveBeenCalledWith({ perPage: 5 });
    expect(screen.getByRole('link', { name: /audit/i })).toHaveAttribute('href', '/super-admin/audit');
  });

  it('rend un état vide plutôt qu’une liste vide', async () => {
    vi.mocked(fetchAuditLog).mockResolvedValue({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 5 },
    });

    renderActivity(<ConsoleRecentActivity />);

    expect(await screen.findByText('Aucune activité enregistrée')).toBeInTheDocument();
    expect(screen.queryByTestId('super-admin-recent-activity')).not.toBeInTheDocument();
  });
});
