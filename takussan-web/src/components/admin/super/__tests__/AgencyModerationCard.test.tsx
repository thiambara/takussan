import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import { avecGestes, SUPER_ADMIN } from '@/test/habilitations';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { AgencyModerationCard } from '../AgencyModerationCard';
import type { AdminAgency } from '@/types/super-admin';

function renderCard(agency: AdminAgency, gestes: PlatformAbilities = SUPER_ADMIN) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<AgencyModerationCard agency={agency} />, gestes)}
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
    // TCK-600 (ADR-0048 §6) — une agence suspendue n'a qu'une sortie, avec motif.
    ['suspended', false, ['Lever la suspension']],
    ['suspended', true, ['Lever la suspension']],
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
      .filter((l): l is string => ['Vérifier', 'Suspendre', 'Dévérifier', 'Lever la suspension'].includes(l ?? ''));
    expect(actions).toEqual(attendues);
  });

  it('un viewer ne voit aucune action de modération (TCK-600)', () => {
    renderCard(AGENCE_ACTIVE, { level: 'viewer', abilities: ['platform.console.access', 'platform.agencies.view'] });
    expect(screen.queryByRole('button', { name: 'Suspendre' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vérifier' })).toBeNull();
  });

  it('suspendre exige un motif, qui part dans le corps de la requête (TCK-600)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderCard(AGENCE_ACTIVE);
    const u = userEvent.setup();

    await u.click(screen.getByRole('button', { name: 'Suspendre' }));
    await u.type(screen.getByTestId('confirm-action-input'), 'SUSPENDRE');
    expect(screen.getByTestId('confirm-action-submit')).toBeDisabled();

    await u.type(screen.getByTestId('confirm-action-reason'), 'Plaintes répétées de locataires.');
    await u.click(screen.getByTestId('confirm-action-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/super-admin/agencies/13/suspend');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Plaintes répétées de locataires.' });
    vi.unstubAllGlobals();
  });

  it('lever la suspension passe par `reinstate`, avec motif (TCK-600)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderCard({ ...AGENCE_ACTIVE, status: 'suspended' });
    const u = userEvent.setup();

    await u.click(screen.getByRole('button', { name: 'Lever la suspension' }));
    await u.type(screen.getByTestId('confirm-action-reason'), 'Enquête close.');
    await u.type(screen.getByTestId('confirm-action-input'), 'LEVER');
    await u.click(screen.getByTestId('confirm-action-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/super-admin/agencies/13/reinstate');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Enquête close.' });
    vi.unstubAllGlobals();
  });
});

const AGENCE_ACTIVE: AdminAgency = {
  id: 13,
  name: 'Agence test',
  slug: 'agence-test',
  status: 'active',
  is_verified: true,
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
} as AdminAgency;
