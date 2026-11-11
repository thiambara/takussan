import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';

/**
 * TCK-2586 (AC3) — sur la fiche client, « Planifier une visite » s'ouvre avec le bien d'intérêt du
 * client (`customer.interested_property`) déjà choisi : la feuille reçoit `property = { id, libelle }`.
 * Sans bien d'intérêt, elle ne reçoit aucun bien et l'agent le cherche.
 */
const fiche = vi.hoisted(() => ({ interet: null as null | { id: number; title: string } }));

vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agent'], agency_id: 3 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/lib/queries/customers', () => ({
  fetchDashboardCustomer: async () => ({
    id: 264,
    first_name: 'Rokhaya',
    last_name: 'Ndiaye',
    email: null,
    phone: '+221771234567',
    status: 'active',
    pipeline_stage: 'lead',
    agency_id: 3,
    interested_property: fiche.interet,
  }),
  fetchCustomerNotes: async () => [],
  fetchCustomerRelationships: async () => [],
  fetchCrmTags: async () => [],
}));

const { PlanifierUneVisite } = await import('@/components/visits/PlanifierUneVisite');
const { default: Page } = await import('../page');

/** Les props de chaque `PlanifierUneVisite` de l'arbre rendu, à toute profondeur. */
function feuilles(noeud: unknown, trouvees: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(noeud)) noeud.forEach((n) => feuilles(n, trouvees));
  else if (isValidElement(noeud)) {
    const props = noeud.props as Record<string, unknown>;
    if (noeud.type === PlanifierUneVisite) trouvees.push(props);
    Object.values(props).forEach((v) => feuilles(v as ReactNode, trouvees));
  }
  return trouvees;
}

beforeEach(() => {
  fiche.interet = null;
});

describe('fiche client — « Planifier une visite » et le bien d’intérêt (TCK-2586, AC3)', () => {
  it('le bien d’intérêt du client arrive choisi dans la feuille', async () => {
    fiche.interet = { id: 96, title: 'Villa à Ngor' };
    const planifier = feuilles(await Page({ params: Promise.resolve({ id: '264' }) }));
    expect(planifier).toHaveLength(1);
    expect(planifier[0]!.property).toEqual({ id: 96, libelle: 'Villa à Ngor' });
    expect(planifier[0]!.customer).toEqual(expect.objectContaining({ id: 264, telephone: '+221771234567', etape: 'lead' }));
  });

  it('sans bien d’intérêt, la feuille s’ouvre sans bien', async () => {
    const planifier = feuilles(await Page({ params: Promise.resolve({ id: '264' }) }));
    expect(planifier).toHaveLength(1);
    expect(planifier[0]!.property).toBeUndefined();
  });
});
