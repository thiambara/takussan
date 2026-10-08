import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-594 (AC18, ADR-0039 §7) — l'hôte individuel atteint ses reversements plateforme sans
 * redirection ; seul le bloc d'abonnement reste réservé aux agences `standard`.
 */

const mockGetMe = vi.fn();
const mockResolveAgency = vi.fn();
const mockEnsureStandard = vi.fn();
const mockRedirect = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  ensureStandardAgencyOrRedirect: (...a: unknown[]) => mockEnsureStandard(...a),
  resolveAgencyOrNull: (...a: unknown[]) => mockResolveAgency(...a),
}));
vi.mock('next/navigation', () => ({ redirect: (...a: unknown[]) => mockRedirect(...a) }));
vi.mock('@/components/billing/AgencyBillingClient', () => ({
  AgencyBillingClient: () => <div data-testid="bloc-abonnement" />,
}));
vi.mock('@/components/billing/AgencyPayoutsClient', () => ({
  AgencyPayoutsClient: () => <div data-testid="bloc-reversements" />,
}));

import Page from '../page';
import { PRO_ROUTES } from '@/lib/access/pro-features';

const admin = { id: 1, roles: ['agency_admin'], agency_id: 7 };

describe('/admin/agency/billing — hôte individuel (TCK-594, AC18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue(admin);
  });

  it("n'est plus une route pro", () => {
    expect(PRO_ROUTES.has('/admin/agency/billing')).toBe(false);
  });

  it("une agence individuelle voit ses reversements, sans redirection ni bloc d'abonnement", async () => {
    mockResolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });

    render(withIntl(await Page()));

    expect(screen.getByTestId('bloc-reversements')).toBeInTheDocument();
    expect(screen.queryByTestId('bloc-abonnement')).not.toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockEnsureStandard).not.toHaveBeenCalled();
  });

  it("une agence standard voit aussi son abonnement", async () => {
    mockResolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });

    render(withIntl(await Page()));

    expect(screen.getByTestId('bloc-abonnement')).toBeInTheDocument();
    expect(screen.getByTestId('bloc-reversements')).toBeInTheDocument();
  });
});
