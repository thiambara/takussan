import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes, SUPER_ADMIN } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { SuperAdminSidebar } from '../SuperAdminSidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/super-admin/settings' }));
vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAgencyUpgradePendingCount: vi.fn().mockResolvedValue(0),
  fetchAdminKycQueue: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  fetchFailedJobs: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  fetchModerationQueue: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
}));

/** Les gestes d'un `support` (`PlatformAbility::forLevel`), comme dans `SuperAdminSidebar.niveaux.test`. */
const SUPPORT: PlatformAbilities = {
  level: 'support',
  abilities: [
    'platform.console.access', 'platform.reports.view', 'platform.health.view', 'platform.agencies.view',
    'platform.users.view', 'platform.users.support', 'platform.users.block', 'platform.moderation.view',
    'platform.search.global',
  ],
};

function monter(value: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>{avecGestes(<SuperAdminSidebar />, value)}</QueryClientProvider>,
  ));
  return within(screen.getByRole('navigation'));
}

/**
 * TCK-651 (ADR-0065) — l'éditeur brut de la table `settings` (`/super-admin/settings/global`,
 * TCK-648) a disparu : la portée `global` s'écrit au catalogue, à « Paramètres », et seulement là.
 * Aucune entrée du menu ne mène plus à l'ancienne page, pour aucun niveau d'opérateur.
 */
describe('SuperAdminSidebar — paramètres (TCK-651)', () => {
  it.each([['super_admin', SUPER_ADMIN], ['support', SUPPORT]] as const)(
    'un %s ne trouve aucun lien vers l’éditeur brut supprimé',
    (_niveau, gestes) => {
      const nav = monter(gestes);

      const cibles = nav.queryAllByRole('link').map((lien) => lien.getAttribute('href'));
      expect(cibles.length).toBeGreaterThan(0);
      expect(cibles).not.toContain('/super-admin/settings/global');
      expect(nav.queryByRole('link', { name: 'Paramètres globaux' })).not.toBeInTheDocument();
    },
  );

  it('un super_admin trouve « Paramètres », la page du catalogue, sans enfant', () => {
    const nav = monter(SUPER_ADMIN);

    const parametres = nav.getByRole('link', { name: 'Paramètres' });
    expect(parametres).toHaveAttribute('href', '/super-admin/settings');
    expect(parametres).toHaveAttribute('aria-current', 'page');
    expect(within(parametres.parentElement as HTMLElement).getAllByRole('link')).toHaveLength(1);
  });
});
