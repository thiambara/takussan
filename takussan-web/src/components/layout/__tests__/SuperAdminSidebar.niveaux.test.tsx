import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes, SUPER_ADMIN } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { NAV_GROUPS, SuperAdminSidebar } from '../SuperAdminSidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/super-admin' }));
vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAgencyUpgradePendingCount: vi.fn().mockResolvedValue(0),
  fetchAdminKycQueue: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  fetchFailedJobs: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  fetchModerationQueue: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
}));

/**
 * TCK-600 (ADR-0047) — la console n'affiche à un opérateur que les entrées de son niveau. Les
 * gestes sont ceux que l'API rend pour chaque niveau (`PlatformAbility::forLevel`).
 */
const VIEWER: PlatformAbilities = {
  level: 'viewer',
  abilities: ['platform.console.access', 'platform.reports.view', 'platform.health.view', 'platform.agencies.view'],
};
const SUPPORT: PlatformAbilities = {
  level: 'support',
  abilities: [
    ...VIEWER.abilities,
    'platform.users.view',
    'platform.users.support',
    'platform.users.block',
    'platform.moderation.view',
    'platform.search.global',
  ],
};

function liens(value?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        {value ? avecGestes(<SuperAdminSidebar />, value) : <SuperAdminSidebar />}
      </QueryClientProvider>,
    ),
  );
  const nav = screen.getByRole('navigation');
  const hrefs = within(nav).queryAllByRole('link').map((a) => a.getAttribute('href'));
  unmount();
  return hrefs;
}

describe('SuperAdminSidebar — filtrée par niveau (TCK-600)', () => {
  it('un viewer ne voit que la console, les rapports, les agences et la santé', () => {
    expect(liens(VIEWER)).toEqual([
      '/super-admin',
      '/super-admin/reports',
      '/super-admin/agencies',
      '/super-admin/system',
      '/super-admin/system/health',
      '/super-admin/system/scheduler',
    ]);
  });

  it('un support voit en plus les utilisateurs et la modération, jamais les paramètres ni les opérateurs', () => {
    const vus = liens(SUPPORT);
    expect(vus).toContain('/super-admin/users');
    expect(vus).toContain('/super-admin/moderation');
    for (const reserve of ['/super-admin/settings', '/super-admin/super-admins', '/super-admin/kyc', '/super-admin/system/jobs']) {
      expect(vus).not.toContain(reserve);
    }
  });

  it('un super_admin voit tout', () => {
    const toutes = NAV_GROUPS.flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]));
    expect(liens(SUPER_ADMIN)).toEqual(toutes);
  });

  it('hors fournisseur, rien : le refus est le défaut', () => {
    expect(liens()).toEqual([]);
  });
});
