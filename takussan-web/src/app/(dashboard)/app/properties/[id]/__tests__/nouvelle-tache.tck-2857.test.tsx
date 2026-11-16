import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-2857 — la fiche d'un bien gagne « Nouvelle tâche » pour le personnel (tête du bureau et feuille
 * « ⋯ » du téléphone) : un lien vers « Tâches », le formulaire ouvert, ce bien rattaché.
 */
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
// La feuille « ⋯ » du téléphone est montée par la coque : on rend ses actions dans la page.
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: ({ actions }: { actions?: React.ReactNode }) => <div data-testid="feuille-du-telephone">{actions}</div> }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
const moi = vi.hoisted(() => ({ roles: ['agency_admin'] as string[] }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: moi.roles }) }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

const fetchPropertyMock = vi.fn();
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperty: (...a: unknown[]) => fetchPropertyMock(...a),
}));
// TCK-2639 — la carte « Occupation » lit l'API (React Query) : hors du sujet de ce test.
vi.mock('@/components/property-dashboard/fiche/CarteOccupation', () => ({ CarteOccupation: () => null }));
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

describe('TCK-2857 — « Nouvelle tâche » depuis la fiche d’un bien', () => {
  beforeEach(() => {
    moi.roles = ['agency_admin'];
  });

  it('AC4 — le personnel : au bureau et au téléphone, un lien vers le formulaire, ce bien rattaché', async () => {
    await fiche({});
    const liens = screen.getAllByRole('link', { name: 'Nouvelle tâche' });
    expect(liens).toHaveLength(2);
    for (const l of liens) expect(l).toHaveAttribute('href', '/app/tasks?nouvelle=1&pour=property:9');
    expect(screen.getAllByTestId('feuille-du-telephone').some((f) => f.contains(liens[0]!))).toBe(true);
  });

  it('le bailleur ne l’a pas', async () => {
    moi.roles = ['owner'];
    await fiche({});
    expect(screen.queryByRole('link', { name: 'Nouvelle tâche' })).not.toBeInTheDocument();
  });
});
