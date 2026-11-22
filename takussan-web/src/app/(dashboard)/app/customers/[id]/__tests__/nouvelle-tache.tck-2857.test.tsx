/**
 * TCK-2857 — la fiche client gagne « Nouvelle tâche » (le ⋯ des actions, personnel seul) : un lien vers
 * « Tâches », le formulaire ouvert, ce client rattaché (`?pour=customer:<id>`, jamais le nom).
 * Même montage que `saisie-demande.tck-2580.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
// La feuille « ⋯ » du téléphone est montée par la coque : on rend ses actions dans la page.
// (Sous une racine de dialogue : ses autres gestes sont des `SheetClose`.)
vi.mock('@/components/layout/en-tete-de-la-coque', async () => {
  const { Sheet } = await import('@/components/ui/sheet');
  return { DeclarerEnTete: ({ actions }: { actions?: React.ReactNode }) => <Sheet open><div data-testid="feuille-du-telephone">{actions}</div></Sheet> };
});
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 3, roles: ['agent'], agency_id: 1 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/auth/guards', () => ({ assertCanReachAgentArea: () => {} }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3 }, token: 'jeton', isLoading: false }) }));
const profils = vi.hoisted(() => ({ courant: null as unknown }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: profils.courant }) }));
vi.mock('@/lib/queries/customers', () => ({
  fetchFicheDuClient: async () => ({
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
vi.mock('@/components/customer-dashboard/CustomerTagPickerSection', () => ({ CustomerTagPickerSection: () => null }));
vi.mock('@/components/crm/ContactGestures', () => ({ ContactGestures: () => null }));
vi.mock('@/components/crm/InviterACreerSonCompte', () => ({ InviterACreerSonCompte: () => null, useInvitationDuClient: () => ({ etat: 'aucune' }) }));
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

describe('TCK-2857 — « Nouvelle tâche » depuis la fiche client', () => {
  it('AC4 — le personnel : le menu porte « Nouvelle tâche », qui mène au formulaire, ce client rattaché', async () => {
    profils.courant = profilsAgent;
    await monterLaPage();
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    const entree = await screen.findByRole('menuitem', { name: 'Nouvelle tâche' });
    expect(entree).toHaveAttribute('href', '/app/tasks?nouvelle=1&pour=customer:7');
  });

  it('AC4 — au téléphone, la feuille « ⋯ » de la coque porte le même lien', async () => {
    profils.courant = profilsAgent;
    await monterLaPage();
    const feuille = screen.getByTestId('feuille-du-telephone');
    expect(within(feuille).getByRole('link', { name: 'Nouvelle tâche' })).toHaveAttribute('href', '/app/tasks?nouvelle=1&pour=customer:7');
  });

  it('le bailleur ne l’a pas', async () => {
    profils.courant = profilsBailleur;
    await monterLaPage();
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Ajouter un document' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Nouvelle tâche' })).not.toBeInTheDocument();
  });
});
