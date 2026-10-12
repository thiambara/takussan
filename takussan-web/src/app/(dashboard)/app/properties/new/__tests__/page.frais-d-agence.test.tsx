import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-633 — un indépendant (agence `individual`) ne facture pas de frais d'agence : la page lit le
 * type de l'agence et le dit à l'assistant. Lecture d'AFFICHAGE : une agence illisible ne bloque
 * rien, elle garde le champ (l'API reste juge, tâche 8).
 */
const mockGetMe = vi.fn();
const mockAgence = vi.fn();

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
vi.mock('@/components/property-form', () => ({
  PropertyWizard: ({ fraisDAgence }: { fraisDAgence?: boolean }) => (
    <div data-testid="assistant" data-frais={String(fraisDAgence)} />
  ),
}));

import Page from '../page';

describe('/app/properties/new — les frais d’agence selon le type d’agence (TCK-633)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('un indépendant : pas de frais d’agence', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agency_admin'], agency_id: 9 });
    mockAgence.mockResolvedValue({ id: 9, kind: 'individual' });

    render(withIntl(await Page()));

    expect(screen.getByTestId('assistant')).toHaveAttribute('data-frais', 'false');
    expect(mockAgence).toHaveBeenCalledWith('jeton', 9, expect.any(String), 'affichage');
  });

  it('une agence standard : les frais d’agence', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent'], agency_id: 9 });
    mockAgence.mockResolvedValue({ id: 9, kind: 'standard' });

    render(withIntl(await Page()));

    expect(screen.getByTestId('assistant')).toHaveAttribute('data-frais', 'true');
  });

  it('une agence illisible garde le champ : l’affichage dégrade, il ne bloque pas', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agent'], agency_id: 9 });
    mockAgence.mockResolvedValue(null);

    render(withIntl(await Page()));

    expect(screen.getByTestId('assistant')).toHaveAttribute('data-frais', 'true');
  });

  it('sans agence, aucune lecture', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['owner'] });

    render(withIntl(await Page()));

    expect(mockAgence).not.toHaveBeenCalled();
    expect(screen.getByTestId('assistant')).toHaveAttribute('data-frais', 'true');
  });
});
