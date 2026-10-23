import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { AgencyDetailPage } from '../agency-detail';

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

/**
 * TCK-1742 (P168.04) — le retour du détail d'agence menait toujours à `/super-admin/agencies`, nu :
 * la liste revenait à « toutes », quel que soit le filtre quitté. La liste passe sa requête dans
 * `?liste=`, et le retour la rend, réduite aux filtres connus.
 */
describe('détail d’agence — le retour rend la liste quittée (TCK-1742)', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.query = '';
  });

  it('rend la requête de la liste au lien de retour', async () => {
    navigation.query = `tab=team&liste=${encodeURIComponent('status=suspended&is_verified=1')}`;
    rendre(<AgencyDetailPage agencyId={12} />);

    const retour = await screen.findByRole('link', { name: 'Retour aux agences' });
    expect(retour).toHaveAttribute('href', '/super-admin/agencies?status=suspended&is_verified=1');
  });

  it('ne recopie que les filtres connus, bornés', async () => {
    navigation.query = `liste=${encodeURIComponent('status=bidon&redirect=https://ailleurs.test&is_verified=0')}`;
    rendre(<AgencyDetailPage agencyId={12} />);

    const retour = await screen.findByRole('link', { name: 'Retour aux agences' });
    expect(retour).toHaveAttribute('href', '/super-admin/agencies?is_verified=0');
  });

  it('sans `?liste=`, mène à la liste nue', async () => {
    rendre(<AgencyDetailPage agencyId={12} />);

    const retour = await screen.findByRole('link', { name: 'Retour aux agences' });
    expect(retour).toHaveAttribute('href', '/super-admin/agencies');
  });
});
