import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-999 (P15.06, Q5) — la fiche offre « Changer le titulaire » quand l'API le dit
 * (`abilities.transfer_owner` : l'admin de l'agence, sur un bien que le personnel tient encore), et
 * seulement alors. Rien pour un bien qui a déjà un bailleur pour titulaire.
 */
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agency_admin'] }) }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

const fetchPropertyMock = vi.fn();
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperty: (...a: unknown[]) => fetchPropertyMock(...a),
}));
vi.mock('@/components/property-dashboard/PropertyDetailTabs', () => ({ PropertyDetailTabs: () => null }));
vi.mock('@/components/property-dashboard/PropertyHeaderActions', () => ({ PropertyHeaderActions: () => null }));
vi.mock('@/components/property-dashboard/PropertyStatusBadge', () => ({ PropertyStatusBadge: () => null }));
vi.mock('@/components/property-dashboard/PropertyVisibilityBadge', () => ({ PropertyVisibilityBadge: () => null }));
vi.mock('@/components/property-form/PropertyModerationBanner', () => ({ PropertyModerationBanner: () => null }));
vi.mock('@/components/property-dashboard/QuestionDeDisponibilite', () => ({ QuestionDeDisponibilite: () => null }));
vi.mock('@/components/crm/PropertyMatchingCustomers', () => ({ PropertyMatchingCustomers: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: () => null }));
vi.mock('@/components/property-dashboard/ChangerLeTitulaire', () => ({
  ChangerLeTitulaire: ({ propertyId, agencyId }: { propertyId: number; agencyId: number }) => (
    <p data-testid="changer-le-titulaire">{`${propertyId}@${agencyId}`}</p>
  ),
}));

const { default: Page } = await import('../page');

async function fiche(extra: Record<string, unknown>) {
  fetchPropertyMock.mockResolvedValue({
    id: 9, title: 'Villa Ngor', reference_number: 'REF-9', status: 'available', visibility: 'public',
    location: { city: 'Dakar' }, agency: { id: 3, name: 'Agence Teranga' }, ...extra,
  });
  render(withIntl(await Page({ params: Promise.resolve({ id: '9' }) })));
}

describe('TCK-999 — la fiche offre « Changer le titulaire »', () => {
  it('quand l’API le permet, pour le bien et son agence', async () => {
    await fiche({ abilities: { transfer_owner: true } });
    expect(screen.getByTestId('changer-le-titulaire')).toHaveTextContent('9@3');
  });

  it('jamais quand l’API ne le permet pas, ni quand elle ne le dit pas', async () => {
    await fiche({ abilities: { transfer_owner: false } });
    expect(screen.queryByTestId('changer-le-titulaire')).not.toBeInTheDocument();
  });

  it('jamais sans le bloc des gestes', async () => {
    await fiche({});
    expect(screen.queryByTestId('changer-le-titulaire')).not.toBeInTheDocument();
  });
});
