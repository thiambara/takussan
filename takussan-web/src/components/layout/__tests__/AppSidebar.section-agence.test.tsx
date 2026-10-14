/**
 * TCK-649 (ADR-0064 §2) — la section d'agence du menu de `/app`, DÉRIVÉE de la table des pages.
 *
 * AC2 : le menu montre exactement les pages à menu de la table que le profil actif peut ouvrir —
 * admin `standard`, admin `individual`, agent, bailleur, locataire, chacun éprouvé ; un profil qui
 * n'en a aucune ne voit pas la section. L'accès est calculé ici comme le layout de `/app` le calcule
 * (`accesDepuis`, sur la VRAIE table) puis fourni par `AccesAdminProvider` : c'est la chaîne réelle,
 * pas une liste de chemins écrite à côté.
 *
 * La section remplace l'entrée unique « Administration » de TCK-633 et la barre de l'ancienne
 * console : ce fichier reprend ce que `AdminSidebar.*.test.tsx` y gardait — le titre « Mon espace »,
 * le badge des files de modération, le surlignage, la carte « Passer en agence ».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import { accesDepuis, type ContexteAdmin } from '@/lib/access/pages-admin';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';
import { AppSidebar } from '../AppSidebar';

const { chemin, fetchAvis, fetchBiens } = vi.hoisted(() => ({
  chemin: { valeur: '/app' },
  fetchAvis: vi.fn(async () => ({ data: [], meta: { pending_count: 3 } })),
  fetchBiens: vi.fn(async () => ({ data: [], meta: { total: 6 } })),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => chemin.valeur,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: null, isLoading: false, logout: vi.fn() }),
}));
vi.mock('@/lib/queries/reviews-moderation', () => ({ fetchModerationQueue: () => fetchAvis() }));
vi.mock('@/lib/queries/property-moderation', () => ({ fetchPropertyModerationQueue: () => fetchBiens() }));
// Les autres compteurs et le solde sondent le réseau : sans objet ici.
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
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

interface Profil {
  readonly roles: UserRole[];
  readonly ctx: ContexteAdmin;
  readonly agencyIsStandard?: boolean;
}

const profil = (roles: UserRole[], kind: 'standard' | 'individual' | null, agencyIsStandard?: boolean): Profil => ({
  roles,
  ctx: { roles, agence: kind ? { kind } : null, capacites: ['agency.update_billing'] },
  agencyIsStandard,
});

const ADMIN_STANDARD = profil(['agency_admin', 'customer'], 'standard', true);
const ADMIN_INDIVIDUEL = profil(['agency_admin', 'owner', 'customer'], 'individual', false);
const AGENT = profil(['agent', 'customer'], 'standard');
const BAILLEUR = profil(['owner', 'customer'], null);
const LOCATAIRE = profil(['tenant', 'customer'], null);

function utilisateur(roles: UserRole[]): User {
  return {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    full_name: 'Awa Diop',
    email: 'awa@example.test',
    roles,
    agency_id: 7,
    avatar_url: null,
  } as unknown as User;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function monterLaBarre(p: Profil, hasPendingUpgrade?: boolean) {
  return render(
    withIntl(
      <QueryClientProvider client={client()}>
        <AccesAdminProvider acces={accesDepuis(p.ctx)}>
          <AppSidebar
            user={utilisateur(p.roles)}
            agencyIsStandard={p.agencyIsStandard}
            hasPendingUpgrade={hasPendingUpgrade}
          />
        </AccesAdminProvider>
      </QueryClientProvider>,
    ),
  );
}

const hrefs = (racine: Element) => Array.from(racine.querySelectorAll('a')).map((a) => a.getAttribute('href'));
const liensVersLaSection = (racine: ParentNode = document) =>
  Array.from(racine.querySelectorAll('a[href^="/app/agency"]')).map((a) => a.getAttribute('href'));

beforeEach(() => {
  chemin.valeur = '/app';
  fetchAvis.mockClear();
  fetchBiens.mockClear();
});

describe('AC2 — la section d’agence montre exactement les pages que le profil peut ouvrir', () => {
  it('admin d’une agence standard : « Administration », les dix pages à menu, dans l’ordre de la table', () => {
    monterLaBarre(ADMIN_STANDARD);
    const section = screen.getByRole('group', { name: 'Administration' });
    expect(hrefs(section)).toEqual([
      '/app/agency/team',
      '/app/agency/roles',
      '/app/agency',
      '/app/agency/kyc',
      '/app/agency/billing',
      '/app/agency/finances',
      '/app/agency/moderation',
      '/app/agency/moderation/properties',
      '/app/agency/audit',
      '/app/agency/integrations',
    ]);
    // Le badge d'une file peut s'être posé en bout de ligne : on lit le libellé seul.
    expect(within(section).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, ''))).toEqual([
      'Équipe',
      'Rôles',
      'Agence',
      'KYC agence',
      'Abonnement',
      "Finances de l'agence",
      'Modération avis',
      'Modération biens',
      "Journal d'audit",
      'Intégrations',
    ]);
    // Aucune page de la section ne vit hors d'elle — ni l'ancienne entrée unique.
    expect(liensVersLaSection()).toEqual(hrefs(section));
  });

  it('admin d’une agence individual : « Mon espace », et seulement ses cinq pages', () => {
    monterLaBarre(ADMIN_INDIVIDUEL);
    expect(screen.queryByRole('group', { name: 'Administration' })).toBeNull();
    const section = screen.getByRole('group', { name: 'Mon espace' });
    expect(hrefs(section)).toEqual([
      '/app/agency',
      '/app/agency/kyc',
      '/app/agency/billing',
      '/app/agency/finances',
      '/app/agency/integrations',
    ]);
    expect(liensVersLaSection()).toEqual(hrefs(section));
  });

  it.each([
    ['agent', AGENT],
    ['bailleur', BAILLEUR],
    ['locataire', LOCATAIRE],
  ] as const)('%s : aucune page, donc aucune section', (_nom, p) => {
    monterLaBarre(p);
    expect(screen.queryByRole('group', { name: 'Administration' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Mon espace' })).toBeNull();
    expect(liensVersLaSection()).toEqual([]);
    // Le reste du menu est bien rendu : l'absence de section n'est pas une barre vide.
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute('href', '/app');
  });

  it('la section vient APRÈS les entrées de travail (TCK-646) : c’est la dernière du menu', () => {
    const { container } = monterLaBarre(ADMIN_STANDARD);
    const liens = hrefs(container.querySelector('nav')!);
    const premiere = liens.findIndex((h) => h?.startsWith('/app/agency'));
    expect(liens[0]).toBe('/app');
    expect(liens.slice(premiere).every((h) => h?.startsWith('/app/agency'))).toBe(true);
  });
});

describe('les files de modération gardent leur badge (TCK-098, repris de la barre de l’ancienne console)', () => {
  it('admin standard : avis et biens en attente, sur leurs entrées', async () => {
    monterLaBarre(ADMIN_STANDARD);
    expect(await screen.findByLabelText('3 en attente')).toHaveTextContent('3');
    expect(await screen.findByLabelText('6 en attente')).toHaveTextContent('6');
    const section = screen.getByRole('group', { name: 'Administration' });
    expect(within(section).getByRole('link', { name: /Modération avis/ })).toContainElement(
      screen.getByLabelText('3 en attente'),
    );
  });

  it('admin individual : aucune file sondée — ses pages ne lui sont pas ouvertes', async () => {
    monterLaBarre(ADMIN_INDIVIDUEL);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchAvis).not.toHaveBeenCalled();
    expect(fetchBiens).not.toHaveBeenCalled();
  });

  it('agent : aucune file sondée', async () => {
    monterLaBarre(AGENT);
    await waitFor(() => expect(screen.getByRole('navigation')).toBeInTheDocument());
    expect(fetchAvis).not.toHaveBeenCalled();
    expect(fetchBiens).not.toHaveBeenCalled();
  });
});

describe('le surlignage dans la section', () => {
  it.each([
    ['/app/agency', 'Agence'],
    ['/app/agency/kyc', 'KYC agence'],
    ['/app/agency/finances/reconciliation/3', "Finances de l'agence"],
    ['/app/agency/moderation/properties', 'Modération biens'],
    ['/app/agency/integrations', 'Intégrations'],
  ])('%s → « %s », et elle seule', (pathname, nom) => {
    chemin.valeur = pathname;
    monterLaBarre(ADMIN_STANDARD);
    const actives = Array.from(document.querySelectorAll('nav a[aria-current="page"]'));
    expect(actives.map((a) => a.textContent?.replace(/\d+$/, ''))).toEqual([nom]);
  });
});

describe('la carte « Passer en agence » (TCK-267 ; décision 1 du porteur de TCK-633)', () => {
  const LIEN = '/app/settings/agency/upgrade';

  it('admin individual : une carte, hors du menu', () => {
    monterLaBarre(ADMIN_INDIVIDUEL);
    expect(screen.getByRole('link', { name: 'Passer en agence' })).toHaveAttribute('href', LIEN);
    expect(document.querySelector(`nav a[href="${LIEN}"]`)).toBeNull();
  });

  it('admin standard : aucune carte', () => {
    monterLaBarre(ADMIN_STANDARD);
    expect(document.querySelectorAll(`a[href="${LIEN}"]`)).toHaveLength(0);
  });
});

describe('le tiroir mobile porte la même section (Direction UX du ticket)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['admin standard', ADMIN_STANDARD, 'Administration'],
    ['admin individual', ADMIN_INDIVIDUEL, 'Mon espace'],
  ] as const)('%s', async (_nom, p, titre) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const { container } = render(
      withIntl(
        <QueryClientProvider client={client()}>
          <ToastProvider>
            <AccesAdminProvider acces={accesDepuis(p.ctx)}>
              <AppShell user={utilisateur(p.roles)} agencyIsStandard={p.agencyIsStandard}>
                <p>contenu</p>
              </AppShell>
            </AccesAdminProvider>
          </ToastProvider>
        </QueryClientProvider>,
      ),
    );
    const bureau = within(container.querySelector('aside')!).getByRole('group', { name: titre });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    const tiroir = await screen.findByRole('dialog');
    expect(hrefs(within(tiroir).getByRole('group', { name: titre }))).toEqual(hrefs(bureau));
  });
});

describe('deux entrées du menu ne portent jamais le même libellé', () => {
  // L'admin d'une agence individuelle est aussi bailleur : « Finances » des Engagements
  // (`/app/payments`, ce qu'il paie et reçoit) et « Finances » de « Mon espace » (`/app/agency/finances`,
  // les comptes de l'agence) se lisaient pareil. Deux pages différentes sous un même nom, c'est un
  // choix laissé au hasard.
  it.each([
    ['admin standard', ADMIN_STANDARD],
    ['admin individuel, aussi bailleur', ADMIN_INDIVIDUEL],
    ['agent', AGENT],
    ['bailleur', BAILLEUR],
    ['locataire', LOCATAIRE],
  ])('%s', (_nom, p) => {
    const { container } = monterLaBarre(p);
    const libelles = Array.from(container.querySelectorAll('nav a')).map((a) =>
      (a.textContent ?? '').replace(/\d+$/, '').trim(),
    );
    const doublons = libelles.filter((l, i) => l !== '' && libelles.indexOf(l) !== i);
    expect(doublons, libelles.join(' · ')).toEqual([]);
  });
});
