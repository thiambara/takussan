import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes, SUPER_ADMIN } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { SuperAdminSidebar } from '../SuperAdminSidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/super-admin/settings/global' }));
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
 * TCK-648 — l'éditeur de la table `settings` quitte `/admin/settings` : son entrée vit dans la
 * console, SOUS « Paramètres » (la page des paramètres plateforme), dont elle est la voisine.
 */
describe('SuperAdminSidebar — paramètres globaux (TCK-648)', () => {
  it('un super_admin la trouve sous « Paramètres », et c’est la page courante', () => {
    const nav = monter(SUPER_ADMIN);

    const globaux = nav.getByRole('link', { name: 'Paramètres globaux' });
    expect(globaux).toHaveAttribute('href', '/super-admin/settings/global');
    expect(globaux).toHaveAttribute('aria-current', 'page');
    // Un ENFANT de « Paramètres » : rendu dans son bloc, et le parent n'est pas la page courante.
    const parametres = nav.getByRole('link', { name: 'Paramètres' });
    expect(parametres).toHaveAttribute('href', '/super-admin/settings');
    expect(parametres.parentElement).toContainElement(globaux);
    expect(parametres).not.toHaveAttribute('aria-current');
  });

  it('un support ne la voit pas : `/api/settings` ne sert la table entière qu’au super_admin', () => {
    const nav = monter(SUPPORT);

    expect(nav.queryByRole('link', { name: 'Paramètres globaux' })).not.toBeInTheDocument();
  });
});
