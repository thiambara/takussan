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
 *
 * TCK-2478 (ADR-0089) — il n'y a plus UNE section d'agence : les pages entrent au catalogue, la
 * table `PAGES_ADMIN` reste leur seul juge, et la disposition du persona les PLACE. Chez l'admin
 * d'une agence `standard`, « Finances » et « Abonnement » vont dans le groupe « Finances », les huit
 * autres dans « Agence », replié ; chez l'hôte (admin `individual`), « Mon espace » porte Agence,
 * KYC, Reversements, Crédits et Intégrations, et « Finances » est dans « Mes locations ».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { PROPERTY_MODERATION_COUNT_KEY } from '@/lib/queries/agency-queues';
import { ToastProvider } from '@/components/ui/toast';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import { accesDepuis, type ContexteAdmin } from '@/lib/access/pages-admin';
import type { ProfileType } from '@/types/profile';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';
import { AppSidebar } from '../AppSidebar';

const { chemin, fetchAvis, fetchBiens } = vi.hoisted(() => ({
  chemin: { valeur: '/app' },
  // TCK-2479 (revue, I3) — le compteur lit `total` de la vue « En attente » ; `pending_count` (ici
  // différent exprès) n'est plus lu.
  fetchAvis: vi.fn(async () => ({ data: [], meta: { total: 3, pending_count: 9 } })),
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
// TCK-2479 — le jeton est posé : sans ce mock, « Démarrer » de l'admin partirait sur le réseau.
vi.mock('@/lib/queries/demarrage-espace', () => ({ useDemarrageDeLEspace: () => ({}) }));
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
// TCK-2478 — l'en-tête d'espace monte le sélecteur de profil (routeur, toasts) : ce fichier lit
// le menu, le sélecteur a ses propres tests (`EnTeteDEspace.test.tsx`).
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

interface Profil {
  readonly roles: UserRole[];
  readonly ctx: ContexteAdmin;
  readonly agencyIsStandard?: boolean;
}

// TCK-1412 (P148.01, P148.02) — un profil sans rôle d'administration ouvre les pages que ses
// capacités ouvrent (délégations comprises) : l'agent, le bailleur et le locataire de ce fichier
// n'en portent donc aucune, sans quoi `team.assign_role` leur ouvrirait « Équipe » et « Rôles ».
// TCK-2260 — le journal d'audit exige `reports.view_agency`, que porte le rôle système d'admin.
const CAPACITES_ADMIN = ['agency.update_billing', 'agency.update_kyc', 'team.assign_role', 'payments.reconcile', 'reports.view_agency'];
const profil = (roles: UserRole[], kind: 'standard' | 'individual' | null, agencyIsStandard?: boolean): Profil => ({
  roles,
  ctx: { roles, agence: kind ? { kind } : null, capacites: roles.includes('agency_admin') ? CAPACITES_ADMIN : [] },
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

function monterLaBarre(p: Profil, hasPendingUpgrade?: boolean, typeProfilActif?: ProfileType) {
  return render(
    withIntl(
      <QueryClientProvider client={client()}>
        <AccesAdminProvider acces={accesDepuis(p.ctx)}>
          <AppSidebar
            user={utilisateur(p.roles)}
            agencyIsStandard={p.agencyIsStandard}
            hasPendingUpgrade={hasPendingUpgrade}
            typeProfilActif={typeProfilActif}
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

const TOUTES_LES_PAGES = [
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
];

/** Les libellés des liens d'un groupe, repliés compris, sans le badge d'une file. */
const libelles = (groupe: HTMLElement) =>
  within(groupe).getAllByRole('link', { hidden: true }).map((a) => a.textContent?.replace(/\d+$/, ''));

describe('AC2 — le menu montre exactement les pages d’agence que le profil peut ouvrir', () => {
  it('admin d’une agence standard : les dix pages, réparties entre « Finances » et « Agence » (replié)', () => {
    monterLaBarre(ADMIN_STANDARD);
    const agence = screen.getByRole('group', { name: 'Agence' });
    expect(within(agence).getByRole('button', { name: 'Agence' })).toHaveAttribute('aria-expanded', 'false');
    expect(hrefs(agence)).toEqual([
      '/app/agency/team',
      '/app/agency/roles',
      '/app/agency',
      '/app/agency/kyc',
      '/app/agency/moderation',
      '/app/agency/moderation/properties',
      '/app/agency/audit',
      '/app/agency/integrations',
    ]);
    expect(libelles(agence)).toEqual([
      'Équipe',
      'Rôles',
      'Agence',
      'KYC agence',
      'Modération avis',
      'Modération biens',
      "Journal d'audit",
      'Intégrations',
    ]);
    const finances = screen.getByRole('group', { name: 'Finances' });
    expect(hrefs(finances)).toEqual(['/app/agency/finances', '/app/commissions', '/app/credits', '/app/agency/billing']);
    expect(libelles(finances)).toEqual(["Finances de l'agence", 'Commissions', 'Crédits', 'Abonnement']);
    // Les dix pages à menu de la table, chacune une fois — et nulle part ailleurs que dans ces deux groupes.
    expect([...liensVersLaSection()].sort()).toEqual([...TOUTES_LES_PAGES].sort());
    expect([...liensVersLaSection(agence), ...liensVersLaSection(finances)].sort()).toEqual([...TOUTES_LES_PAGES].sort());
    expect(screen.queryByRole('group', { name: 'Administration' })).toBeNull();
  });

  it('admin d’une agence individual (hôte) : « Mon espace », et seulement ses cinq pages', () => {
    monterLaBarre(ADMIN_INDIVIDUEL);
    expect(screen.queryByRole('group', { name: 'Agence' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Administration' })).toBeNull();
    const monEspace = screen.getByRole('group', { name: 'Mon espace' });
    expect(hrefs(monEspace)).toEqual([
      '/app/agency',
      '/app/agency/kyc',
      '/app/agency/billing',
      '/app/credits',
      '/app/agency/integrations',
    ]);
    expect(libelles(monEspace)).toEqual(['Agence', 'KYC agence', 'Reversements', 'Crédits', 'Intégrations']);
    // Arbitrage 4 : « Finances » de « Mes locations » = les finances de l'agence.
    const locations = screen.getByRole('group', { name: 'Mes locations' });
    expect(liensVersLaSection(locations)).toEqual(['/app/agency/finances']);
    expect([...liensVersLaSection()].sort()).toEqual(
      ['/app/agency', '/app/agency/billing', '/app/agency/finances', '/app/agency/integrations', '/app/agency/kyc'],
    );
  });

  it.each([
    ['agent', AGENT],
    ['bailleur', BAILLEUR],
    ['locataire', LOCATAIRE],
  ] as const)('%s : aucune page, donc ni « Agence » ni « Mon espace »', (_nom, p) => {
    monterLaBarre(p);
    expect(screen.queryByRole('group', { name: 'Agence' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Administration' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Mon espace' })).toBeNull();
    expect(liensVersLaSection()).toEqual([]);
    // Le reste du menu est bien rendu : l'absence de pages d'agence n'est pas une barre vide.
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute('href', '/app');
  });
});

/**
 * Revue de TCK-2478 (I1) — un admin d'agence qui est AUSSI bailleur ou agent, profil actif non admin :
 * `AccesAdmin.chemins` se calcule sur l'union de l'espace, et rangeait les dix pages sous « Plus »
 * (le persona les « ouvrait ») pendant que le reste de l'admin allait sous « Aussi administrateur ».
 */
describe('profil actif non admin dans un espace où le compte est admin (revue, I1)', () => {
  it.each([
    ['owner', ['agency_admin', 'owner', 'customer']],
    ['agent', ['agency_admin', 'agent', 'customer']],
  ] as const)('profil actif %s : les dix pages sous « Aussi administrateur », aucune sous « Plus »', (type, roles) => {
    monterLaBarre(profil([...roles], 'standard', true), undefined, type);
    const aussi = screen.getByRole('group', { name: 'Aussi administrateur' });
    expect([...liensVersLaSection(aussi)].sort()).toEqual([...TOUTES_LES_PAGES].sort());
    expect(liensVersLaSection(screen.getByRole('group', { name: 'Plus' }))).toEqual([]);
    expect([...liensVersLaSection()].sort()).toEqual([...TOUTES_LES_PAGES].sort());
  });

  // TCK-1412 — aucun profil d'admin dans l'espace : seule la délégation de l'agent a ouvert « Équipe ».
  // Elle reste à son persona ; une règle « admin seulement » la faisait disparaître du menu.
  it('l’agent délégué (team.invite, aucun admin dans l’espace) garde « Équipe »', () => {
    const roles: UserRole[] = ['agent', 'customer'];
    monterLaBarre({ roles, ctx: { roles, agence: { kind: 'standard' }, capacites: ['team.invite'] } }, undefined, 'agent');
    expect(liensVersLaSection()).toEqual(['/app/agency/team']);
    expect(screen.queryByRole('group', { name: /^Aussi/ })).toBeNull();
  });
});

describe('les files de modération gardent leur badge (TCK-098, repris de la barre de l’ancienne console)', () => {
  it('admin standard : avis et biens en attente, sur leurs entrées', async () => {
    monterLaBarre(ADMIN_STANDARD);
    expect(await screen.findByLabelText('3 en attente')).toHaveTextContent('3');
    expect(await screen.findByLabelText('6 en attente')).toHaveTextContent('6');
    // Les deux files sont dans « Agence », replié : au menu quand même, badge compris.
    const section = screen.getByRole('group', { name: 'Agence' });
    expect(within(section).getByRole('link', { name: /Modération avis/, hidden: true })).toContainElement(
      screen.getByLabelText('3 en attente'),
    );
  });

  /**
   * TCK-2479 (AC3, arbitrage 7) — sur une relecture en ÉCHEC, react-query GARDE l'ancien `data`
   * (`isError: true`) : un compteur qui ne lisait que `data` continuait d'afficher un compte qu'on ne
   * sait plus vrai. Éprouvé ici sur le vrai react-query, pas sur un mock de sa forme.
   */
  it('TCK-2479 — une relecture ratée retire badge et pastille, alors que le cache garde l’ancien compte', async () => {
    const qc = client();
    render(
      withIntl(
        <QueryClientProvider client={qc}>
          <AccesAdminProvider acces={accesDepuis(ADMIN_STANDARD.ctx)}>
            <AppSidebar user={utilisateur(ADMIN_STANDARD.roles)} agencyIsStandard />
          </AccesAdminProvider>
        </QueryClientProvider>,
      ),
    );
    const pastilles = () =>
      within(screen.getByRole('region', { name: 'À traiter' }))
        .getAllByRole('link')
        .map((l) => l.getAttribute('aria-label'));
    await waitFor(() => expect(pastilles()).toEqual(['6 biens à valider', '3 avis à modérer']));

    fetchAvis.mockRejectedValueOnce(new Error('panne'));
    fetchBiens.mockRejectedValueOnce(new Error('panne'));
    await act(() => qc.refetchQueries());

    // La prémisse : les deux requêtes sont en erreur, et leur `data` est TOUJOURS là.
    for (const cle of [['reviews-moderation', 'pending-count'], PROPERTY_MODERATION_COUNT_KEY]) {
      const etat = qc.getQueryState(cle);
      expect(etat?.status, String(cle)).toBe('error');
      expect(etat?.data, String(cle)).toBeDefined();
    }
    // Et pourtant : ni pastille, ni badge.
    expect(screen.queryByRole('region', { name: 'À traiter' })).toBeNull();
    expect(screen.queryByLabelText('3 en attente')).toBeNull();
    expect(screen.queryByLabelText('6 en attente')).toBeNull();
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

describe('le tiroir mobile porte les mêmes pages d’agence (Direction UX du ticket)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['admin standard', ADMIN_STANDARD, 'Agence'],
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
  // choix laissé au hasard. TCK-2478 (arbitrage 4) — chez l'hôte, la première est « Paiements »
  // (sous « Plus »), la seconde « Finances de l'agence » (« Mes locations »). Les entrées
  // repliées et cadenassées comptent : elles sont au menu.
  it.each([
    ['admin standard', ADMIN_STANDARD],
    ['admin individuel, aussi bailleur', ADMIN_INDIVIDUEL],
    ['agent', AGENT],
    ['bailleur', BAILLEUR],
    ['locataire', LOCATAIRE],
  ])('%s', (_nom, p) => {
    const { container } = monterLaBarre(p);
    const libelles = Array.from(container.querySelectorAll('nav a, nav [role="link"]')).map((a) =>
      (a.textContent ?? '').replace(/\d+$/, '').trim(),
    );
    const doublons = libelles.filter((l, i) => l !== '' && libelles.indexOf(l) !== i);
    expect(doublons, libelles.join(' · ')).toEqual([]);
  });
});
