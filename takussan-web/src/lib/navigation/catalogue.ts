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
  MessageSquare,
  MessageSquareQuote,
  PlusCircle,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
 * Les pages d'administration d'agence n'y sont PAS : `PAGES_ADMIN` reste leur seul juge (ADR-0064),
 * et `avecSectionAgence` les ajoute au menu.
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
    href: '/app/properties/new',
    cle: 'proposeProperty',
    icone: PlusCircle,
    misEnAvant: true,
    accessible: (ctx) =>
      !peutPublier(ctx) && isOwner(ctx.roles) && (!personnel(ctx.roles) || ctx.capacites !== null),
  },
  // TCK-625 — un client peut devenir hôte : l'entrée mène à `/publish`.
  { id: 'publier-annonce', href: '/publish', cle: 'publishProperty', icone: PlusCircle, accessible: client },
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
    accessible: (ctx) => client(ctx) || occupeUnLogement(ctx.roles),
  },
  // TCK-633 lot F (ADR-0061 §1) — le portefeuille de l'espace ; l'API tranche (`boost.spend`).
  { id: 'credits', href: HREF_CREDITS, cle: 'credits', icone: Coins, accessible: ({ roles }) => voitLePortefeuille(roles) },
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
  { id: 'statistiques', href: '/app/overview', cle: 'statistics', icone: BarChart3, accessible: ({ roles }) => occupeUnLogement(roles) },
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
  {
    id: 'calendrier',
    href: '/app/calendar',
    cle: 'calendar',
    icone: CalendarDays,
    accessible: ({ roles }) => isAgent(roles) || isOwner(roles) || isAdmin(roles),
  },
] as const satisfies readonly Destination[];

export type IdDestination = (typeof TABLE)[number]['id'];

export const CATALOGUE: readonly (Destination & { readonly id: IdDestination })[] = TABLE;

export function cleDe(destination: Destination, ctx: ContexteDeMenu): string {
  return typeof destination.cle === 'function' ? destination.cle(ctx) : destination.cle;
}

export function iconeDe(destination: Destination, ctx: ContexteDeMenu): LucideIcon {
  return destination.iconeSelon?.(ctx) ?? destination.icone;
}
