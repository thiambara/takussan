import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-1000 (P15.06, Q2) — la fiche d'un bien saisi pour un bailleur invité porte « En attente de
 * <nom> » tant que l'invitation court. L'API n'émet `pending_owner` qu'au personnel de l'agence du
 * bien ; la fiche ne fait que le rendre.
 */
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
// Le mock partagé ne remplace pas les paramètres : ici le nom est ce qu'on vérifie.
vi.mock('next-intl/server', async () => {
  const base = (await import('@/test/intl')).mockTraductionsServeur();
  return {
    ...base,
    getTranslations: async (namespace?: string) => {
      const t = await base.getTranslations(namespace);
      return (cle: string, params?: Record<string, unknown>) =>
        t(cle).replace(/\{(\w+)\}/g, (brut, nom: string) => (params && nom in params ? String(params[nom]) : brut));
    },
  };
});
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
vi.mock('@/components/property-dashboard/ChangerLeTitulaire', () => ({ ChangerLeTitulaire: () => null }));

const { default: Page } = await import('../page');

async function fiche(extra: Record<string, unknown>) {
  fetchPropertyMock.mockResolvedValue({
    id: 9, title: 'Villa Ngor', reference_number: 'REF-9', status: 'available', visibility: 'public',
    location: { city: 'Dakar' }, agency: { id: 3, name: 'Agence Teranga' }, ...extra,
  });
  render(withIntl(await Page({ params: Promise.resolve({ id: '9' }) })));
}

describe('TCK-1000 — la fiche dit le bailleur invité en attente', () => {
  it('« En attente de <nom> » quand l’API le donne', async () => {
    await fiche({ pending_owner: { profile_id: 604, name: 'Awa Diop' } });
    expect(screen.getByTestId('bailleur-en-attente')).toHaveTextContent(
      "En attente de Awa Diop : le bien lui passera quand l'invitation sera acceptée.",
    );
  });

  it('rien sans bailleur en attente', async () => {
    await fiche({ pending_owner: null });
    expect(screen.queryByTestId('bailleur-en-attente')).not.toBeInTheDocument();
  });
});
