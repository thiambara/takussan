import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { monterLaFiche, reponseVide } from './monter-la-fiche';

/**
 * TCK-2586 (AC3) — sur la fiche client, « Planifier une visite » s'ouvre avec le bien d'intérêt du
 * client (`customer.interested_property`) déjà choisi : la feuille reçoit `property = { id, libelle }`.
 * Sans bien d'intérêt, elle ne reçoit aucun bien et l'agent le cherche.
 *
 * TCK-2589 — la feuille vit dans `FicheDuClient` (composant client) : la page est montée, et les props
 * reçues par la feuille espionnée sont relues.
 */
const fiche = vi.hoisted(() => ({ interet: null as null | { id: number; title: string } }));
const planifier = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/customers/264',
  useSearchParams: () => new URLSearchParams(''),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agent'], agency_id: 3 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }) }));
vi.mock('@/lib/queries/customers', () => ({
  fetchFicheDuClient: async () => ({
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
vi.mock('@/components/customer-dashboard/CustomerTagPicker', () => ({ CustomerTagPicker: () => null }));
vi.mock('@/components/crm/InviterACreerSonCompte', () => ({ InviterACreerSonCompte: () => null }));
vi.mock('@/components/crm/CustomerReferent', () => ({ CustomerReferent: () => null }));
vi.mock('@/components/crm/CustomerStageControl', () => ({ CustomerStageControl: () => null }));
vi.mock('@/components/bookings/EntreeSaisieDemande', () => ({ EntreeSaisieDemande: () => null }));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: (p: unknown) => (planifier(p), null) }));

const { default: Page } = await import('../page');

/** Les props de chaque `PlanifierUneVisite` monté, une par instance (le dernier rendu de chacune). */
function feuilles(): Record<string, unknown>[] {
  const vues = new Map<string, Record<string, unknown>>();
  for (const [p] of planifier.mock.calls as [Record<string, unknown>][]) vues.set(JSON.stringify(p), p);
  return [...vues.values()];
}

beforeEach(() => {
  planifier.mockClear();
  fiche.interet = null;
  vi.stubGlobal('fetch', vi.fn(async () => reponseVide()));
});
afterEach(() => vi.unstubAllGlobals());

describe('fiche client — « Planifier une visite » et le bien d’intérêt (TCK-2586, AC3)', () => {
  it('le bien d’intérêt du client arrive choisi dans la feuille', async () => {
    fiche.interet = { id: 96, title: 'Villa à Ngor' };
    await monterLaFiche(Page, '264');
    const vues = feuilles();
    expect(vues).toHaveLength(1);
    expect(vues[0]!.property).toEqual({ id: 96, libelle: 'Villa à Ngor' });
    expect(vues[0]!.customer).toEqual(expect.objectContaining({ id: 264, telephone: '+221771234567', etape: 'lead' }));
  });

  it('sans bien d’intérêt, la feuille s’ouvre sans bien', async () => {
    await monterLaFiche(Page, '264');
    const vues = feuilles();
    expect(vues).toHaveLength(1);
    expect(vues[0]!.property).toBeUndefined();
  });
});
