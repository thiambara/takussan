import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * Vérification adverse de TCK-2639 (d1) — le nom du bailleur ne mène à sa fiche (`/app/owners/{id}`)
 * que pour qui cette page s'ouvre : l'admin d'agence (`assertCanReachOwnerAccount`). Le super-admin
 * recevait le lien (`isAdmin`), et la page le renvoyait en 307 vers `/app`. Le carnet, la garde de
 * la page et la fiche du bien lisent désormais un seul prédicat (`ouvreLaFicheDuBailleur`).
 */
const ROLES = vi.hoisted(() => ({ valeur: ['agency_admin'] as string[] }));
const RECU = vi.hoisted(() => ({ onglets: [] as unknown[], occupation: [] as unknown[] }));

vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ROLES.valeur }) }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

const fetchPropertyMock = vi.fn();
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperty: (...a: unknown[]) => fetchPropertyMock(...a),
}));
vi.mock('@/components/property-dashboard/fiche/CarteOccupation', () => ({
  CarteOccupation: (props: { lienVersLeBailleur: boolean }) => {
    RECU.occupation.push(props.lienVersLeBailleur);
    return null;
  },
}));
vi.mock('@/components/property-dashboard/PropertyDetailTabs', () => ({
  PropertyDetailTabs: (props: { lienVersLeBailleur?: boolean }) => {
    RECU.onglets.push(props.lienVersLeBailleur);
    return null;
  },
}));
vi.mock('@/components/property-dashboard/PropertyHeaderActions', () => ({ PropertyHeaderActions: () => null }));
vi.mock('@/components/property-dashboard/PropertyStatusBadge', () => ({ PropertyStatusBadge: () => null }));
vi.mock('@/components/property-dashboard/PropertyVisibilityBadge', () => ({ PropertyVisibilityBadge: () => null }));
vi.mock('@/components/property-form/PropertyModerationBanner', () => ({ PropertyModerationBanner: () => null }));
vi.mock('@/components/property-dashboard/QuestionDeDisponibilite', () => ({ QuestionDeDisponibilite: () => null }));
vi.mock('@/components/crm/PropertyMatchingCustomers', () => ({ PropertyMatchingCustomers: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: () => null }));

const { default: Page } = await import('../page');

async function lienPour(roles: string[]) {
  ROLES.valeur = roles;
  RECU.onglets = [];
  RECU.occupation = [];
  fetchPropertyMock.mockResolvedValue({
    id: 6, title: 'Villa Ngor', reference_number: 'REF-6', status: 'available', visibility: 'public',
    location: { city: 'Dakar' }, owner_profile_id: 31,
  });
  render(withIntl(await Page({ params: Promise.resolve({ id: '6' }) })));
  return { onglets: RECU.onglets, occupation: RECU.occupation };
}

beforeEach(() => fetchPropertyMock.mockReset());

describe('TCK-2639 (d1) — le lien vers la fiche du bailleur suit la garde de cette fiche', () => {
  it('l’admin d’agence reçoit le lien', async () => {
    expect(await lienPour(['agency_admin'])).toEqual({ onglets: [true], occupation: [true] });
  });

  it('le super-admin ne le reçoit pas : /app/owners/{id} le renverrait vers /app', async () => {
    expect(await lienPour(['super_admin'])).toEqual({ onglets: [false], occupation: [false] });
  });

  it('l’agent ne le reçoit pas', async () => {
    expect(await lienPour(['agent'])).toEqual({ onglets: [false], occupation: [false] });
  });
});
