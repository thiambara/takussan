import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-2602 — la page dit à l'assistant que l'espace est PARTICULIER seulement quand elle l'a lu :
 * la publication mène alors à « Votre annonce est en ligne ». Une agence `standard` ou illisible garde
 * la sortie d'avant (toast et fiche, AC2).
 */
const mockGetMe = vi.fn();
const mockAgence = vi.fn();

// P152.03 — l'admin du rôle système porte `properties.create`.
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => ['properties.create'] }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => ({ limit: null, used: 0, can_create: true }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => mockAgence(...args),
}));
vi.mock('@/components/property-form/PropertyWizard', () => ({
  PropertyWizard: ({ espaceParticulier }: { espaceParticulier?: boolean }) => (
    <div data-testid="assistant" data-particulier={String(espaceParticulier)} />
  ),
}));

import Page from '../page';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMe.mockResolvedValue({ id: 1, roles: ['agency_admin'], agency_id: 9 });
});

describe('/app/properties/new — l’espace particulier (TCK-2602)', () => {
  it.each([
    ['individual', 'true'],
    ['standard', 'false'],
  ])('agence %s → espaceParticulier %s', async (kind, attendu) => {
    mockAgence.mockResolvedValue({ id: 9, kind });
    render(withIntl(await Page()));
    expect(screen.getByTestId('assistant')).toHaveAttribute('data-particulier', attendu);
  });

  it('une agence illisible : la sortie d’avant', async () => {
    mockAgence.mockResolvedValue(null);
    render(withIntl(await Page()));
    expect(screen.getByTestId('assistant')).toHaveAttribute('data-particulier', 'false');
  });
});
