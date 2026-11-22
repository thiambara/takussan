/**
 * TCK-2621 — le bloc « Vos espaces » de la feuille du compte (téléphone) : nom, « rôle · ville », l'actif
 * marqué, jamais le slug. Réserve F7 de la vérification de TCK-2619 (le bloc n'était éprouvé nulle part).
 * En-tête repris de `FeuilleDuCompte.tck-2619.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';

const pousser = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: pousser, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

// P152.03 — les rôles système portent `properties.create` : l'action « Publier un bien » de
// l'admin d'agence se juge par elle (sans lecture, le personnel n'a aucune entrée de création).
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));

// Les compteurs et le solde sondent le réseau : ce fichier éprouve leur RENDU.
// TCK-2479 — le compte des non-lus est réglable : la bande « À traiter » doit paraître dans le tiroir.
const nonLusMock = vi.hoisted(() => vi.fn<() => number>(() => 0));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => nonLusMock() }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
// TCK-2479 — « Démarrer » : réglable, muet par défaut.
const demarrageMock = vi.hoisted(() => vi.fn<() => { data?: unknown }>(() => ({})));
vi.mock('@/lib/queries/demarrage-espace', () => ({ useDemarrageDeLEspace: () => demarrageMock() }));
const soldeMock = vi.hoisted(() => vi.fn<(o: { enabled: boolean }) => number | null>(() => null));
vi.mock('@/lib/queries/credits-solde', () => ({
  useSoldeCredits: (o: { enabled: boolean }) => soldeMock(o),
}));
vi.mock('@/hooks/useImpersonation', () => ({
  useImpersonationCourante: () => ({ data: null }),
  useQuitterImpersonation: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Réserve de la vérification (F7) — les espaces ne se lisent que pour un compte connecté
// (`useMyProfiles`, `enabled: !!user`) : réglable, sans compte par défaut (le repli du contexte).
const compteConnecte = vi.hoisted(() => ({ user: null as unknown }));
vi.mock('@/context/AuthContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/context/AuthContext')>();
  return {
    ...original,
    useAuth: () => {
      const auth = original.useAuth();
      return compteConnecte.user ? { ...auth, user: compteConnecte.user } : auth;
    },
  };
});
vi.mock('@/components/agency/AgencyStandardWelcomeWizard', () => ({ AgencyStandardWelcomeWizard: () => null }));
vi.mock('@/components/agent/AgentWelcomeWizard', () => ({ AgentWelcomeWizard: () => null }));
vi.mock('@/components/customer/CustomerWelcomeWizard', () => ({ CustomerWelcomeWizard: () => null }));
vi.mock('@/components/customer/MinimalProfileTriggerProvider', () => ({
  MinimalProfileTriggerProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/owner/OwnerWelcomeWizard', () => ({ OwnerWelcomeWizard: () => null }));
vi.mock('@/components/tenant/TenantWelcomeWizard', () => ({ TenantWelcomeWizard: () => null }));


/**
 * TCK-2619 — au téléphone, le pied du compte (tiroir) et l'espace de l'en-tête d'accueil ouvrent une
 * FEUILLE DU BAS, et non un menu déroulant posé dans le tiroir. Dès `md`, le menu reste (relu ici en
 * témoin). `matchMedia` est piloté : jsdom n'en a pas (polyfill `matches: false` de `vitest.setup.ts`).
 */
function utilisateur(roles: UserRole[]): User {
  return { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles } as unknown as User;
}

function monter(roles: UserRole[], acces?: AccesAdmin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const coque = (
    <AppShell user={utilisateur(roles)} agencyIsStandard>
      <p>contenu</p>
    </AppShell>
  );
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{acces ? <AccesAdminProvider acces={acces}>{coque}</AccesAdminProvider> : coque}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const telephone = { valeur: false };
const matchMediaDOrigine = window.matchMedia;
beforeEach(() => {
  nonLusMock.mockReset();
  nonLusMock.mockReturnValue(0);
  demarrageMock.mockReset();
  demarrageMock.mockReturnValue({});
  soldeMock.mockReset();
  soldeMock.mockReturnValue(null);
  pousser.mockReset();
  compteConnecte.user = null;
  telephone.valeur = true;
  window.matchMedia = (query: string) =>
    ({
      matches: query === '(width < 48rem)' ? telephone.valeur : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
  vi.unstubAllGlobals();
});

async function ouvrirLaFeuilleDepuisLeTiroir() {
  const user = userEvent.setup();
  await user.click(within(screen.getByRole('navigation', { name: 'Accès rapide' })).getByRole('button', { name: 'Menu' }));
  const tiroir = await screen.findByRole('dialog');
  await user.click(tiroir.querySelector<HTMLElement>('[data-slot="pied-du-compte"]')!);
  return { user, feuille: await screen.findByRole('dialog', { name: 'Mon compte' }) };
}

describe('TCK-2621 — les espaces dans la feuille du compte', () => {
  it('un compte à deux espaces les voit sous « Vos espaces » : nom, « rôle · ville », l’actif marqué, jamais le slug', async () => {
    compteConnecte.user = utilisateur(['agent', 'owner']);
    const profils = {
      data: [
        {
          id: 'agent:3', type: 'agent', numeric_id: 3, agency_id: 1, status: 'active', created_at: null,
          agency: { id: 1, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard', city: 'Dakar' },
        },
        {
          id: 'owner:8', type: 'owner', numeric_id: 8, agency_id: 2, status: 'active', created_at: null,
          agency: { id: 2, name: 'Thiès Properties', slug: 'thies-properties', kind: 'standard', city: 'Thiès' },
        },
      ],
      meta: { active_profile_id: 'agent:3', count: 2 },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/me/profiles'
          ? new Response(JSON.stringify(profils), { status: 200 })
          : new Response('{}', { status: 404 }),
      ),
    );
    monter(['agent', 'owner']);
    const { feuille } = await ouvrirLaFeuilleDepuisLeTiroir();
    const bloc = await within(feuille).findByRole('region', { name: 'Vos espaces' });
    expect(bloc).toHaveAttribute('data-slot', 'espaces-de-la-feuille');
    // Rangés par type d'espace (`TYPE_ORDER` : le propriétaire avant l'agent), comme le menu du bureau.
    const espaces = within(bloc).getAllByRole('button');
    expect(espaces.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Thiès Properties'),
      expect.stringContaining('Dakar Immo'),
    ]);
    expect(espaces[0]).toHaveTextContent('Propriétaire · Thiès');
    expect(espaces[1]).toHaveTextContent('Agent · Dakar');
    expect(espaces.map((b) => b.getAttribute('aria-current'))).toEqual([null, 'true']);
    expect(feuille.textContent).not.toMatch(/dakar-immo|thies-properties/);
    // Le bloc précède les lignes du compte.
    const profil = within(feuille).getByRole('button', { name: 'Mon profil' });
    expect(bloc.compareDocumentPosition(profil) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
