import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-2639 (AC7) — ouverte par le bailleur, la fiche ne rend aucun geste réservé au personnel : ni les
 * clients correspondants (le rapprochement, TCK-591), ni la place réservée de « Planifier une visite »
 * (la place tenue au serveur est celle du personnel ; le bouton lui-même se juge par `usePersonnelActif`,
 * cf. `PlanifierUneVisite.place-reservee.tck-2639.test.tsx`). « Encaisser » et le nom du locataire sont
 * éprouvés dans `fiche/__tests__/FicheDuBien.tck-2639.test.tsx`.
 */
const moi = vi.hoisted(() => ({ roles: ['owner'] as string[] }));
const planifier = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: moi.roles }) }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperty: async () => ({
    id: 9, title: 'Villa Ngor', reference_number: 'REF-9', status: 'rented', visibility: 'public',
    location: { city: 'Dakar' }, agency: { id: 3, name: 'Agence Teranga' }, contract_type: 'rent',
  }),
}));
vi.mock('@/components/property-dashboard/fiche/CarteOccupation', () => ({ CarteOccupation: () => null }));
vi.mock('@/components/property-dashboard/PropertyDetailTabs', () => ({ PropertyDetailTabs: () => null }));
vi.mock('@/components/property-dashboard/PropertyHeaderActions', () => ({ PropertyHeaderActions: () => null }));
vi.mock('@/components/property-dashboard/PropertyStatusBadge', () => ({ PropertyStatusBadge: () => null }));
vi.mock('@/components/property-dashboard/PropertyVisibilityBadge', () => ({ PropertyVisibilityBadge: () => null }));
vi.mock('@/components/property-form/PropertyModerationBanner', () => ({ PropertyModerationBanner: () => null }));
vi.mock('@/components/property-dashboard/QuestionDeDisponibilite', () => ({ QuestionDeDisponibilite: () => null }));
vi.mock('@/components/crm/PropertyMatchingCustomers', () => ({
  PropertyMatchingCustomers: () => <section data-testid="clients-correspondants" />,
}));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({
  PlanifierUneVisite: ({ placeReservee }: { placeReservee?: boolean }) => {
    planifier(placeReservee);
    return null;
  },
}));

const { default: Page } = await import('../page');

async function fiche(roles: string[]) {
  moi.roles = roles;
  render(withIntl(await Page({ params: Promise.resolve({ id: '9' }) })));
}

beforeEach(() => planifier.mockClear());

describe('TCK-2639 (AC7) — la fiche ouverte par le bailleur', () => {
  it('ne rend ni les clients correspondants ni la place réservée de « Planifier une visite »', async () => {
    await fiche(['owner']);
    expect(screen.queryByTestId('clients-correspondants')).not.toBeInTheDocument();
    expect(planifier).toHaveBeenCalled();
    expect(planifier.mock.calls.every(([place]) => place === false)).toBe(true);
  });

  it('le personnel, lui, a les clients correspondants et la place de son geste tenue au bureau', async () => {
    await fiche(['agent']);
    expect(screen.getByTestId('clients-correspondants')).toBeInTheDocument();
    expect(planifier.mock.calls.some(([place]) => place === true)).toBe(true);
  });
});
