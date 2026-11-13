import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-2678 (ADR-0097 § 5), AC4 — sous « Hors ligne », la fiche dit pourquoi : une phrase par motif que
 * l'API a jugé (`offline_reasons`), dans son ordre ; rien pour un bien en ligne, et jamais « Publié ».
 * Le statut et la visibilité sont rendus muets ici : le motif ne se recompose pas à partir d'eux.
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
vi.mock('@/components/property-dashboard/ChangerLeTitulaire', () => ({ ChangerLeTitulaire: () => null }));

const { default: Page } = await import('../page');

async function fiche(extra: Record<string, unknown>) {
  fetchPropertyMock.mockResolvedValue({
    id: 9, title: 'Villa Ngor', reference_number: 'REF-9', status: 'rented', visibility: 'public',
    location: { city: 'Dakar' }, agency: { id: 3, name: 'Agence Teranga' }, ...extra,
  });
  render(withIntl(await Page({ params: Promise.resolve({ id: '9' }) })));
}

const listes = () => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="motifs-hors-ligne"]'));

describe('TCK-2678 — la fiche dit pourquoi le bien est hors ligne', () => {
  it('AC4 — un bien loué : « Loué — … » sous « Hors ligne », au téléphone comme au bureau, sans « Publié »', async () => {
    await fiche({ is_online: false, offline_reasons: ['status_rented'] });
    expect(screen.getAllByText('Hors ligne').length).toBeGreaterThan(0);
    expect(listes()).toHaveLength(2);
    for (const liste of listes()) {
      expect(liste).toHaveTextContent('Loué — remis en ligne à la fin du bail.');
      expect(liste.previousElementSibling?.textContent ?? '').toContain('Hors ligne');
    }
    expect(document.body.textContent).not.toMatch(/Publié/);
  });

  it('plusieurs motifs : une phrase chacun, dans l’ordre de l’API ; un code inconnu se dit « Hors ligne. »', async () => {
    await fiche({ is_online: false, offline_reasons: ['agency_inactive', 'status_pending_review', 'private', 'nouveau_code'] });
    const phrases = Array.from(listes()[0].querySelectorAll('[role="listitem"]')).map((li) => li.textContent);
    expect(phrases).toEqual([
      'Agence suspendue : ses biens ne sont plus visibles du public.',
      'En attente de validation par l’agence.',
      'Privé — rendez-le public pour le mettre en ligne.',
      'Hors ligne.',
    ]);
  });

  it('rien pour un bien en ligne, même si une liste de motifs traîne dans la réponse', async () => {
    await fiche({ is_online: true, offline_reasons: ['private'] });
    expect(listes()).toHaveLength(0);
  });
});
