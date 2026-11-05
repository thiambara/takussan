/**
 * TCK-377 — La barre latérale de `/app`, éprouvée sur les quatre défauts que le ticket nomme ;
 * TCK-2478 — et sur le menu PAR PERSONA qui a remplacé le menu par rôle (ADR-0089).
 *
 * Chaque bloc ci-dessous est écrit pour ROUGIR sur la régression qu'il prétend garder, et chacun a
 * été rejoué par ablation (le détail est dans le rapport du ticket). En particulier :
 *
 *  - « surlignage sur une page fille » rougit si `pathname === item.href` revient ;
 *  - « une seule entrée active » rougit sur un préfixe NAÏF (sans départage par longueur) ;
 *  - « la barre montée suit la disposition du persona » rougit si deux groupes d'une disposition
 *    sont inversés (TCK-2478, ablation 3) ;
 *  - l'entrée active placée sous « Plus » rougit si un groupe replié ne s'ouvre plus sur elle
 *    (TCK-2478, ablation 1) ; l'espace suspendu, si la barre ignore `agencySuspended` (ablation 2) ;
 *  - l'AC6 rougit si les compteurs sont armés en dur, **sur le composant monté** et pas seulement
 *    sur la fonction pure.
 *
 * TCK-2478 — ce fichier ne porte plus `HREFS_PAR_ROLE`, ni les blocs « AC4 — le regroupement ne
 * change AUCUN droit » et « TCK-646 — six entrées en tête », ni l'ordre des en-têtes de section :
 * ils figeaient le menu PAR RÔLE, que ce ticket change exprès. Leurs remplaçants sont
 * `src/lib/navigation/__tests__/dispositions-validees.test.ts` (fonction pure) et le bloc
 * « la barre montée suit la disposition du persona » ci-dessous (composant monté) ; l'écart, rôle
 * par rôle, est écrit dans les notes de TCK-2478.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import type { User, UserRole } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import { accesDepuis } from '@/lib/access/pages-admin';
import { composerMenu, entreesDuMenu } from '@/lib/navigation/composer-menu';
import type { Persona } from '@/lib/navigation/personas';
import { AppSidebar, countersToPoll, type NavCounterKey } from '../AppSidebar';
import { resolveActiveHref, APP_EXACT_ROOTS } from '@/lib/navigation/active-path';

let pathname = '/app';
// P152.03 — les rôles système portent `properties.create` : « Publier un bien » se juge par elle.
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
// TCK-2478 — l'en-tête d'espace monte le sélecteur de profil (`useMyProfiles`,
// `useSwitchActiveProfile` → routeur, toasts). Ce fichier éprouve le MENU : le sélecteur a ses
// propres tests (`EnTeteDEspace.test.tsx`), on le réduit ici à sa carte statique.
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

type OptionsDeSondage = { enabled?: boolean };
// TCK-2479 — `isError` : une relecture en échec garde l'ancien `data` dans le cache de react-query.
type ReponseCompteur = { data?: { meta: { total: number } }; isError?: boolean };

// Les trois compteurs sont MOQUÉS : ce fichier éprouve la barre latérale, pas le réseau. Les
// arguments sont capturés parce que l'AC6 porte précisément sur eux (`{ enabled }`).
const unreadMock = vi.fn<(options: OptionsDeSondage) => number>(() => 0);
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: (options: OptionsDeSondage = {}) => unreadMock(options),
}));

const pendingVisitsMock = vi.fn<(options: OptionsDeSondage) => ReponseCompteur>(() => ({}));
vi.mock('@/lib/queries/visits', () => ({
  usePendingVisitsCount: (options: OptionsDeSondage = {}) => pendingVisitsMock(options),
}));

// TCK-590 — le troisième compteur : les demandes de contact non traitées.
const unhandledLeadsMock = vi.fn<(options: OptionsDeSondage) => ReponseCompteur>(() => ({}));
vi.mock('@/lib/queries/contact-leads', () => ({
  useUnhandledLeadsCount: (options: OptionsDeSondage = {}) => unhandledLeadsMock(options),
}));

// TCK-642 — le solde de crédits, montré en bout de l'entrée « Crédits » dans le tiroir.
const soldeMock = vi.fn<(options: { enabled: boolean }) => number | null>(() => null);
vi.mock('@/lib/queries/credits-solde', () => ({
  useSoldeCredits: (options: { enabled: boolean }) => soldeMock(options),
}));

// Les pages d'agence sondent deux files de modération ; on ne teste ici que leur `aria-current`.
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: vi.fn(async () => ({ meta: { pending_count: 0 } })),
}));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: vi.fn(async () => ({ meta: { pending_count: 0 } })),
}));

/**
 * Les huit comptes de `dispositions-validees.test.ts`, RECOPIÉS (pas importés : les deux fichiers
 * ne doivent pas se valider l'un l'autre), sous la forme que le layout de `/app` fournit à la barre :
 * rôles de l'espace, type du profil actif, drapeau `standard`, et l'accès aux pages d'agence calculé
 * par la VRAIE table (`accesDepuis`), comme le layout le calcule.
 */
interface Compte {
  readonly roles: UserRole[];
  readonly typeProfilActif?: ProfileType;
  readonly agencyIsStandard?: boolean;
  readonly agence: 'standard' | 'individual' | null;
}

// TCK-1412 — les capacités du rôle système d'admin qui ouvrent les pages d'agence.
const CAPACITES_ADMIN = ['agency.update_billing', 'agency.update_kyc', 'team.assign_role', 'payments.reconcile', 'reports.view_agency'];

const COMPTES: Record<Persona, Compte> = {
  client: { roles: ['customer'], agence: null },
  locataire: { roles: ['customer', 'tenant'], agence: null },
  bailleur: { roles: ['customer', 'owner'], agence: null },
  agent: { roles: ['customer', 'agent'], agence: 'standard', agencyIsStandard: true },
  'admin-agence': { roles: ['customer', 'agency_admin'], agence: 'standard', agencyIsStandard: true },
  hote: {
    roles: ['customer', 'agency_admin', 'owner'],
    typeProfilActif: 'agency_admin',
    agence: 'individual',
    agencyIsStandard: false,
  },
  prestataire: { roles: ['customer', 'service_provider'], agence: null },
  plateforme: { roles: ['customer', 'super_admin'], agence: null },
};

const PERSONAS = Object.keys(COMPTES) as Persona[];

function userWith(roles: UserRole[]): User {
  return {
    id: 1,
    first_name: 'Astou',
    last_name: 'Dieng',
    full_name: 'Astou Dieng',
    email: 'astou@example.com',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: null,
    phone_verified_at: null,
    two_factor_enabled: false,
    agency_id: 7,
    roles,
    status: 'active',
    created_at: '2026-05-08T10:00:00.000000Z',
  };
}

function barre(compte: Compte, options: { agencySuspended?: boolean } = {}) {
  const acces = accesDepuis({
    roles: compte.roles,
    agence: compte.agence ? { kind: compte.agence } : null,
    capacites: compte.roles.includes('agency_admin') ? CAPACITES_ADMIN : [],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(
    <QueryClientProvider client={client}>
      <AccesAdminProvider acces={acces}>
        <AppSidebar
          user={userWith(compte.roles)}
          agencyIsStandard={compte.agencyIsStandard}
          typeProfilActif={compte.typeProfilActif ?? null}
          agencySuspended={options.agencySuspended}
        />
      </AccesAdminProvider>
    </QueryClientProvider>,
  );
}

function renderSidebar(persona: Persona, at: string, options: { agencySuspended?: boolean } = {}) {
  pathname = at;
  return render(barre(COMPTES[persona], options));
}

/** Les entrées portant `aria-current="page"`, par leur libellé visible. */
function activeLabels(): string[] {
  return screen
    .getAllByRole('link')
    .filter((el) => el.getAttribute('aria-current') === 'page')
    .map((el) => el.textContent?.trim() ?? '');
}

/** Le libellé d'une entrée, sans le compteur ni le texte réservé au lecteur d'écran. */
function libelle(entree: Element): string {
  return entree.querySelector('span.truncate')?.textContent?.trim() ?? '';
}

/** Un groupe lu sur le DOM : `[titre, replié, libellés…]` (titre `null` : groupe sans titre). */
type GroupeLu = [string | null, boolean, ...string[]];

function groupesRendus(container: HTMLElement): GroupeLu[] {
  return Array.from(container.querySelectorAll('nav [data-groupe]')).map((groupe) => {
    const bouton = groupe.querySelector(':scope > button');
    const titre = groupe.querySelector(':scope > button, :scope > p')?.textContent?.trim() ?? null;
    const replie = bouton?.getAttribute('aria-expanded') === 'false';
    const entrees = Array.from(groupe.querySelectorAll('a, [role="link"]')).map(libelle);
    return [titre, replie, ...entrees] as GroupeLu;
  });
}

beforeEach(() => {
  unreadMock.mockReset();
  unreadMock.mockReturnValue(0);
  pendingVisitsMock.mockReset();
  pendingVisitsMock.mockReturnValue({ data: undefined });
  unhandledLeadsMock.mockReset();
  unhandledLeadsMock.mockReturnValue({ data: undefined });
  soldeMock.mockReset();
  soldeMock.mockReturnValue(null);
});

/**
 * TCK-2478 (AC1) — le menu de chaque persona, ÉCRIT À LA MAIN d'après la table du ticket (validée
 * par le porteur le 2026-11-05) et le catalogue, lu en français sur le composant monté.
 *
 * - `action` : le libellé du bouton principal, `null` s'il n'y en a pas.
 * - `groupes` : `[titre, replié, libellés…]`, dans l'ordre. Le titre est celui que l'œil lit — un
 *   groupe sans titre de la table vaut `null` ; « Plus » et « Aussi … » sont des divulgations, qui
 *   ont toujours leur bouton (décision de la session du 2026-11-05).
 * - Les entrées sous « Plus » sont celles que la table y cite, puis celles que le catalogue ouvre
 *   au persona sans que la disposition les place, dans l'ordre du catalogue.
 * - « Vue agence » et « Propriétaires » de l'hôte sont cadenassées (`isProRouteLocked`) : elles
 *   restent au menu, lues ici par leur libellé.
 *
 * ⚠ Les compteurs de l'AC6 se DÉDUISENT de cette table ({@link COMPTEUR_PAR_LIBELLE}) : éditer une
 * ligne ici change aussi ce que la barre doit sonder pour ce persona.
 */
const MENU_ATTENDU: Record<Persona, { action: string | null; groupes: GroupeLu[] }> = {
  client: {
    action: 'Chercher un bien',
    groupes: [
      [null, false, 'Tableau de bord', 'Messagerie'],
      ['Mes recherches', false, 'Mes favoris', 'Recherches sauvegardées'],
      ['Mes démarches', false, 'Mes visites', 'Mes réservations'],
      // Arbitrage 1 : Baux, Paiements, Interventions (« Maintenance »), États des lieux restent au
      // client pur — sous « Plus ».
      ['Plus', true, 'Documents', 'Mes avis', 'Statistiques', 'Maintenance', 'Mes baux', 'Paiements', 'États des lieux'],
    ],
  },
  locataire: {
    action: 'Payer mon loyer',
    groupes: [
      [null, false, 'Tableau de bord', 'Messagerie'],
      ['Mon logement', false, 'Mon bail', 'Paiements', 'Interventions', 'États des lieux', 'Documents'],
      // Arbitrage 2 : « Chercher un bien » ouvre son groupe « Mes recherches ».
      ['Mes recherches', true, 'Chercher un bien', 'Mes favoris', 'Recherches sauvegardées', 'Mes visites', 'Mes réservations'],
      ['Plus', true, 'Mes avis', 'Statistiques'],
    ],
  },
  bailleur: {
    action: 'Proposer un bien à mon agence',
    groupes: [
      [null, false, 'Tableau de bord', 'Messagerie'],
      ['Mon patrimoine', false, 'Mes biens', 'Baux', 'Finances', 'États des lieux'],
      ['Activité', false, 'Demandes de contact', 'Visites', 'Réservations', 'Calendrier', 'Interventions'],
      ['Plus', true, 'Clients (CRM)', 'Avis reçus', 'Documents', 'Statistiques', 'Exports', 'Mes favoris', 'Recherches sauvegardées', 'Mes tâches'],
    ],
  },
  // Relevé de TCK-2478 : aucun parcours de création de visite sous `/app` — l'action de l'agent
  // est le repli du ticket, « Publier un bien ».
  agent: {
    action: 'Publier un bien',
    groupes: [
      [null, false, 'Tableau de bord', 'Messagerie', 'Mes tâches'],
      ['Prospection', false, 'Demandes de contact', 'Clients (CRM)', 'Visites', 'Calendrier'],
      ['Catalogue', false, 'Mes biens', 'Réservations'],
      ['Gestion', false, 'Baux', 'Onboardings en attente', 'États des lieux', 'Interventions', 'Commissions'],
      ['Plus', true, 'Avis reçus', 'Documents', 'Statistiques', 'Exports', 'Mes favoris', 'Recherches sauvegardées'],
    ],
  },
  'admin-agence': {
    action: 'Publier un bien',
    groupes: [
      [null, false, 'Tableau de bord', 'Vue agence', 'Messagerie'],
      ['Activité', false, 'Demandes de contact', 'Visites', 'Réservations', 'Calendrier'],
      ['Portefeuille', false, 'Biens', 'Propriétaires', 'Clients (CRM)', 'Baux', 'Onboardings en attente'],
      ['Finances', false, "Finances de l'agence", 'Commissions', 'Crédits', 'Abonnement'],
      ['Agence', true, 'Équipe', 'Rôles', 'Agence', 'KYC agence', 'Modération avis', 'Modération biens', "Journal d'audit", 'Intégrations'],
      ['Pilotage', true, 'Statistiques', 'KPIs', 'Alertes', 'Exports'],
      ['Plus', true, 'Maintenance', 'Carnet prestataires', 'États des lieux', 'Documents', 'Avis reçus', 'Mes tâches', 'Mes favoris', 'Recherches sauvegardées'],
    ],
  },
  hote: {
    action: 'Publier un bien',
    groupes: [
      [null, false, 'Tableau de bord', 'Messagerie'],
      ['Mes biens', false, 'Mes biens', 'Réservations', 'Visites', 'Calendrier', 'Demandes de contact'],
      // Arbitrage 4 : « Finances » = les finances de l'agence ; les paiements du bailleur vont sous
      // « Plus », libellés « Paiements ».
      ['Mes locations', false, 'Baux', "Finances de l'agence", 'États des lieux', 'Interventions', 'Carnet prestataires'],
      ['Mon espace', false, 'Agence', 'KYC agence', 'Reversements', 'Crédits', 'Intégrations'],
      [
        'Plus', true, 'Clients (CRM)', 'Statistiques', 'Exports', 'KPIs', 'Alertes', 'Avis reçus', 'Documents',
        'Mes tâches', 'Mes favoris', 'Recherches sauvegardées', 'Paiements', 'Commissions', 'Onboardings en attente',
        'Vue agence', 'Propriétaires',
      ],
    ],
  },
  // AC5 — ni action ni titre de section. Six destinations sous « Plus », replié, qui n'est pas un
  // titre : cinq que le plancher `customer` lui ouvre (`occupeUnLogement`, TCK-379), et le calendrier.
  prestataire: {
    action: null,
    groupes: [
      [null, false, 'Tableau de bord', 'Interventions', 'Messagerie', 'Documents'],
      // Revue de TCK-2478 — « Statistiques » sort (M2 : sa page le renvoie sur `/app`), « Calendrier »
      // entre (M3 : `assertCanReachCalendar` le laisse entrer, TCK-591).
      ['Plus', true, 'Réservations', 'Visites', 'Mes favoris', 'Recherches sauvegardées', 'Baux', 'Calendrier'],
    ],
  },
  plateforme: {
    action: 'Publier un bien',
    groupes: [
      [null, false, 'Tableau de bord', 'Vue agence', 'Messagerie'],
      ['Activité', false, 'Demandes de contact', 'Visites', 'Réservations', 'Calendrier'],
      ['Portefeuille', false, 'Biens', 'Propriétaires', 'Clients (CRM)', 'Baux', 'Onboardings en attente'],
      ['Finances', false, "Finances de l'agence", 'Commissions', 'Crédits', 'Abonnement'],
      ['Agence', true, 'Équipe', 'Rôles', 'Agence', 'KYC agence', 'Modération avis', 'Modération biens', "Journal d'audit", 'Intégrations'],
      ['Pilotage', true, 'Statistiques', 'KPIs', 'Alertes', 'Exports'],
      ['Plus', true, 'Maintenance', 'Carnet prestataires', 'États des lieux', 'Documents', 'Avis reçus', 'Mes tâches', 'Mes favoris', 'Recherches sauvegardées'],
    ],
  },
};

describe('TCK-2478 — la barre montée suit la disposition du persona (AC1)', () => {
  it.each(PERSONAS)('%s : l’action principale, puis le premier lien du menu', (persona) => {
    const { container } = renderSidebar(persona, '/app');
    const action = container.querySelector('[data-slot="action-principale"]');
    const attendue = MENU_ATTENDU[persona].action;
    if (attendue === null) {
      expect(action).toBeNull();
      return;
    }
    expect(action?.textContent?.trim()).toBe(attendue);
    // Au clavier : l'action vient avant le menu, et le menu s'ouvre sur le tableau de bord. Le logo
    // du tiroir (`/`) la précède seul, et l'en-tête d'espace n'est ici qu'une carte statique.
    const liens = Array.from(container.querySelectorAll('aside a')).filter((a) => a.getAttribute('href') !== '/');
    expect(liens[0]).toBe(action);
    expect(liens[1]).toBe(container.querySelector('nav a'));
    expect(liens[1]).toHaveAttribute('href', '/app');
  });

  it.each(PERSONAS)('%s : les groupes, leurs titres et leurs entrées, dans l’ordre', (persona) => {
    const { container } = renderSidebar(persona, '/app');
    expect(groupesRendus(container)).toEqual(MENU_ATTENDU[persona].groupes);
  });

  it.each(PERSONAS)('%s : chaque groupe replié a `aria-expanded="false"` et sa liste `hidden`', (persona) => {
    const { container } = renderSidebar(persona, '/app');
    const replies = MENU_ATTENDU[persona].groupes.filter((g) => g[1]).map((g) => g[0]);
    const boutons = Array.from(container.querySelectorAll('nav [data-groupe] > button[aria-expanded]'));
    expect(boutons.filter((b) => b.getAttribute('aria-expanded') === 'false').map((b) => b.textContent?.trim())).toEqual(replies);
    for (const bouton of boutons) {
      const liste = document.getElementById(bouton.getAttribute('aria-controls') ?? '');
      expect(liste, bouton.textContent ?? '').not.toBeNull();
      expect(liste).toHaveAttribute('hidden');
    }
  });

  it.each(PERSONAS)('%s : aucune entrée n’apparaît deux fois (TCK-646 AC2)', (persona) => {
    const { container } = renderSidebar(persona, '/app');
    const rendus = Array.from(container.querySelectorAll('nav a, nav [role="link"]')).map(libelle);
    expect(new Set(rendus).size, rendus.join(' · ')).toBe(rendus.length);
  });

  it('un groupe replié s’ouvre et se referme au clic, au clavier aussi', async () => {
    const user = userEvent.setup();
    renderSidebar('admin-agence', '/app');
    const bouton = screen.getByRole('button', { name: 'Agence' });
    expect(screen.queryByRole('link', { name: 'Équipe' })).toBeNull();
    await user.click(bouton);
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Équipe' })).toHaveAttribute('href', '/app/agency/team');
    bouton.focus();
    await user.keyboard('{Enter}');
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Équipe' })).toBeNull();
  });
});

describe('TCK-2478 — le complément « Aussi … » (AC2)', () => {
  /**
   * Un admin d'agence `standard` qui est AUSSI bailleur de la même agence, profil actif admin : la
   * disposition est celle de l'admin (jugée sur SES rôles), et ce que seul le profil bailleur ouvre
   * — « Finances » (`/app/payments`, ce que le bailleur paie et reçoit) — va dans « Aussi
   * bailleur », replié. Calculé sur l'union, le complément serait vide (ablation de la tâche 2).
   */
  const ADMIN_AUSSI_BAILLEUR: Compte = {
    roles: ['customer', 'agency_admin', 'owner'],
    typeProfilActif: 'agency_admin',
    agence: 'standard',
    agencyIsStandard: true,
  };

  it('« Aussi bailleur », replié, en bas, avec les seules destinations du profil bailleur', () => {
    pathname = '/app';
    const { container } = render(barre(ADMIN_AUSSI_BAILLEUR));
    const groupes = groupesRendus(container);
    expect(groupes.at(-1)).toEqual(['Aussi bailleur', true, 'Finances']);
    expect(within(container.querySelector('[data-groupe="aussi"]')!).getByRole('link', { hidden: true, name: 'Finances' }))
      .toHaveAttribute('href', '/app/payments');
    // Le reste est la disposition de l'admin, inchangée : l'action, et les groupes avant « Plus ».
    expect(container.querySelector('[data-slot="action-principale"]')).toHaveTextContent('Publier un bien');
    expect(groupes.slice(0, -1)).toEqual(MENU_ATTENDU['admin-agence'].groupes);
  });

  it('il s’ouvre sans changer de profil, et s’ouvre seul sur sa page active', () => {
    pathname = '/app/payments';
    render(barre(ADMIN_AUSSI_BAILLEUR));
    expect(screen.getByRole('button', { name: 'Aussi bailleur' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Finances' })).toHaveAttribute('aria-current', 'page');
  });

  // Revue de TCK-2478 (I2) — même compte, profil actif BAILLEUR. La page `/app/properties/new` choisit
  // son mode sur l'union (`modeDeCreationDeBien`) : elle publie. L'action disait « Proposer un bien à
  // mon agence », et « Publier un bien » reparaissait sous « Aussi administrateur » vers la même URL.
  it('profil actif bailleur : l’action dit « Publier un bien », seul lien vers la page de création', () => {
    pathname = '/app/properties/new';
    const { container } = render(barre({ ...ADMIN_AUSSI_BAILLEUR, typeProfilActif: 'owner' }));
    expect(container.querySelector('[data-slot="action-principale"]')).toHaveTextContent('Publier un bien');
    expect(container.querySelectorAll('a[href="/app/properties/new"]')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Proposer un bien/, hidden: true })).toBeNull();
  });

  it('un compte sans autre profil n’a pas de complément', () => {
    for (const persona of PERSONAS) {
      const { container, unmount } = renderSidebar(persona, '/app');
      expect(container.querySelector('[data-groupe="aussi"]'), persona).toBeNull();
      unmount();
    }
  });
});

describe('TCK-2478 — l’espace suspendu (AC3)', () => {
  it('ni action principale ni entrée d’écriture ; la lecture reste', () => {
    const { container } = renderSidebar('admin-agence', '/app', { agencySuspended: true });
    expect(container.querySelector('[data-slot="action-principale"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Publier un bien' })).toBeNull();
    expect(container.querySelectorAll('a[href="/app/properties/new"], a[href="/publish"]')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Biens' })).toHaveAttribute('href', '/app/properties');
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute('href', '/app');
  });

  it('le même compte, espace actif : l’action est là (le test ci-dessus n’est pas vide)', () => {
    const { container } = renderSidebar('admin-agence', '/app', { agencySuspended: false });
    expect(container.querySelector('[data-slot="action-principale"]')).toHaveAttribute('href', '/app/properties/new');
  });
});

describe('TCK-2478 — l’entrée active n’est jamais cachée (AC4)', () => {
  it('une page placée sous « Plus » rend « Plus » déplié, l’entrée active portant aria-current', () => {
    renderSidebar('admin-agence', '/app/maintenance/9');
    const plus = screen.getByRole('button', { name: 'Plus' });
    expect(plus).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(plus.getAttribute('aria-controls')!)).not.toHaveAttribute('hidden');
    expect(screen.getByRole('link', { name: 'Maintenance' })).toHaveAttribute('aria-current', 'page');
    // Les autres groupes repliés restent repliés.
    expect(screen.getByRole('button', { name: 'Agence' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('à la navigation aussi : la barre survit au changement de page, le groupe s’ouvre', () => {
    const { rerender } = renderSidebar('admin-agence', '/app');
    expect(screen.getByRole('button', { name: 'Pilotage' })).toHaveAttribute('aria-expanded', 'false');
    pathname = '/app/overview/kpis';
    rerender(barre(COMPTES['admin-agence']));
    expect(screen.getByRole('button', { name: 'Pilotage' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'KPIs' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('TCK-2478 — le prestataire (AC5)', () => {
  it('ni action, ni titre de section : sa seule bascule est « Plus »', () => {
    const { container } = renderSidebar('prestataire', '/app');
    expect(container.querySelector('[data-slot="action-principale"]')).toBeNull();
    expect(container.querySelectorAll('nav p')).toHaveLength(0);
    expect(Array.from(container.querySelectorAll('nav button')).map((b) => b.textContent?.trim())).toEqual(['Plus']);
    // …et sa tête porte son métier, visible sans rien ouvrir.
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/app', '/app/maintenance', '/app/messages', '/app/documents']),
    );
  });
});

describe('TCK-2478 — la carte du client et le lien « Console plateforme »', () => {
  it.each(['client', 'locataire'] as const)('%s : la carte « Mettre un bien en location » mène à /publish, aucune ligne de menu', (persona) => {
    const { container } = renderSidebar(persona, '/app');
    const carte = screen.getByRole('link', { name: /Mettre un bien en location/ });
    expect(carte).toHaveAttribute('href', '/publish');
    expect(container.querySelector('nav')?.querySelector('a[href="/publish"]')).toBeNull();
    expect(container.querySelectorAll('a[href="/publish"]')).toHaveLength(1);
  });

  it('l’action du client mène à la recherche publique, localisée (ADR-0026)', () => {
    const { container } = renderSidebar('client', '/app');
    expect(container.querySelector('[data-slot="action-principale"]')).toHaveAttribute('href', '/fr/properties');
  });

  it('les autres personas n’ont pas de carte', () => {
    for (const persona of PERSONAS.filter((p) => p !== 'client' && p !== 'locataire')) {
      const { container, unmount } = renderSidebar(persona, '/app');
      expect(container.querySelectorAll('a[href="/publish"]'), persona).toHaveLength(0);
      unmount();
    }
  });

  it('plateforme : « Console plateforme » vers /super-admin, hors du menu', () => {
    const { container } = renderSidebar('plateforme', '/app');
    expect(screen.getByRole('link', { name: 'Console plateforme' })).toHaveAttribute('href', '/super-admin');
    expect(container.querySelector('nav a[href="/super-admin"]')).toBeNull();
  });

  // Revue de TCK-2478 — la console suit le rôle `super_admin`, pas le persona : un super-admin dont le
  // profil actif est d'agence reçoit la disposition de l'admin d'agence, et perdait le lien.
  it('un super-admin au profil actif d’agence garde « Console plateforme »', () => {
    pathname = '/app';
    render(
      barre({ roles: ['customer', 'super_admin', 'agency_admin'], typeProfilActif: 'agency_admin', agence: 'standard', agencyIsStandard: true }),
    );
    expect(screen.getByRole('link', { name: 'Console plateforme' })).toHaveAttribute('href', '/super-admin');
  });

  it('un admin d’agence n’a pas le lien de la console', () => {
    renderSidebar('admin-agence', '/app');
    expect(screen.queryByRole('link', { name: 'Console plateforme' })).toBeNull();
  });
});

describe('AC1 — surlignage sur une page fille', () => {
  it('allume « Biens » (libellé de l’admin d’agence, TCK-2478) sur /app/properties/42', () => {
    renderSidebar('admin-agence', '/app/properties/42');
    expect(activeLabels()).toEqual(['Biens']);
  });

  // « Maintenance », « Documents » et « États des lieux » sont sous « Plus » chez l'admin : la
  // page active les y rend visibles (AC4 de TCK-2478).
  it.each([
    ['/app/leases/7', 'Baux'],
    ['/app/bookings/12', 'Réservations'],
    ['/app/visits/3', 'Visites'],
    ['/app/maintenance/9', 'Maintenance'],
    ['/app/documents/4', 'Documents'],
    ['/app/inventories/5', 'États des lieux'],
    ['/app/customers/8', 'Clients (CRM)'],
    ['/app/leases/new', 'Baux'],
    ['/app/customers/new', 'Clients (CRM)'],
    ['/app/inventories/new', 'États des lieux'],
    ['/app/maintenance/new', 'Maintenance'],
  ])('allume la bonne entrée sur %s', (route, label) => {
    renderSidebar('admin-agence', route);
    expect(activeLabels()).toEqual([label]);
  });
});

describe('AC2 — jamais deux entrées allumées sur des routes imbriquées', () => {
  // Cinq couples, pas trois : le ticket n'en nommait que trois et manquait
  // `/app/maintenance` ⊃ `/app/maintenance/providers` et `/app/overview` ⊃ ses quatre filles.
  //
  // TCK-2478 — « Publier un bien » est désormais l'ACTION PRINCIPALE, hors du `<nav>` : sur sa
  // page, c'est elle qui est courante, et « Biens », son parent d'URL, ne s'allume pas.
  it.each([
    ['/app/properties/new', 'Publier un bien'],
    ['/app/leases/onboarding-pending', 'Onboardings en attente'],
    ['/app/maintenance/providers', 'Carnet prestataires'],
    ['/app/overview/kpis', 'KPIs'],
    ['/app/overview/exports', 'Exports'],
  ])('%s n’allume que « %s »', (route, label) => {
    renderSidebar('admin-agence', route);
    expect(activeLabels()).toEqual([label]);
  });

  // Revue de TCK-2478 (M1) — l'action du locataire, « Payer mon loyer », mène à `/app/payments`, que
  // son groupe « Mon logement » porte aussi (« Paiements ») : les deux s'allumaient. L'entrée du menu
  // l'emporte ; l'action ne s'allume que sur une page qu'aucune entrée ne porte (ci-dessus).
  it('locataire sur /app/payments : « Paiements » seule, pas l’action', () => {
    const { container } = renderSidebar('locataire', '/app/payments');
    expect(activeLabels()).toEqual(['Paiements']);
    expect(container.querySelector('[data-slot="action-principale"]')).not.toHaveAttribute('aria-current');
  });

  it('la racine /app ne devient le parent de rien', () => {
    renderSidebar('admin-agence', '/app/profile');
    expect(activeLabels()).toEqual([]);
  });

  it('/app allume « Tableau de bord », et lui seul', () => {
    renderSidebar('admin-agence', '/app');
    expect(activeLabels()).toEqual(['Tableau de bord']);
  });

  it('un préfixe SANS départage par longueur allumerait deux entrées — la preuve', () => {
    const hrefs = ['/app/properties', '/app/properties/new'];
    const naif = hrefs.filter((h) => '/app/properties/new'.startsWith(h));
    expect(naif).toHaveLength(2);
    expect(resolveActiveHref('/app/properties/new', hrefs, APP_EXACT_ROOTS))
      .toBe('/app/properties/new');
  });
});

describe('AC3 — aria-current="page"', () => {
  it('AppSidebar le porte sur l’entrée active', () => {
    renderSidebar('admin-agence', '/app/leases/7');
    expect(screen.getByRole('link', { name: 'Baux' })).toHaveAttribute('aria-current', 'page');
  });

  // TCK-649 — la barre de l'ancienne console est partie ; sa règle reste, sur les pages d'agence :
  // sur `/app/agency/moderation/properties`, « Modération avis » et « Modération biens » sont deux
  // préfixes valides, et une seule entrée s'allume (dans « Agence », ouvert par elle).
  it('les pages d’agence n’allument qu’UNE modération sur /app/agency/moderation/properties', () => {
    renderSidebar('plateforme', '/app/agency/moderation/properties');
    expect(activeLabels()).toEqual(['Modération biens']);
  });
});

/**
 * Le compteur que porte chaque entrée comptée, par son LIBELLÉ — **écrit ici, à la main**.
 *
 * C'est la seconde moitié de l'indépendance de l'AC6. Le jeu sondé attendu se dérive de
 * {@link MENU_ATTENDU} et de cette correspondance ; il ne se dérive PAS de `counterKey`, qui est ce
 * que le composant produit. Un test qui recalculerait l'attendu avec le prédicat de
 * `countersToPoll` ne pourrait plus rougir sur une erreur de ce prédicat — c'est exactement ce
 * qu'il faisait avant TCK-377, et il a survécu à la mutation qui armait les deux compteurs en dur.
 *
 * TCK-2478 — la table est désormais par PERSONA (elle était par rôle) ; une entrée repliée est au
 * menu, son compteur est sondé.
 */
const COMPTEUR_PAR_LIBELLE: Record<string, NavCounterKey> = {
  Messagerie: 'unreadMessages',
  Visites: 'pendingVisits',
  'Mes visites': 'pendingVisits',
  'Demandes de contact': 'unhandledLeads',
};

/** Ce qu'un persona DOIT sonder, déduit de sa ligne de la table et de rien d'autre. */
function sondesAttendues(persona: Persona): Set<NavCounterKey> {
  const cles = new Set<NavCounterKey>();
  for (const [, , ...libelles] of MENU_ATTENDU[persona].groupes) {
    for (const l of libelles) {
      const cle = COMPTEUR_PAR_LIBELLE[l];
      if (cle) cles.add(cle);
    }
  }
  return cles;
}

describe('AC5 — un compteur ne s’affiche ni à zéro ni en échec', () => {
  it('rien à zéro', () => {
    unreadMock.mockReturnValue(0);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 0 } } });
    renderSidebar('admin-agence', '/app');
    expect(screen.queryByLabelText(/message non lu|messages non lus/)).toBeNull();
    expect(screen.queryByLabelText(/demande de visite|demandes de visite/)).toBeNull();
  });

  it('rien quand la requête échoue (data undefined)', () => {
    unreadMock.mockReturnValue(0);
    pendingVisitsMock.mockReturnValue({ data: undefined });
    renderSidebar('admin-agence', '/app');
    expect(screen.queryByLabelText(/demande de visite|demandes de visite/)).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  // TCK-2479 — la bande « À traiter » porte le même nom (« 3 messages non lus ») sur sa pastille :
  // ces cas visent le badge du MENU, lu dans le `<nav>`.
  it('la pastille paraît, avec son libellé accessible, dès qu’il y a quelque chose', () => {
    unreadMock.mockReturnValue(3);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 7 } } });
    const { container } = renderSidebar('admin-agence', '/app');
    const nav = within(container.querySelector('nav')!);
    expect(nav.getByLabelText('3 messages non lus')).toHaveTextContent('3');
    expect(nav.getByLabelText('7 demandes de visite en attente')).toHaveTextContent('7');
  });

  it('au-delà de 99, la pastille dit 99+ sans mentir sur son libellé', () => {
    unreadMock.mockReturnValue(140);
    const { container } = renderSidebar('admin-agence', '/app');
    expect(within(container.querySelector('nav')!).getByLabelText('140 messages non lus')).toHaveTextContent('99+');
  });
});

describe('AC6 — aucun sondage pour un persona qui ne voit pas l’entrée comptée', () => {
  const contexteAdmin = {
    roles: COMPTES['admin-agence'].roles,
    capacites: ['properties.create'],
    cheminsAdmin: [] as string[],
  };

  it('les compteurs sont armés quand leurs entrées sont là', () => {
    renderSidebar('admin-agence', '/app');
    expect(unreadMock).toHaveBeenCalledWith({ enabled: true });
    expect(pendingVisitsMock).toHaveBeenCalledWith({ enabled: true });
    expect(unhandledLeadsMock).toHaveBeenCalledWith({ enabled: true });
  });

  it('countersToPoll n’arme que ce que la liste contient', () => {
    const entrees = entreesDuMenu(composerMenu(contexteAdmin, 'admin-agence'));
    const sansVisites = entrees.filter((e) => e.href !== '/app/visits');
    expect(countersToPoll(sansVisites).has('pendingVisits')).toBe(false);
    expect(countersToPoll(sansVisites).has('unreadMessages')).toBe(true);
    expect(countersToPoll([]).size).toBe(0);
  });

  it('une entrée cadenassée n’est pas sondée', () => {
    const cadenasse = entreesDuMenu(composerMenu(contexteAdmin, 'admin-agence'))
      .map((e) => (e.counterKey ? { ...e, locked: true } : e));
    expect(countersToPoll(cadenasse).size).toBe(0);
  });

  /**
   * D2 — l'AC6 éprouvé **sur le composant monté**, et non sur la fonction pure.
   *
   * La fonction pouvait être juste et le composant l'ignorer : mutation mesurée le 2026-08-27 —
   * `useUnreadCount({ enabled: true })` et `usePendingVisitsCount({ enabled: true })` écrits en
   * dur, `countersToPoll` jamais appelée par le rendu → **88/88 verts**. Aucun test ne montait
   * alors la barre d'un rôle pour qui la bonne réponse est `false`.
   *
   * L'attendu est DÉRIVÉ de deux sources indépendantes du composant : {@link MENU_ATTENDU} (qui
   * voit quoi) et {@link COMPTEUR_PAR_LIBELLE} (quelle entrée porte quel compteur), toutes deux
   * écrites à la main. Le troisième compteur (`unhandledLeads`, TCK-590) est désormais lu aussi.
   */
  it.each(PERSONAS)('la barre montée pour %s n’arme que les compteurs de ses entrées', (persona) => {
    const sondes = sondesAttendues(persona);
    renderSidebar(persona, '/app');
    expect(unreadMock).toHaveBeenCalledWith({ enabled: sondes.has('unreadMessages') });
    expect(pendingVisitsMock).toHaveBeenCalledWith({ enabled: sondes.has('pendingVisits') });
    expect(unhandledLeadsMock).toHaveBeenCalledWith({ enabled: sondes.has('unhandledLeads') });
  });

  it('la branche « pas de sondage » est atteinte par un persona RÉEL', () => {
    // Sans cette clause, l'`it.each` ci-dessus serait vert dans un monde où tous les personas
    // sondent tout. Avant TCK-2478, c'était le prestataire seul (`['service_provider']`) qui
    // perdait ses visites. Sous les jeux de rôles que l'API émet vraiment, le plancher `customer`
    // lui rend ses visites (sous « Plus », `occupeUnLogement`, TCK-379 inchangé) : la branche
    // `false` est désormais tenue par les demandes de contact, que ni le client, ni le locataire,
    // ni le prestataire ne voient.
    const sansDemandes = PERSONAS.filter((p) => !sondesAttendues(p).has('unhandledLeads'));
    expect(sansDemandes).toEqual(['client', 'locataire', 'prestataire']);
    expect(PERSONAS.filter((p) => !sondesAttendues(p).has('unreadMessages'))).toEqual([]);
  });
});

describe('accessibilité de la barre', () => {
  it('la navigation porte un nom accessible', () => {
    renderSidebar('client', '/app');
    expect(screen.getByRole('navigation', { name: 'Navigation du tableau de bord' }))
      .toBeInTheDocument();
  });

  it('chaque lien et chaque bascule de la barre porte un anneau de focus', () => {
    renderSidebar('admin-agence', '/app');
    for (const cible of [...screen.getAllByRole('link'), ...screen.getAllByRole('button')]) {
      expect(cible.className, cible.textContent ?? '').toContain('focus-visible:ring-2');
      expect(cible.className, cible.textContent ?? '').toContain('focus-visible:ring-ring');
    }
  });

  /**
   * TCK-2478 — axe sur la barre montée de chaque persona : groupes titrés (`role="group"` nommé
   * par son titre), bascules (`aria-expanded`, `aria-controls`), action principale, carte.
   * jsdom ne calcule aucune couleur : le contraste se mesure au navigateur (AC8), pas ici.
   */
  it.each(PERSONAS)('%s : aucune violation axe (WCAG A et AA)', async (persona) => {
    const { container } = renderSidebar(persona, '/app');
    const resultat = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    });
    expect(resultat.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`))).toEqual([]);
  });

  it('l’entrée cadenassée garde sa sémantique et perd son opacité illisible', () => {
    renderSidebar('hote', '/app');
    // DEUX entrées sont cadenassées pour l'hôte (agence `individual`) : « Vue agence » et
    // « Propriétaires », toutes deux sous « Plus » (TCK-2478).
    const cadenasses = screen.getAllByTitle('Réservé aux comptes pro');
    expect(cadenasses).toHaveLength(2);
    for (const entree of cadenasses) {
      expect(entree).toHaveAttribute('aria-disabled', 'true');
      expect(entree.querySelector('svg')).not.toBeNull();
      // `opacity-60` composait `--muted-foreground` à 2,51:1 sur `--card`. Sans lui : 5,72:1.
      expect(entree.className).not.toContain('opacity-60');
    }
  });

  it('l’entrée cadenassée se joint au clavier et dit pourquoi (TCK-754)', () => {
    renderSidebar('hote', '/app');
    const cadenasses = screen.getAllByTitle('Réservé aux comptes pro');
    expect(cadenasses).toHaveLength(2);
    for (const entree of cadenasses) {
      expect(entree).toHaveAttribute('tabindex', '0');
      expect(entree.querySelector('.sr-only')).toHaveTextContent('Réservé aux comptes pro');
    }
  });

  /**
   * TCK-843 — un `sr-only` est `position: absolute`. Sans ancêtre positionné, son bloc conteneur
   * est la fenêtre : ni l'`overflow-y-auto` du `<nav>` ni l'`overflow-hidden` de la coque ne le
   * coupent, et, posé à sa place statique en bas de la liste, il allongeait le DOCUMENT — toute
   * la coque de `/app` défilait arrivée en bas de la page. jsdom ne mesure rien : on garde la
   * cause, le `<nav>` qui défile est positionné.
   */
  it('le <nav> qui défile contient les éléments absolus de la barre (TCK-843)', () => {
    renderSidebar('hote', '/app');
    const nav = screen.getByRole('navigation', { name: 'Navigation du tableau de bord' });
    expect(nav.className).toContain('overflow-y-auto');
    expect(nav.className.split(/\s+/)).toContain('relative');
    expect(nav.querySelectorAll('.sr-only').length).toBeGreaterThan(0);
  });
});

describe('TCK-642 — le solde dans l’entrée « Crédits » du tiroir', () => {
  it('lu seulement par qui voit l’entrée', () => {
    renderSidebar('agent', '/app');
    expect(soldeMock).toHaveBeenCalledWith({ enabled: false });
    soldeMock.mockClear();
    renderSidebar('admin-agence', '/app');
    expect(soldeMock).toHaveBeenCalledWith({ enabled: true });
  });

  it('affiché en bout de ligne, chiffres tabulaires, caché dès `md` (la barre haute le porte)', () => {
    soldeMock.mockReturnValue(1250);
    renderSidebar('admin-agence', '/app');
    // `format.number` sépare les milliers d'une espace fine insécable : on la normalise.
    const lien = screen.getByRole('link', { name: (nom) => nom.replace(/\s/g, ' ') === 'Crédits : 1 250 crédits' });
    expect(lien).toHaveAttribute('href', '/app/credits');
    const valeur = lien.querySelector('[data-slot="valeur-entree"]');
    expect(valeur?.textContent?.replace(/\s/g, ' ')).toBe('1 250');
    expect(valeur?.className).toContain('tabular-nums');
    expect(valeur?.className).toContain('md:hidden');
  });

  it('solde inconnu (chargement, refus, panne) : l’entrée reste nue, sans « 0 »', () => {
    soldeMock.mockReturnValue(null);
    renderSidebar('admin-agence', '/app');
    const lien = screen.getByRole('link', { name: 'Crédits' });
    expect(lien.querySelector('[data-slot="valeur-entree"]')).toBeNull();
  });
});

describe('TCK-2479 — la bande « À traiter » (ADR-0089 §5)', () => {
  const bande = () => screen.queryByRole('region', { name: 'À traiter' });
  const liensDeLaBande = () => within(bande()!).getAllByRole('link');
  const noms = () => liensDeLaBande().map((l) => l.getAttribute('aria-label'));
  /** Les `href` du MENU, dans l'ordre — la bande est hors du `<nav>`. */
  const menu = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('nav [data-groupe] a, nav [data-groupe] [role="link"]')).map(
      (a) => a.getAttribute('href') ?? a.textContent,
    );
  const chargerLesCompteurs = () => {
    unreadMock.mockReturnValue(3);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 2 } } });
    unhandledLeadsMock.mockReturnValue({ data: { meta: { total: 1 } } });
  };

  it('AC1 — agent, 3 messages et 2 visites : deux pastilles, visites d’abord, vers la page filtrée', () => {
    unreadMock.mockReturnValue(3);
    pendingVisitsMock.mockReturnValue({ data: { meta: { total: 2 } } });
    const { container } = renderSidebar('agent', '/app');

    expect(noms()).toEqual(['2 visites en attente', '3 messages non lus']);
    expect(liensDeLaBande().map((l) => l.getAttribute('href'))).toEqual(['/app/visits?tab=requested', '/app/messages']);
    // Entre l'action principale et le menu, hors du `<nav>`.
    const action = container.querySelector('[data-slot="action-principale"]')!;
    const nav = container.querySelector('nav')!;
    expect(action).not.toBeNull();
    expect(action.compareDocumentPosition(bande()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bande()!.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.contains(bande())).toBe(false);
  });

  it('AC1 — l’ordre est celui du persona : le locataire ne voit que ses messages', () => {
    chargerLesCompteurs();
    renderSidebar('locataire', '/app');
    expect(noms()).toEqual(['3 messages non lus']);
  });

  it('AC1 — à zéro partout (ou au chargement) : aucune bande, aucun nœud', () => {
    const { container } = renderSidebar('agent', '/app');
    expect(bande()).toBeNull();
    expect(container.querySelector('[data-slot="a-traiter"]')).toBeNull();
  });

  it.each(PERSONAS)('AC2 — %s : le menu garde les mêmes entrées, dans le même ordre, avec ou sans compteurs', (persona) => {
    const { container, unmount } = renderSidebar(persona, '/app');
    const avant = menu(container);
    expect(avant.length).toBeGreaterThan(0);
    unmount();
    chargerLesCompteurs();
    const { container: apres } = renderSidebar(persona, '/app');
    expect(menu(apres)).toEqual(avant);
  });

  it('AC2 — l’épreuve n’est pas vide : avec les compteurs chargés, l’agent a bien une bande', () => {
    chargerLesCompteurs();
    renderSidebar('agent', '/app');
    expect(noms()).toEqual(['1 demande non traitée', '2 visites en attente', '3 messages non lus']);
  });

  it.each([
    [
      'pendingVisits',
      () => pendingVisitsMock.mockReturnValue({ data: { meta: { total: 2 } }, isError: true }),
      ['1 demande non traitée', '3 messages non lus'],
      '2 demandes de visite en attente',
    ],
    [
      'unhandledLeads',
      () => unhandledLeadsMock.mockReturnValue({ data: { meta: { total: 1 } }, isError: true }),
      ['2 visites en attente', '3 messages non lus'],
      '1 demande non traitée',
    ],
  ] as const)('AC3 — %s en échec (relecture ratée, ancien `data` gardé) : ni pastille ni badge ; les autres restent', (_cle, enEchec, restent, badge) => {
    chargerLesCompteurs();
    enEchec();
    const { container } = renderSidebar('agent', '/app');
    expect(noms()).toEqual(restent);
    expect(within(container.querySelector('nav')!).queryByLabelText(badge)).toBeNull();
  });

  it('R1 — le badge des demandes porte enfin son nom accessible (clé manquante depuis TCK-590)', () => {
    unhandledLeadsMock.mockReturnValue({ data: { meta: { total: 4 } } });
    const { container } = renderSidebar('agent', '/app');
    const nav = container.querySelector('nav')!;
    expect(within(nav).getByLabelText('4 demandes non traitées')).toHaveTextContent('4');
  });

  it('AC6 — prestataire : une pastille au plus, la messagerie', () => {
    chargerLesCompteurs();
    renderSidebar('prestataire', '/app');
    expect(liensDeLaBande().map((l) => l.getAttribute('href'))).toEqual(['/app/messages']);
  });

  it('a11y : la barre avec sa bande, sans violation', async () => {
    chargerLesCompteurs();
    const { container } = renderSidebar('admin-agence', '/app');
    expect(bande()).not.toBeNull();
    const resultat = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    });
    expect(resultat.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`))).toEqual([]);
  });
});
