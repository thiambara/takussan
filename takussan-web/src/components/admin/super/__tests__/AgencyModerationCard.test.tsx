import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withIntl } from '@/test/intl';
import { AgencyModerationCard } from '../AgencyModerationCard';
import type { AdminAgency } from '@/types/super-admin';

function renderCard(agency: AdminAgency) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <AgencyModerationCard agency={agency} />
    </QueryClientProvider>,
  ));
}

describe('AgencyModerationCard', () => {
  it('renders logo, counters, creation date and last activity', () => {
    renderCard({
      id: 12,
      name: 'Dakar Immo',
      slug: 'dakar-immo',
      status: 'active',
      is_verified: true,
      verified_at: '2026-05-01T10:00:00+00:00',
      primary_admin_id: 4,
      license_number: 'LIC-221',
      email: 'contact@dakar.test',
      phone: '+221770000000',
      logo_url: 'https://cdn.test/logo.png',
      properties_count: 18,
      members_count: 7,
      created_at: '2026-01-15T10:00:00+00:00',
      last_activity_at: '2026-05-08T12:00:00+00:00',
    });

    expect(screen.getByRole('link', { name: 'Dakar Immo' })).toHaveAttribute('href', '/super-admin/agencies/12');
    expect(screen.getByText('contact@dakar.test')).toBeInTheDocument();
    expect(screen.getByText('LIC-221')).toBeInTheDocument();
    expect(screen.getByText('Membres')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Biens')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('15 janv. 2026')).toBeInTheDocument();
    expect(screen.getByText('08 mai 2026')).toBeInTheDocument();
  });

  // Revue design 2026-09-16 : la carte ne propose que les transitions qui changent quelque chose.
  // `unverify` passe aussi l'agence à `inactive` (API) : c'est la seule voie vers ce statut.
  it.each([
    ['active', true, ['Suspendre', 'Dévérifier']],
    ['active', false, ['Vérifier', 'Suspendre', 'Dévérifier']],
    ['suspended', false, ['Vérifier', 'Dévérifier']],
    ['inactive', false, ['Vérifier', 'Suspendre']],
    ['inactive', true, ['Vérifier', 'Suspendre', 'Dévérifier']],
  ] as const)('statut %s, vérifiée %s → actions %j', (status, isVerified, attendues) => {
    renderCard({
      id: 13,
      name: 'Agence test',
      slug: 'agence-test',
      status,
      is_verified: isVerified,
      verified_at: null,
      primary_admin_id: null,
      license_number: null,
      email: null,
      phone: null,
      logo_url: null,
      properties_count: 0,
      members_count: 0,
      created_at: '2026-01-15T10:00:00+00:00',
      last_activity_at: null,
    } as AdminAgency);

    const actions = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim())
      .filter((l): l is string => ['Vérifier', 'Suspendre', 'Dévérifier'].includes(l ?? ''));
    expect(actions).toEqual(attendues);
  });
});
