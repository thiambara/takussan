import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-603 (ADR-0036, verif-603 M2) — l'en-tête de la fiche nomme le propriétaire ET l'agent
 * responsable, et lit qui est responsable dans `primary_contact_source`, jamais dans une égalité
 * d'identifiants : l'agent qui a saisi le bien et en est responsable n'y lit pas « aucun ».
 */
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agent'] }) }));
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
vi.mock('@/components/crm/PropertyMatchingCustomers', () => ({ PropertyMatchingCustomers: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: () => null }));

const { default: Page } = await import('../page');

const personne = (id: number, name: string) => ({ id, name, avatar_url: null, is_agent: false, member_since: null });

async function entete(extra: Record<string, unknown>) {
  fetchPropertyMock.mockResolvedValue({
    id: 9, title: 'Villa Ngor', reference_number: 'REF-9', status: 'available', visibility: 'public',
    location: { city: 'Dakar' }, ...extra,
  });
  render(withIntl(await Page({ params: Promise.resolve({ id: '9' }) })));
  return screen.getByRole('banner');
}

describe('TCK-603 — fiche : propriétaire et agent responsable', () => {
  it('nomme les deux, depuis la source du contact', async () => {
    const en = await entete({
      owner: personne(20, 'Fatou Bailleur'), primary_contact: personne(8, 'Awa Diop'), primary_contact_source: 'designated',
    });
    expect(en).toHaveTextContent('Propriétaire : Fatou Bailleur · Agent responsable : Awa Diop');
  });

  it('l’agent qui a saisi le bien et en est responsable n’est pas « aucun »', async () => {
    const awa = personne(8, 'Awa Diop');
    const en = await entete({ owner: awa, primary_contact: awa, primary_contact_source: 'designated' });
    expect(en).toHaveTextContent('Propriétaire : Awa Diop · Agent responsable : Awa Diop');
  });

  it('le repli sur le titulaire se lit « aucun »', async () => {
    const fatou = personne(20, 'Fatou Bailleur');
    const en = await entete({ owner: fatou, primary_contact: fatou, primary_contact_source: 'owner' });
    expect(en).toHaveTextContent('Propriétaire : Fatou Bailleur · Agent responsable : aucun');
  });
});
