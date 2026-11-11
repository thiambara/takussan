/**
 * TCK-2580 (vérification adverse, M1) — la PAGE fiche client porte, parmi ses gestes, « Saisir une
 * candidature ou une offre » pour le personnel de l'agence, et seulement pour lui. La page est rendue
 * entière (composant serveur attendu, puis monté) : le test du composant `EntreeSaisieDemande` seul
 * restait vert quand on retirait le geste de la fiche. Les autres gestes et les onglets, qui ont leurs
 * propres tests, sont simulés par un témoin.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import profilsAgent from '@/components/visits/__tests__/fixtures/r2-profils-agent.json';
import profilsBailleur from '@/components/visits/__tests__/fixtures/r2-profils-bailleur.json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/customers/7',
  useSearchParams: () => new URLSearchParams(''),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 3, roles: ['agent'], agency_id: 1 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3 }, token: 'jeton', isLoading: false }) }));
const profils = vi.hoisted(() => ({ courant: null as unknown }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: profils.courant }) }));
vi.mock('@/lib/queries/customers', () => ({
  fetchDashboardCustomer: async () => ({
    id: 7,
    first_name: 'Awa',
    last_name: 'Diop',
    email: 'awa@example.sn',
    phone: '+221770000007',
    status: 'active',
    pipeline_stage: 'lead',
    agency_id: 1,
    user_id: null,
  }),
  fetchCustomerNotes: async () => [],
  fetchCustomerRelationships: async () => [],
  fetchCrmTags: async () => [],
}));
vi.mock('@/components/customer-dashboard/CustomerDetailTabs', () => ({ CustomerDetailTabs: () => <p>onglets de la fiche</p> }));
vi.mock('@/components/customer-dashboard/CustomerTagPickerSection', () => ({ CustomerTagPickerSection: () => null }));
vi.mock('@/components/crm/ContactGestures', () => ({ ContactGestures: () => null }));
vi.mock('@/components/crm/InviterACreerSonCompte', () => ({ InviterACreerSonCompte: () => null }));
vi.mock('@/components/crm/CustomerReferent', () => ({ CustomerReferent: () => null }));
vi.mock('@/components/crm/CustomerStageControl', () => ({ CustomerStageControl: () => null }));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: () => null }));

const { default: Page } = await import('../page');

async function monterLaPage() {
  const arbre = await Page({ params: Promise.resolve({ id: '7' }) });
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{arbre}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [], meta: { total: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => vi.unstubAllGlobals());

describe('TCK-2580 — le geste « Saisir une candidature ou une offre » de la fiche client', () => {
  it('sous un profil agent actif, la fiche d’Awa Diop offre le geste', async () => {
    profils.courant = profilsAgent;
    await monterLaPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Awa Diop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saisir une candidature ou une offre' })).toBeInTheDocument();
  });

  it('sous un profil bailleur, la même fiche n’offre le geste sous aucune forme', async () => {
    profils.courant = profilsBailleur;
    await monterLaPage();

    // La fiche est bien rendue (témoins) : l'absence du geste n'est pas celle de la page.
    expect(screen.getByRole('heading', { level: 1, name: 'Awa Diop' })).toBeInTheDocument();
    expect(screen.getByText('onglets de la fiche')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saisir une candidature ou une offre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saisir une demande' })).not.toBeInTheDocument();
  });
});
