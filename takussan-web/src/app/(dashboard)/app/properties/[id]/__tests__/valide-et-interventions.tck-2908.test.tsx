import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-2908 — la fiche du bien (maquette `app-biens` a-2) :
 *  · AC4 — la pastille « Validé » se lit sur `approved_at`, distincte du statut et de « En ligne » ; un bien
 *    en attente de modération (ou refusé, ou en brouillon) ne la porte pas, même daté ;
 *  · AC8 — la colonne de droite du bureau rend « 1 intervention en cours » (titre et état de la dernière
 *    ouverte), liée à `/app/maintenance/{id}`, quand `maintenance_summary.open ≥ 1` ; rien à 0.
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
vi.mock('@/components/property-dashboard/fiche/CarteOccupation', () => ({ CarteOccupation: () => null }));
vi.mock('@/components/property-dashboard/PropertyDetailTabs', () => ({ PropertyDetailTabs: () => null }));
vi.mock('@/components/property-dashboard/PropertyHeaderActions', () => ({ PropertyHeaderActions: () => null }));
vi.mock('@/components/property-dashboard/PropertyStatusBadge', () => ({ PropertyStatusBadge: () => null }));
vi.mock('@/components/property-dashboard/PropertyVisibilityBadge', () => ({ PropertyVisibilityBadge: () => null }));
vi.mock('@/components/property-form/PropertyModerationBanner', () => ({ PropertyModerationBanner: () => null }));
vi.mock('@/components/property-dashboard/QuestionDeDisponibilite', () => ({ QuestionDeDisponibilite: () => null }));
vi.mock('@/components/crm/PropertyMatchingCustomers', () => ({ PropertyMatchingCustomers: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: () => null }));

const { default: Page } = await import('../page');

async function fiche(extra: Record<string, unknown>) {
  fetchPropertyMock.mockResolvedValue({
    id: 6, title: 'Villa Ngor', reference_number: 'REF-6', status: 'rented', visibility: 'private',
    location: { city: 'Dakar' }, owner_profile_id: 31, ...extra,
  });
  return render(withIntl(await Page({ params: Promise.resolve({ id: '6' }) })));
}

beforeEach(() => fetchPropertyMock.mockReset());

describe('TCK-2908 (AC4) — « Validé »', () => {
  it('un bien approuvé porte « Validé », au téléphone comme au bureau', async () => {
    await fiche({ approved_at: '2026-07-01T10:00:00Z' });
    const pastilles = screen.getAllByTestId('pastille-valide');
    expect(pastilles).toHaveLength(2);
    for (const p of pastilles) expect(p).toHaveTextContent('Validé');
  });

  it('sans `approved_at`, aucune pastille', async () => {
    await fiche({ approved_at: null });
    expect(screen.queryByTestId('pastille-valide')).toBeNull();
  });

  it('un bien revenu en attente de modération (ou refusé, en brouillon, ou `published`) ne la porte pas, même daté', async () => {
    // `published` : sa pastille de statut dit déjà « Validé » (TCK-2638), la neuve ne la répète pas.
    for (const status of ['pending_review', 'rejected', 'draft', 'published']) {
      const { unmount } = await fiche({ approved_at: '2026-07-01T10:00:00Z', status });
      expect(screen.queryByTestId('pastille-valide'), status).toBeNull();
      unmount();
    }
  });
});

describe('TCK-2908 (AC8) — la carte « N interventions en cours » de la colonne de droite', () => {
  it('open = 1 : la carte, le titre et l’état de la dernière ouverte, liée à son intervention', async () => {
    await fiche({ maintenance_summary: { total: 3, open: 1, latest_open: { id: 44, title: 'Rideau métallique', status: 'quote_requested' } } });
    const colonne = document.querySelector('[data-slot="colonne-occupation"]') as HTMLElement;
    const carte = within(colonne).getByTestId('carte-interventions-en-cours');
    expect(carte).toHaveTextContent('1 intervention en cours');
    expect(carte).toHaveTextContent('Rideau métallique · Devis demandé');
    expect(within(carte).getByRole('link')).toHaveAttribute('href', '/app/maintenance/44');
  });

  it('open = 0, ou résumé absent : aucune carte', async () => {
    const { unmount } = await fiche({ maintenance_summary: { total: 2, open: 0, latest_open: null } });
    expect(screen.queryByTestId('carte-interventions-en-cours')).toBeNull();
    unmount();
    await fiche({});
    expect(screen.queryByTestId('carte-interventions-en-cours')).toBeNull();
  });
});
