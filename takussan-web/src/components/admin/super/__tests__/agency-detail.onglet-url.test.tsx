/**
 * P168.05 — le détail d'agence de la console lit et écrit `?tab=`, borné à ses cinq onglets, le
 * défaut `kyc` hors de l'URL ; le lien « agence » du profil utilisateur mène à `?tab=team`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { AdminUserDetail } from '@/types/super-admin';
import { AGENCY_DETAIL_TABS, AgencyDetailPage } from '../agency-detail';
import { UserProfilesSection } from '../user-detail';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), query: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.query),
  usePathname: () => '/super-admin/agencies/12',
}));

vi.mock('@/lib/queries/super-admin', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchAdminAgencyDetail: vi.fn(async () => ({
    data: {
      id: 12,
      name: 'Dakar Immo',
      slug: 'dakar-immo',
      status: 'active',
      is_verified: true,
      verified_at: null,
      primary_admin_id: null,
      license_number: null,
      email: null,
      phone: null,
      logo_url: null,
      properties_count: 0,
      members_count: 1,
      created_at: '2026-01-15T10:00:00+00:00',
      last_activity_at: null,
      website: null,
      description: null,
      commission_rate: null,
      currency: 'XOF',
      founded_at: null,
      public_url: '/agences/dakar-immo',
      primary_admin: null,
      address: null,
      suspension: null,
    },
  })),
  fetchAdminAgencyHealth: vi.fn(async () => ({ data: undefined })),
  fetchAdminAgencyTeam: vi.fn(async () => ({
    data: [{ id: 1, full_name: 'Awa Ndiaye', email: 'awa@example.test', roles: ['agent'] }],
  })),
  fetchAdminAgencyProperties: vi.fn(async () => ({ data: [] })),
  fetchAdminAgencyKyc: vi.fn(async () => ({ data: undefined })),
}));

vi.mock('@/components/billing/AdminAgencySubscriptionPanel', () => ({
  AdminAgencySubscriptionPanel: () => <div data-testid="panneau-abonnement" />,
}));

function rendre(noeud: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{avecGestes(noeud)}</QueryClientProvider>));
}

describe('détail d’agence — onglet dans `?tab=` (P168.05)', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.query = '';
  });

  it('ouvre l’onglet Équipe sur `?tab=team`', async () => {
    navigation.query = 'tab=team';
    rendre(<AgencyDetailPage agencyId={12} />);
    expect(await screen.findByText('Awa Ndiaye')).toBeInTheDocument();
    const choisi = screen.getAllByRole('tab').find((o) => o.getAttribute('aria-selected') === 'true');
    expect(choisi).toBe(screen.getAllByRole('tab')[AGENCY_DETAIL_TABS.indexOf('team')]);
  });

  it('retombe sur le KYC pour une valeur inconnue', async () => {
    navigation.query = 'tab=inconnu';
    rendre(<AgencyDetailPage agencyId={12} />);
    const onglets = await screen.findAllByRole('tab');
    expect(onglets[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Awa Ndiaye')).toBeNull();
  });

  it('écrit le changement d’onglet par `replace`, le KYC hors de l’URL', async () => {
    const user = userEvent.setup();
    navigation.query = 'tab=team';
    rendre(<AgencyDetailPage agencyId={12} />);
    const onglets = await screen.findAllByRole('tab');

    await user.click(onglets[AGENCY_DETAIL_TABS.indexOf('subscription')]);
    expect(navigation.replace).toHaveBeenLastCalledWith('?tab=subscription');

    await user.click(onglets[0]);
    expect(navigation.replace).toHaveBeenLastCalledWith('?');
  });
});

describe('profil utilisateur — lien vers l’équipe de l’agence (P168.05)', () => {
  it('mène à `?tab=team`', () => {
    const user = {
      id: 7,
      roles: [],
      profiles: { agent: [{ id: 4, agency_id: 12, agency_name: 'Dakar Immo', status: 'active' }], owner: [], service_provider: null },
      agencies: [],
    } as unknown as AdminUserDetail;
    rendre(<UserProfilesSection user={user} />);
    const liens = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(liens).toContain('/super-admin/agencies/12?tab=team');
  });
});
