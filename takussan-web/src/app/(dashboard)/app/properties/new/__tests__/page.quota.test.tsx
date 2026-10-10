import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-627 — une limite d'annonces atteinte se dit à l'ENTRÉE de l'assistant, et non par un 422
 * après six étapes. Une proposition (bailleur hors personnel) ne consomme pas de quota : on ne le
 * lit même pas.
 */

const mockGetMe = vi.fn();
const mockQuota = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({ fetchListingQuotaAction: () => mockQuota() }));
vi.mock('@/components/property-form', () => ({
  PropertyWizard: () => <div data-testid="assistant" />,
}));

import Page from '../page';

describe('/app/properties/new — le quota avant l’assistant (TCK-627)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agency_admin'] });
  });

  it('limite atteinte : un message et la sortie, pas l’assistant', async () => {
    mockQuota.mockResolvedValue({ limit: 5, used: 5, can_create: false });

    render(withIntl(await Page()));

    expect(screen.getByTestId('quota-atteint')).toHaveTextContent('Limite d’annonces atteinte');
    expect(screen.getByRole('link', { name: 'Voir les offres' })).toHaveAttribute('href', '/admin/agency/billing');
    expect(screen.queryByTestId('assistant')).not.toBeInTheDocument();
  });

  it('sous la limite : l’assistant, avec l’usage en sous-titre', async () => {
    mockQuota.mockResolvedValue({ limit: 5, used: 2, can_create: true });

    render(withIntl(await Page()));

    expect(screen.getByTestId('assistant')).toBeInTheDocument();
    expect(screen.queryByTestId('quota-atteint')).not.toBeInTheDocument();
  });

  it('une proposition ne lit pas le quota', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['owner'] });

    render(withIntl(await Page()));

    expect(mockQuota).not.toHaveBeenCalled();
    expect(screen.getByTestId('assistant')).toBeInTheDocument();
  });
});
