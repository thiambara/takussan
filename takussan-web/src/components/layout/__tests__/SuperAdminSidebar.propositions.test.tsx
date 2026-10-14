import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes, SUPER_ADMIN } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { SuperAdminSidebar } from '../SuperAdminSidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/super-admin/tags/proposals' }));
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

/** TCK-633 (AC5) — les deux files de propositions ont une entrée de menu, au `super_admin` seul. */
describe('SuperAdminSidebar — files de propositions (TCK-633)', () => {
  it('un super_admin les trouve sous « Contenu » : les équipements proposés sous « Tags »', () => {
    const nav = monter(SUPER_ADMIN);

    expect(nav.getByRole('link', { name: 'Quartiers proposés' })).toHaveAttribute('href', '/super-admin/geo');
    const equipements = nav.getByRole('link', { name: 'Équipements proposés' });
    expect(equipements).toHaveAttribute('href', '/super-admin/tags/proposals');
    expect(equipements).toHaveAttribute('aria-current', 'page');
    // Un ENFANT de « Tags » : rendu dans son bloc, et le parent n'est pas la page courante.
    const tags = nav.getByRole('link', { name: 'Tags' });
    expect(tags.parentElement).toContainElement(equipements);
    expect(tags).not.toHaveAttribute('aria-current');
  });

  it('un support ne les voit pas : les routes `admin/geo` et `admin/tags` ne déclarent aucun geste', () => {
    const nav = monter(SUPPORT);

    expect(nav.queryByRole('link', { name: 'Quartiers proposés' })).not.toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Équipements proposés' })).not.toBeInTheDocument();
  });
});
