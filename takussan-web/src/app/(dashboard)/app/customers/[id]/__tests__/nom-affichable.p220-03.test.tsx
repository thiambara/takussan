import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone garde prénom et nom
 * vides. Décision du porteur : chaque écran la nomme par `nomAffichable()` (e-mail, numéro, `#<id>`),
 * avec les seuls champs qu'il charge déjà ; avant, il composait une chaîne vide.
 */
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agent'], agency_id: 3 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/lib/queries/customers', () => ({
  fetchDashboardCustomer: async () => ({
    id: 7,
    first_name: '',
    last_name: '',
    email: 'awa@example.sn',
    phone: null,
    status: 'active',
    pipeline_stage: 'lead',
    agency_id: 3,
  }),
  fetchCustomerNotes: async () => [],
  fetchCustomerRelationships: async () => [],
  fetchCrmTags: async () => [],
}));

const { default: Page } = await import('../page');

/** Toutes les valeurs des props `cle` de l'arbre rendu, à toute profondeur. */
function valeurs(noeud: unknown, cle: string, trouvees: unknown[] = []): unknown[] {
  if (Array.isArray(noeud)) noeud.forEach((n) => valeurs(n, cle, trouvees));
  else if (isValidElement(noeud)) {
    const props = noeud.props as Record<string, unknown>;
    if (cle in props) trouvees.push(props[cle]);
    Object.values(props).forEach((v) => valeurs(v as ReactNode, cle, trouvees));
  }
  return trouvees;
}

describe('fiche client sans nom (P220.03)', () => {
  it('le titre, la visite, le document, les gestes et l’étape la nomment par son e-mail', async () => {
    const arbre = await Page({ params: Promise.resolve({ id: '7' }) });

    expect(valeurs(arbre, 'title')).toContain('awa@example.sn');
    expect(valeurs(arbre, 'customer')).toContainEqual({ id: 7, libelle: 'awa@example.sn' });
    expect(valeurs(arbre, 'displayLabel')).toEqual(['awa@example.sn']);
    expect(valeurs(arbre, 'fullName')).toEqual(['awa@example.sn']);
    expect(valeurs(arbre, 'name')).toContain('awa@example.sn');
  });
});
