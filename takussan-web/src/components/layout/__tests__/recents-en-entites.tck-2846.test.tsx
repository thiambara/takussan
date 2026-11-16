/**
 * TCK-2846 — les récents sont les FICHES ouvertes, dans la coque montée en entier : une fiche se retient
 * sous son nom (`RetenirLaFiche`), et la palette (« Aller à… ») comme la colonne la rendent, dans le même
 * ordre ; un autre espace ne la voit pas ; revenir la rend.
 *
 * Les `vi.mock` sont ceux d'`AppShell.palette.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';
import { RetenirLaFiche } from '../RetenirLaFiche';

const chemin = vi.hoisted(() => ({ valeur: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.valeur,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/lib/queries/demarrage-espace', () => ({ useDemarrageDeLEspace: () => ({}) }));
vi.mock('@/lib/queries/credits-solde', () => ({ useSoldeCredits: () => null }));
vi.mock('@/hooks/useImpersonation', () => ({
  useImpersonationCourante: () => ({ data: null }),
  useQuitterImpersonation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/agency/AgencyStandardWelcomeWizard', () => ({ AgencyStandardWelcomeWizard: () => null }));
vi.mock('@/components/agent/AgentWelcomeWizard', () => ({ AgentWelcomeWizard: () => null }));
vi.mock('@/components/customer/CustomerWelcomeWizard', () => ({ CustomerWelcomeWizard: () => null }));
vi.mock('@/components/customer/MinimalProfileTriggerProvider', () => ({
  MinimalProfileTriggerProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/owner/OwnerWelcomeWizard', () => ({ OwnerWelcomeWizard: () => null }));
vi.mock('@/components/tenant/TenantWelcomeWizard', () => ({ TenantWelcomeWizard: () => null }));

const AGENT: UserRole[] = ['customer', 'agent'];
const ESPACE_A = 'agent:3';
const ESPACE_B = 'owner:9';
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const utilisateur = { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles: AGENT } as unknown as User;

function arbre(espace: string, enfants: ReactNode, qc: QueryClient) {
  return withIntl(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AppShell user={utilisateur} agencyIsStandard espaceActif={espace}>
          {enfants}
        </AppShell>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const BIEN = <RetenirLaFiche type="bien" id={42} titre="Villa 4 chambres à Ngor" chemin="/app/properties/42" />;
const DEMANDE = <RetenirLaFiche type="demande" id={9} titre="Moussa Diallo" chemin="/app/leads?ouverte=9" />;

/** Ouvre la fiche du bien, puis la demande, puis revient à l'accueil. */
function visiter() {
  const qc = client();
  chemin.valeur = '/app/properties/42';
  const rendu = render(arbre(ESPACE_A, BIEN, qc));
  chemin.valeur = '/app/leads';
  rendu.rerender(arbre(ESPACE_A, DEMANDE, qc));
  chemin.valeur = '/app';
  rendu.rerender(arbre(ESPACE_A, null, qc));
  return { ...rendu, qc };
}

const lignesDeLaColonne = () =>
  Array.from(document.querySelectorAll('aside [data-slot="recents"] a')).map((a) => a.textContent);

async function lignesDeLaPalette(): Promise<string[]> {
  const u = userEvent.setup();
  await u.keyboard('{Control>}k{/Control}');
  const liste = await screen.findByRole('listbox');
  const groupe = within(liste).queryByRole('group', { name: 'Récents' });
  const lignes = groupe ? within(groupe).getAllByRole('option').map((o) => o.textContent ?? '') : [];
  await u.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  return lignes;
}

beforeEach(() => {
  chemin.valeur = '/app';
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-2846 — « Récents » : les fiches ouvertes, par leur nom', () => {
  it('AC1 — « Aller à… » rend « Moussa Diallo · Demande » puis « Villa 4 chambres à Ngor · Bien », sans « Biens » ni « Demandes »', async () => {
    visiter();
    expect(await lignesDeLaPalette()).toEqual(['Moussa DialloDemande', 'Villa 4 chambres à NgorBien']);
  });

  it('AC2 — la colonne rend les mêmes lignes, dans le même ordre (par leur nom seul)', async () => {
    visiter();
    await waitFor(() => expect(lignesDeLaColonne()).toEqual(['Moussa Diallo', 'Villa 4 chambres à Ngor']));
    const liens = Array.from(document.querySelectorAll('aside [data-slot="recents"] a')).map((a) => a.getAttribute('href'));
    expect(liens).toEqual(['/app/leads?ouverte=9', '/app/properties/42']);
  });

  it('AC3 — dans un autre espace, aucune des deux ; de retour, elles reviennent', async () => {
    const { rerender, qc } = visiter();
    rerender(arbre(ESPACE_B, null, qc));
    await waitFor(() => expect(lignesDeLaColonne()).toEqual([]));
    expect(await lignesDeLaPalette()).toEqual([]);
    rerender(arbre(ESPACE_A, null, qc));
    await waitFor(() => expect(lignesDeLaColonne()).toEqual(['Moussa Diallo', 'Villa 4 chambres à Ngor']));
    expect(await lignesDeLaPalette()).toEqual(['Moussa DialloDemande', 'Villa 4 chambres à NgorBien']);
  });
});
