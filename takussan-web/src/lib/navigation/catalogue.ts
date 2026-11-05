import {
  BarChart3,
  BellRing,
  BookmarkCheck,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Coins,
  CreditCard,
  Download,
  FileText,
  FolderOpen,
  Gauge,
  HandCoins,
  Heart,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  MessageSquareQuote,
  PlusCircle,
  Search,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PAGES_ADMIN, type CheminAdmin } from '@/lib/access/pages-admin';
import {
  isAdmin,
  isAgent,
  isCustomer,
  isCustomerOnly,
  isOwner,
  isServiceProvider,
  isSuperAdmin,
  isTenant,
} from '@/lib/roles';
import type { UserRole } from '@/types/user';
import { HREF_CREDITS, HREF_MES_BIENS, peutOuvrirMesBiens, voitLePortefeuille } from './acces-app';
import type { ContexteDeMenu, NavCounterKey } from './types';

/**
 * TCK-2477 (ADR-0089 §1) — LE catalogue des destinations de `/app`. Il n'y en a qu'un.
 *
 * Une destination y est déclarée une fois : identifiant stable, `href`, libellé, icône, prédicat
 * d'accès. Le prédicat décide de l'ÉCRAN, jamais de la donnée : chaque API rejuge. Il reprend la
 * garde que `buildNavItems` posait sur la même entrée — l'historique de chaque garde est dans le
 * `git log` d'`AppSidebar.tsx` avant ce ticket.
 *
 * TCK-2478 — les pages d'administration d'agence y entrent (`pageAgence`), mais `PAGES_ADMIN` reste
 * leur seul juge (ADR-0064) : leur libellé, leur icône et leur accès (`AccesAdmin.chemins`) en
 * viennent, le catalogue n'en recopie aucune exigence.
 *
 * ⚠ Deux destinations peuvent partager un `href` (« Publier » et « Proposer » un bien) : leurs
 * prédicats sont alors EXCLUSIFS, ce que `catalogue.test.ts` éprouve sur tous les comptes.
 */
export interface Destination {
  readonly id: string;
  readonly href: string;
  /** Clé sous `nav.sidebar` — ou la fonction qui la choisit (`myBookings` / `bookings`). */
  readonly cle: string | ((ctx: ContexteDeMenu) => string);
  readonly icone: LucideIcon;
  /** Quand l'icône dépend du compte. Un champ à part : une icône lucide est un composant. */
  readonly iconeSelon?: (ctx: ContexteDeMenu) => LucideIcon;
  readonly accessible: (ctx: ContexteDeMenu) => boolean;
  readonly misEnAvant?: boolean;
  readonly compteur?: NavCounterKey;
  /**
   * TCK-2479 (ADR-0089 §1) — la page de la destination FILTRÉE sur ce qui attend : la cible de la
   * pastille « À traiter » de son compteur. Même chemin que `href` ; chacun de ses paramètres est LU
   * par la page (`a-traiter-lu-par-sa-page.test.ts`). Absente, la pastille mène à `href` — la page est
   * alors déjà la file, ou n'a pas de filtre, et la garde exige qu'elle soit dans `SANS_FILTRE`.
   */
  readonly hrefATraiter?: string;
  /** Espace de la clé de libellé : `nav.sidebar` par défaut, `nav.admin` pour une page d'agence. */
  readonly espace?: 'nav.admin';
  /** Une entrée dont le seul objet est une écriture : retirée d'un espace suspendu (TCK-600). */
  readonly ecriture?: true;
  /** Une page du site public : son `href` se localise au rendu (`cheminLocalise`, ADR-0026). */
  readonly publique?: true;
  /**
   * Revue de TCK-2478 (I2) — une destination jugée sur l'ESPACE (l'union des rôles), jamais sur les
   * seuls rôles du persona, parce que SA PAGE se juge ainsi. `/app/properties/new` choisit son mode
   * sur l'union (`modeDeCreationDeBien(user.roles)`) et les capacités que l'API rend sont un OU entre
   * les profils de l'agence : le bailleur d'un espace où il est aussi admin y PUBLIE. Jugé sur le
   * persona, le bouton disait « Proposer un bien », la page publiait, et « Publier un bien » revenait
   * sous « Aussi administrateur » vers la même URL. `composerMenu` la juge sur l'espace partout —
   * action, groupes, « Plus » —, et elle ne paraît donc jamais dans « Aussi … ».
   */
  readonly surLEspace?: true;
}

/**
 * TCK-379 — qui occupe ou gère un logement. Prédicat POSITIF, et non `!isServiceProvider` : `roles`
 * est un tableau, et un compte prestataire ET locataire garde ses baux (cf. le docblock d'origine,
 * `git show 0b7deae44:takussan-web/src/components/layout/AppSidebar.tsx`, l. 162-189).
 */
function occupeUnLogement(roles: UserRole[]): boolean {
  return (
    isCustomer(roles) || isTenant(roles) || isOwner(roles) || isAgent(roles) || isAdmin(roles)
  );
}

function personnel(roles: UserRole[]): boolean {
  return isAgent(roles) || isAdmin(roles);
}

/** P152.03 — « Publier » sous `properties.create` ; le super-admin passe tout, sans lecture. */
function peutPublier({ roles, capacites }: ContexteDeMenu): boolean {
  return personnel(roles) && (isSuperAdmin(roles) || (capacites ?? []).includes('properties.create'));
}

/** TCK-492 — `isCustomerOnly`, jamais `isCustomer` : `customer` est le plancher de tout compte. */
function client({ roles }: ContexteDeMenu): boolean {
  return isCustomerOnly(roles);
}

/**
 * TCK-2478 (ADR-0089 §1, ADR-0064 §2) — une page d'agence au catalogue. Son libellé et son icône
 * viennent de `PAGES_ADMIN`, et son accès de `AccesAdmin.chemins` : la table reste le seul juge.
 *
 * Revue de TCK-2478 (I1) — `AccesAdmin.chemins` est calculé sur l'UNION de l'espace (le layout lit
 * `user.roles`), et les capacités que l'API rend sont un OU entre les profils de l'agence
 * (`MembershipCapabilityResolver::resolveAgencyScoped`) : ni l'un ni l'autre ne dit QUEL profil ouvre
 * la page. Seul, ce chemin rangeait donc les pages d'agence sous « Plus » d'un bailleur ou d'un agent
 * qui est aussi admin, au lieu de « Aussi administrateur ». La page revient au profil d'admin :
 *  · le persona admin (ou le super-admin) l'ouvre ;
 *  · un persona sans rôle d'admin ne l'ouvre que si AUCUN profil d'admin n'est dans l'espace — alors
 *    seule sa propre délégation a pu la mettre dans `cheminsAdmin` (TCK-1412, `ouvertePar`). Sans
 *    cette branche, l'agent délégué perdait « Équipe » : ni lui ni l'union ne sont admins.
 */
function ouvreLesPagesDAgence({ roles, rolesDeLEspace = roles }: ContexteDeMenu): boolean {
  return isAdmin(roles) || !isAdmin(rolesDeLEspace);
}

/** Voir {@link ouvreLesPagesDAgence} pour le partage entre le persona et le complément. */
function pageAgence<const I extends string>(
  id: I,
  chemin: CheminAdmin,
  compteur?: NavCounterKey,
  hrefATraiter?: string,
) {
  const page = PAGES_ADMIN.find((p) => p.chemin === chemin);
  if (!page?.menu) throw new Error(`TCK-2478 — ${chemin} n'a pas de place au menu dans PAGES_ADMIN`);
  return {
    id,
    href: chemin,
    cle: page.menu.cle,
    icone: page.menu.icone,
    espace: 'nav.admin' as const,
    accessible: (ctx: ContexteDeMenu) => ouvreLesPagesDAgence(ctx) && (ctx.cheminsAdmin ?? []).includes(chemin),
    ...(compteur ? { compteur } : {}),
    ...(hrefATraiter ? { hrefATraiter } : {}),
  };
}

const TABLE = [
  { id: 'tableau-de-bord', href: '/app', cle: 'dashboard', icone: LayoutDashboard, accessible: () => true },
  {
    id: 'mes-biens',
    href: HREF_MES_BIENS,
    cle: 'myProperties',
    icone: Building2,
    accessible: ({ roles }) => peutOuvrirMesBiens(roles),
  },
  {
    id: 'publier-bien',
    ecriture: true,
    surLEspace: true,
    href: '/app/properties/new',
    cle: 'publishProperty',
    icone: PlusCircle,
    misEnAvant: true,
    accessible: peutPublier,
  },
  {
    // TCK-587 (ADR-0031) — le bailleur hors personnel PROPOSE un bien à son agence. Tant que les
    // capacités du personnel ne sont pas lues, aucune entrée de création (P152.03).
    id: 'proposer-bien',
    ecriture: true,
    surLEspace: true,
    href: '/app/properties/new',
    cle: 'proposeProperty',
    icone: PlusCircle,
    misEnAvant: true,
    accessible: (ctx) =>
      !peutPublier(ctx) && isOwner(ctx.roles) && (!personnel(ctx.roles) || ctx.capacites !== null),
  },
  // TCK-625 — un client peut devenir hôte : l'entrée mène à `/publish`.
  {
    id: 'publier-annonce',
    href: '/publish',
    cle: 'publishProperty',
    icone: PlusCircle,
    ecriture: true,
    accessible: client,
  },
  {
    id: 'messagerie',
    href: '/app/messages',
    cle: 'messaging',
    icone: MessageSquare,
    compteur: 'unreadMessages',
    accessible: () => true,
  },
  {
    id: 'reservations',
    href: '/app/bookings',
    cle: (ctx) => (client(ctx) ? 'myBookings' : 'bookings'),
    icone: CalendarCheck,
    accessible: (ctx) => client(ctx) || occupeUnLogement(ctx.roles),
  },
  {
    id: 'visites',
    href: '/app/visits',
    cle: (ctx) => (client(ctx) ? 'myVisits' : 'visits'),
    icone: CalendarClock,
    compteur: 'pendingVisits',
    hrefATraiter: '/app/visits?tab=requested',
    accessible: (ctx) => client(ctx) || occupeUnLogement(ctx.roles),
  },
  // TCK-633 lot F (ADR-0061 §1) — le portefeuille de l'espace ; l'API tranche (`boost.spend`).
  { id: 'credits', href: HREF_CREDITS, cle: 'credits', icone: Coins, accessible: ({ roles }) => voitLePortefeuille(roles) },
  // TCK-591 §3 — « Mes tâches » : même garde que son layout (`assertCanReachAgentArea`).
  { id: 'taches', href: '/app/tasks', cle: 'myTasks', icone: ListChecks, accessible: ({ roles }) => peutOuvrirMesBiens(roles) },
  // ADR-0089 — l'action principale du client : la recherche du site public.
  { id: 'chercher-bien', href: '/properties', cle: 'searchProperty', icone: Search, publique: true, accessible: client },
  { id: 'favoris', href: '/app/favorites', cle: 'myFavorites', icone: Heart, accessible: ({ roles }) => occupeUnLogement(roles) },
  {
    id: 'recherches',
    href: '/app/saved-searches',
    cle: 'savedSearches',
    icone: BookmarkCheck,
    accessible: ({ roles }) => occupeUnLogement(roles),
  },
  {
    // Le bailleur reçoit « Maintenance » avant que le prestataire ne reçoive « Interventions » :
    // c'était l'ordre des poussées, donc le libellé retenu par le dédoublonnage.
    id: 'maintenance',
    href: '/app/maintenance',
    cle: ({ roles }) => (isServiceProvider(roles) && !isOwner(roles) ? 'interventions' : 'maintenance'),
    icone: Wrench,
    accessible: (ctx) =>
      client(ctx) || isOwner(ctx.roles) || personnel(ctx.roles) || isServiceProvider(ctx.roles),
  },
  // TCK-260 — le carnet des prestataires : admin d'agence, et le super-admin par `isAdmin`.
  {
    id: 'carnet-prestataires',
    href: '/app/maintenance/providers',
    cle: 'providerBook',
    icone: Wrench,
    accessible: ({ roles }) => isAdmin(roles),
  },
  // TCK-590 — les demandes laissées sur le site public.
  {
    id: 'demandes',
    href: '/app/leads',
    cle: 'leads',
    icone: Inbox,
    compteur: 'unhandledLeads',
    hrefATraiter: '/app/leads?filtre=todo',
    accessible: ({ roles }) => isAgent(roles) || isOwner(roles) || isAdmin(roles),
  },
  {
    id: 'baux',
    href: '/app/leases',
    cle: (ctx) => (client(ctx) ? 'myLeases' : 'leases'),
    icone: FileText,
    accessible: (ctx) => client(ctx) || occupeUnLogement(ctx.roles),
  },
  {
    id: 'paiements',
    href: '/app/payments',
    cle: (ctx) => (client(ctx) ? 'payments' : 'finances'),
    icone: CreditCard,
    accessible: (ctx) => client(ctx) || isOwner(ctx.roles),
  },
  {
    // TCK-597 (A15) — « Mes avis » chez le client, la boîte des avis reçus ailleurs.
    id: 'avis',
    href: '/app/profile/reviews',
    cle: (ctx) => (client(ctx) ? 'myReviews' : 'receivedReviews'),
    icone: MessageSquareQuote,
    iconeSelon: (ctx) => (client(ctx) ? BookmarkCheck : MessageSquareQuote),
    accessible: (ctx) => client(ctx) || isOwner(ctx.roles) || personnel(ctx.roles),
  },
  // TCK-595 (ADR-0049 §3) — le grand livre des commissions.
  { id: 'commissions', href: '/app/commissions', cle: 'commissions', icone: HandCoins, accessible: ({ roles }) => personnel(roles) },
  { id: 'documents', href: '/app/documents', cle: 'documents', icone: FolderOpen, accessible: () => true },
  {
    id: 'etats-des-lieux',
    href: '/app/inventories',
    cle: 'inventories',
    icone: ClipboardList,
    accessible: (ctx) => client(ctx) || personnel(ctx.roles) || isOwner(ctx.roles),
  },
  // TCK-266 — les locataires dont l'état des lieux d'entrée attend depuis plus de 7 jours.
  {
    id: 'entrees-en-attente',
    href: '/app/leases/onboarding-pending',
    cle: 'onboardingPending',
    icone: ClipboardCheck,
    accessible: ({ roles }) => personnel(roles),
  },
  // TCK-379 — aucun tableau de bord pour le prestataire (`docs/features.md` §2.5).
  // Revue de TCK-2478 (M2) — la condition EXACTE de la garde d'`app/(dashboard)/app/overview/page.tsx` :
  // l'admin, l'agent et le bailleur y sont aiguillés vers leur vue ; sinon, seul le prestataire non
  // locataire est renvoyé sur `/app`. `occupeUnLogement` l'ouvrait à tout prestataire (plancher
  // `customer`) : un lien vers une redirection. Toucher l'une, c'est toucher l'autre.
  {
    id: 'statistiques',
    href: '/app/overview',
    cle: 'statistics',
    icone: BarChart3,
    accessible: ({ roles }) =>
      isAdmin(roles) || isAgent(roles) || isOwner(roles) || !(isServiceProvider(roles) && !isTenant(roles)),
  },
  {
    id: 'exports',
    href: '/app/overview/exports',
    cle: 'exports',
    icone: Download,
    accessible: ({ roles }) => isAdmin(roles) || isAgent(roles) || isOwner(roles),
  },
  // TCK-595 (AC17 bis) — plus pour l'agent : `reports.view_agency`, rôle d'admin d'agence.
  { id: 'vue-agence', href: '/app/overview/agency', cle: 'agencyView', icone: BarChart3, accessible: ({ roles }) => isAdmin(roles) },
  // TCK-284 — PAS standard-only (`docs/features.md` §1.12, liste fermée).
  { id: 'kpis', href: '/app/overview/kpis', cle: 'kpis', icone: Gauge, accessible: ({ roles }) => isAdmin(roles) },
  { id: 'alertes', href: '/app/overview/alerts', cle: 'alerts', icone: BellRing, accessible: ({ roles }) => isAdmin(roles) },
  // TCK-256 — l'annuaire des propriétaires ; standard-only par la page et par l'API.
  { id: 'proprietaires', href: '/app/owners', cle: 'owners', icone: Users, accessible: ({ roles }) => isAdmin(roles) },
  { id: 'clients', href: '/app/customers', cle: 'crm', icone: Users, accessible: ({ roles }) => personnel(roles) || isOwner(roles) },
  // TCK-072 — le calendrier agrégé de qui gère un catalogue.
  // Revue de TCK-2478 (M3) — et du prestataire, comme la garde de sa page (`assertCanReachCalendar`,
  // `lib/auth/guards.ts`, TCK-591) : il y lit ses interventions. Sans lui, la page lui était ouverte
  // mais absente du menu. Toucher l'une, c'est toucher l'autre.
  {
    id: 'calendrier',
    href: '/app/calendar',
    cle: 'calendar',
    icone: CalendarDays,
    accessible: ({ roles }) => isAgent(roles) || isOwner(roles) || isAdmin(roles) || isServiceProvider(roles),
  },
  pageAgence('agence-equipe', '/app/agency/team'),
  pageAgence('agence-roles', '/app/agency/roles'),
  pageAgence('agence-fiche', '/app/agency'),
  pageAgence('agence-kyc', '/app/agency/kyc'),
  pageAgence('agence-facturation', '/app/agency/billing'),
  pageAgence('agence-finances', '/app/agency/finances'),
  pageAgence(
    'agence-moderation-avis',
    '/app/agency/moderation',
    'reviewModeration',
    '/app/agency/moderation?filter[moderation_status]=pending',
  ),
  pageAgence('agence-moderation-biens', '/app/agency/moderation/properties', 'propertyModeration'),
  pageAgence('agence-journal', '/app/agency/audit'),
  pageAgence('agence-integrations', '/app/agency/integrations'),
] as const satisfies readonly Destination[];

export type IdDestination = (typeof TABLE)[number]['id'];

export const CATALOGUE: readonly (Destination & { readonly id: IdDestination })[] = TABLE;

export function cleDe(destination: Destination, ctx: ContexteDeMenu): string {
  return typeof destination.cle === 'function' ? destination.cle(ctx) : destination.cle;
}

export function iconeDe(destination: Destination, ctx: ContexteDeMenu): LucideIcon {
  return destination.iconeSelon?.(ctx) ?? destination.icone;
}

/** Ouverte au compte : son prédicat d'accès, et jamais une écriture dans un espace suspendu. */
export function estOuverte(destination: Destination, ctx: ContexteDeMenu): boolean {
  return destination.accessible(ctx) && !(destination.ecriture && ctx.agenceSuspendue);
}
