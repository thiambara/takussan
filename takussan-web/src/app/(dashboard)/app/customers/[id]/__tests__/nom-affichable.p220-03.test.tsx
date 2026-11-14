import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { monterLaFiche, reponseVide } from './monter-la-fiche';

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone garde prénom et nom
 * vides. Décision du porteur : chaque écran la nomme par `nomAffichable()` (e-mail, numéro, `#<id>`),
 * avec les seuls champs qu'il charge déjà ; avant, il composait une chaîne vide.
 *
 * TCK-2589 — la tête et ses gestes vivent dans `FicheDuClient` : la page est montée, et les props des
 * composants espionnés sont relues.
 */
const fiche = vi.hoisted(() => ({ phone: null as string | null }));
const espions = vi.hoisted(() => ({ planifier: vi.fn(), document: vi.fn(), etape: vi.fn(), entete: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/customers/7',
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
    id: 7,
    first_name: '',
    last_name: '',
    email: 'awa@example.sn',
    phone: fiche.phone,
    status: 'active',
    pipeline_stage: 'lead',
    agency_id: 3,
  }),
  fetchCustomerNotes: async () => [],
  fetchCustomerRelationships: async () => [],
  fetchCrmTags: async () => [],
}));
vi.mock('@/components/customer-dashboard/CustomerTagPicker', () => ({ CustomerTagPicker: () => null }));
vi.mock('@/components/crm/InviterACreerSonCompte', () => ({ InviterACreerSonCompte: () => null, useInvitationDuClient: () => ({ etat: 'aucune' }) }));
vi.mock('@/components/crm/CustomerReferent', () => ({ CustomerReferent: () => null }));
vi.mock('@/components/bookings/EntreeSaisieDemande', () => ({ EntreeSaisieDemande: () => null }));
vi.mock('@/components/crm/CustomerStageControl', () => ({ CustomerStageControl: (p: unknown) => (espions.etape(p), null) }));
// TCK-2589 (lot D) — « Ajouter un document » vit dans le ⋯ : le dialogue, monté par la fiche, porte le nom.
vi.mock('@/components/documents/DocumentUploadDialog', () => ({ DocumentUploadDialog: (p: unknown) => (espions.document(p), null) }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: (p: unknown) => (espions.planifier(p), null) }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: (p: unknown) => (espions.entete(p), null) }));

const { default: Page } = await import('../page');

beforeEach(() => {
  vi.clearAllMocks();
  fiche.phone = null;
  vi.stubGlobal('fetch', vi.fn(async () => reponseVide()));
});
afterEach(() => vi.unstubAllGlobals());

describe('fiche client sans nom (P220.03)', () => {
  it('le titre, la visite, le document et l’étape la nomment par son e-mail', async () => {
    await monterLaFiche(Page, '7');

    expect(screen.getByRole('heading', { level: 1, name: 'awa@example.sn' })).toBeInTheDocument();
    expect(espions.entete).toHaveBeenCalledWith(expect.objectContaining({ titre: 'awa@example.sn' }));
    // TCK-2586 — la feuille « Planifier une visite » reçoit aussi le téléphone et l'étape du client.
    expect(espions.planifier).toHaveBeenCalledWith(expect.objectContaining({ customer: expect.objectContaining({ id: 7, libelle: 'awa@example.sn' }) }));
    expect(espions.document).toHaveBeenCalledWith(expect.objectContaining({ defaultDocumentable: expect.objectContaining({ label: 'awa@example.sn' }) }));
    expect(espions.etape).toHaveBeenCalledWith(expect.objectContaining({ name: 'awa@example.sn' }));
  });

  it('ses gestes la nomment par son e-mail quand elle a un numéro', async () => {
    fiche.phone = '+221770000007';
    await monterLaFiche(Page, '7');

    expect(screen.getByRole('link', { name: 'Appeler awa@example.sn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Écrire à awa@example.sn sur WhatsApp' })).toBeInTheDocument();
  });
});
