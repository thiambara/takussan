import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-2432 — la fiche du bien porte la question de disponibilité (l'annonce d'origine d'un bien publié par le Radar a
 * disparu) ; le composant ne rend rien sans question ouverte (`QuestionDeDisponibilite.tck-2432.test.tsx`).
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
vi.mock('@/components/property-dashboard/QuestionDeDisponibilite', () => ({
  QuestionDeDisponibilite: ({ propertyId }: { propertyId: number }) => (
    <p data-testid="question-de-disponibilite">{propertyId}</p>
  ),
}));
vi.mock('@/components/crm/PropertyMatchingCustomers', () => ({ PropertyMatchingCustomers: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: () => null }));
vi.mock('@/components/property-dashboard/ChangerLeTitulaire', () => ({ ChangerLeTitulaire: () => null }));

const { default: Page } = await import('../page');

describe('TCK-2432 — la fiche porte la question de disponibilité', () => {
  it('pour le bien affiché', async () => {
    fetchPropertyMock.mockResolvedValue({
      id: 9, title: 'Villa Ngor', reference_number: 'REF-9', status: 'available', visibility: 'public',
      location: { city: 'Dakar' }, agency: { id: 3, name: 'Agence Teranga' },
    });
    render(withIntl(await Page({ params: Promise.resolve({ id: '9' }) })));
    expect(screen.getByTestId('question-de-disponibilite')).toHaveTextContent('9');
  });
});
