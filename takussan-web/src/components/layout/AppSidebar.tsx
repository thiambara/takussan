'use client';

import { useId } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  FileText,
  CreditCard,
  MessageSquare,
  FolderOpen,
  Wrench,
  Users,
  Lock,
  PlusCircle,
  BarChart3,
  Download,
  Gauge,
  BellRing,
  Heart,
  BookmarkCheck,
  ClipboardList,
  ClipboardCheck,
  MessageSquareQuote,
  Inbox,
  HandCoins,
  UserRound,
  Coins,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import type { UserRole } from '@/types/user';
import { isAgent, isOwner, isCustomer, isCustomerOnly, isAdmin, isServiceProvider, isTenant } from '@/lib/roles';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { entreesDeMenu, type AccesAdmin, type CheminAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import { useAuth } from '@/context/AuthContext';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import {
  AGENCY_QUEUE_REFETCH_INTERVAL_MS,
  AGENCY_QUEUE_STALE_TIME_MS,
  propertyModerationCountQueryOptions,
} from '@/lib/queries/agency-queues';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProUpgradeCard } from './ProUpgradeCard';
import { useFormatter, useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import { initialesDe, libelleDe } from '@/lib/identite';
import { APP_EXACT_ROOTS, resolveActiveHref } from '@/lib/navigation/active-path';
import { HREF_CREDITS, HREF_MES_BIENS, peutOuvrirMesBiens, voitLePortefeuille } from '@/lib/navigation/acces-app';
import { useSoldeCredits } from '@/lib/queries/credits-solde';
import { useUnreadCount } from '@/components/chat-widget/useUnreadCount';
import { usePendingVisitsCount } from '@/lib/queries/visits';
import { useUnhandledLeadsCount } from '@/lib/queries/contact-leads';

/**
 * Une entrée porte une CLÉ de libellé, pas un libellé.
 *
 * `buildNavItems` est une fonction pure appelée hors composant : `useTranslations` n'y est pas
 * appelable, et l'y rendre appelable voudrait dire la transformer en hook — donc la rendre
 * intestable et non mémoïsable. Le patron retenu est celui que TCK-286 applique partout où le
 * texte naît loin de l'écran : **la donnée transporte la clé, le rendu la résout**.
 */

/**
 * TCK-377 — Les sections se lisent dans l'ordre où le métier arrive, pas dans celui de
 * l'inventaire technique : ce qu'on ouvre à chaque fois → ce qu'on cherche → ce qu'on demande →
 * ce à quoi on s'est engagé → ce qu'on pilote → l'administration.
 *
 * TCK-649 (ADR-0064 §2) — `admin` est la section d'agence : une entrée par page de la table des
 * pages que le profil actif peut ouvrir ({@link avecSectionAgence}), titrée « Administration », ou
 * « Mon espace » chez l'admin d'une agence `individual`.
 *
 * TCK-646 — la section `catalog` (« Mes biens », « Publier un bien ») n'existe plus : ses entrées
 * sont montées en tête, dans `primary` ({@link RANG_EN_TETE}). Gardée, elle serait restée vide
 * pour tous les rôles.
 *
 * `primary` n'a **pas** de libellé, et ce n'est pas un oubli : une césure placée avant la
 * première entrée ne coupe rien. C'est la DONNÉE qui le dit ({@link SECTION_LABEL_KEYS}), pas un
 * test sur le nom de la section dans le rendu — sinon la règle vit dans le composant et se perd
 * à la première section ajoutée.
 */
export type NavSection =
  | 'primary'
  | 'discover'
  | 'requests'
  | 'engagements'
  | 'manage'
  | 'admin';

export const SECTION_ORDER: readonly NavSection[] = [
  'primary',
  'discover',
  'requests',
  'engagements',
  'manage',
  'admin',
];

/** `null` = section rendue SANS en-tête. Clés sous `nav.sidebar.sections`. */
export const SECTION_LABEL_KEYS: Record<NavSection, string | null> = {
  primary: null,
  discover: 'discover',
  requests: 'requests',
  engagements: 'engagements',
  manage: 'manage',
  admin: 'admin',
};

/**
 * Clé du compteur porté par une entrée. Le rendu la résout, la donnée ne connaît aucun nombre.
 *
 * TCK-649 — les deux files de modération de la section d'agence (`reviewModeration`,
 * `propertyModeration`) : le badge de TCK-098, que portait la barre de l'ancienne console.
 */
export type NavCounterKey =
  | 'unreadMessages'
  | 'pendingVisits'
  | 'unhandledLeads'
  | 'reviewModeration'
  | 'propertyModeration';

/** Compteurs dont le libellé accessible vit sous `nav.admin` (`pendingBadge`), pas `nav.sidebar`. */
const COMPTEURS_DE_MODERATION: ReadonlySet<NavCounterKey> = new Set([
  'reviewModeration',
  'propertyModeration',
]);

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  section: NavSection;
  emphasized?: boolean;
  locked?: boolean;
  counterKey?: NavCounterKey;
  /** TCK-633 — espace de la clé de libellé ; `nav.sidebar` par défaut, `nav.admin` pour la section d'agence. */
  labelSpace?: 'nav.admin';
}

interface AppSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
  /**
   * TCK-267 — pinned at the bottom of the sidebar (above the user footer)
   * for agency admins still on `kind = individual`. Set to `true` once the
   * agency has been promoted to `standard` so the CTA disappears for good.
   */
  agencyIsStandard?: boolean;
  /** `true` when an upgrade request is awaiting super-admin review. */
  hasPendingUpgrade?: boolean;
}

/**
 * ⚠ **TCK-377 n'a changé AUCUN droit** : il n'a fait qu'ajouter un `section:` à chaque entrée.
 * **TCK-379, lui, en change** — et c'était son objet. Les deux vivent ensemble ci-dessous : la
 * garde de rôle vient de TCK-379, le `section:` de TCK-377. `AppSidebar.test.tsx` fige le jeu
 * d'`href` rendu pour les sept rôles, et c'est lui qui dit lequel des deux a raison.
 *
 * TCK-379 — audience des entrées « occupation d'un logement » et « découverte ».
 *
 * Ces entrées étaient poussées SANS AUCUNE condition de rôle : un `service_provider` recevait
 * « Réservations », « Baux », « Visites », « Favoris », « Recherches sauvegardées » et
 * « Statistiques », dont rien dans `docs/features.md` ne lui accorde le contenu.
 *
 * La forme est un prédicat POSITIF, et non `!isServiceProvider(roles)`, pour deux raisons
 * mesurées sur le code qu'elle remplace :
 *
 *  1. `roles` est un TABLEAU. Un compte à la fois prestataire et locataire garde ses baux ;
 *     une négation les lui aurait retirés — ce qui aurait été une régression, pas un correctif.
 *  2. Le rôle `tenant` n'apparaît NULLE PART ailleurs dans `buildNavItems` (aucun des blocs
 *     `isCustomer` / `isOwner` / `isAgent` ne le couvre). Ces poussées inconditionnelles sont
 *     donc la SEULE raison pour laquelle un `tenant` voit ses baux et ses visites. L'omettre
 *     ici aurait corrigé le défaut n°4 en en fabriquant un cinquième, invisible en CI puisque
 *     aucun test ne montait cette barre.
 */
function occupeUnLogement(roles: UserRole[]): boolean {
  return (
    isCustomer(roles) || isTenant(roles) || isOwner(roles) || isAgent(roles) || isAdmin(roles)
  );
}

/**
 * TCK-646 — décision du porteur du 2026-10-14 : six destinations sont DÉPLACÉES en tête du menu,
 * juste après « Tableau de bord » (l'accueil de l'espace), dans cet ordre exact :
 * **Mes biens · Publier un bien · Messagerie · Réservations · Visites · Crédits**. Pas de raccourci
 * sur l'accueil (écartés le même jour) : l'entrée quitte sa place d'origine, et le dédoublonnage
 * par `href` garantit qu'elle n'apparaît qu'une fois.
 *
 * ⚠ **Ce tableau ORDONNE, il n'accorde rien.** Chaque entrée reste poussée — ou non — par sa garde
 * de rôle ci-dessous (TCK-379) : un profil qui ne peut pas ouvrir une page ne voit pas son entrée,
 * et les autres gardent leur ordre relatif. Toutes sont poussées en section `primary`, la seule
 * sans en-tête : sept lignes en tête se lisent sans césure.
 *
 * « Publier un bien » a deux formes et un rôle n'en reçoit jamais qu'une : `/app/properties/new`
 * pour le personnel (« Publier un bien ») et le bailleur (« Proposer un bien à mon agence »,
 * TCK-587), `/publish` pour le client seul (TCK-625). Même rang pour les deux.
 */
const RANG_EN_TETE: Readonly<Record<string, number>> = {
  '/app': 0,
  [HREF_MES_BIENS]: 1,
  '/app/properties/new': 2,
  '/publish': 2,
  '/app/messages': 3,
  '/app/bookings': 4,
  '/app/visits': 5,
  [HREF_CREDITS]: 6,
};

function rangEnTete(item: NavItem): number {
  return RANG_EN_TETE[item.href] ?? Number.MAX_SAFE_INTEGER;
}

export function buildNavItems(user: User): NavItem[] {
  const items: NavItem[] = [];
  const roles = user.roles;

  items.push({ href: '/app', labelKey: 'dashboard', icon: LayoutDashboard, section: 'primary' });

  if (peutOuvrirMesBiens(roles)) {
    items.push({ href: HREF_MES_BIENS, labelKey: 'myProperties', icon: Building2, section: 'primary' });
  }
  if (isAgent(roles) || isAdmin(roles)) {
    items.push({
      href: '/app/properties/new',
      labelKey: 'publishProperty',
      icon: PlusCircle,
      section: 'primary',
      emphasized: true,
    });
  } else if (isOwner(roles)) {
    // TCK-587 (ADR-0031) — le bailleur hors personnel ne publie pas : il PROPOSE un bien à son
    // agence, qui le relit et le publie (`PropertyController::store` impose brouillon + privé).
    // L'hôte d'une agence individuelle est son administrateur : il garde « Publier un bien ».
    items.push({
      href: '/app/properties/new',
      labelKey: 'proposeProperty',
      icon: PlusCircle,
      section: 'primary',
      emphasized: true,
    });
  }

  // TCK-625 — un client (ni bailleur, ni membre d'une agence) peut devenir hôte : rien, dans son
  // espace, ne le lui disait. L'entrée mène à `/publish`, qui l'emmène à l'assistant hôte.
  if (isCustomerOnly(roles)) {
    items.push({ href: '/publish', labelKey: 'publishProperty', icon: PlusCircle, section: 'primary' });
  }

  // Discovery shortcuts (Wave 3 / TCK-047).
  // TCK-379 — plus « visible for every signed-in user » : chercher un bien, le mettre en
  // favori et enregistrer une recherche sont des gestes de qui occupe ou gère un logement.
  if (occupeUnLogement(roles)) {
    items.push({ href: '/app/favorites', labelKey: 'myFavorites', icon: Heart, section: 'discover' });
    items.push({
      href: '/app/saved-searches',
      labelKey: 'savedSearches',
      icon: BookmarkCheck,
      section: 'discover',
    });
  }

  // TCK-492 — `isCustomerOnly`, et surtout PAS `isCustomer` : `customer` est
  // devenu le plancher de toute identité authentifiée, si bien que cette
  // première branche d'un `if / else if` aurait toujours gagné — un agent, un
  // bailleur et un administrateur auraient reçu le menu d'un acheteur, et leurs
  // propres entrées ne seraient jamais poussées.
  if (isCustomerOnly(roles)) {
    // TCK-173 — full customer flow ordered by user journey:
    // discovery (favorites/saved searches above) →
    // requests (visits, bookings, maintenance) →
    // engagements (leases, payments, inventories).
    items.push({ href: '/app/visits', labelKey: 'myVisits', icon: CalendarClock, section: 'primary', counterKey: 'pendingVisits' });
    items.push({ href: '/app/bookings', labelKey: 'myBookings', icon: CalendarCheck, section: 'primary' });
    items.push({ href: '/app/maintenance', labelKey: 'maintenance', icon: Wrench, section: 'requests' });
    items.push({ href: '/app/leases', labelKey: 'myLeases', icon: FileText, section: 'engagements' });
    items.push({ href: '/app/payments', labelKey: 'payments', icon: CreditCard, section: 'engagements' });
    items.push({ href: '/app/inventories', labelKey: 'inventories', icon: ClipboardList, section: 'engagements' });
    items.push({ href: '/app/profile/reviews', labelKey: 'myReviews', icon: BookmarkCheck, section: 'engagements' });
  } else if (isOwner(roles)) {
    items.push({ href: '/app/bookings', labelKey: 'bookings', icon: CalendarCheck, section: 'primary' });
    items.push({ href: '/app/maintenance', labelKey: 'maintenance', icon: Wrench, section: 'requests' });
    items.push({ href: '/app/leases', labelKey: 'leases', icon: FileText, section: 'engagements' });
    items.push({ href: '/app/payments', labelKey: 'finances', icon: CreditCard, section: 'engagements' });
  } else if (isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/bookings', labelKey: 'bookings', icon: CalendarCheck, section: 'primary' });
    items.push({ href: '/app/leases', labelKey: 'leases', icon: FileText, section: 'engagements' });
  }

  if (isAgent(roles) || isAdmin(roles) || isServiceProvider(roles)) {
    items.push({ href: '/app/maintenance', labelKey: isServiceProvider(roles) ? 'interventions' : 'maintenance', icon: Wrench, section: 'requests' });
  }

  // TCK-597 (A15) — la boîte des avis reçus : bailleur, agent, admin d'agence. Elle vit sur la
  // page des avis du profil. Le prestataire y a aussi sa boîte, sans entrée de menu : ses quatre
  // entrées tiennent sans césure, et une cinquième en imposerait une.
  if (!isCustomerOnly(roles) && (isOwner(roles) || isAgent(roles) || isAdmin(roles))) {
    items.push({ href: '/app/profile/reviews', labelKey: 'receivedReviews', icon: MessageSquareQuote, section: 'engagements' });
  }

  // TCK-595 (ADR-0049 §3) — le grand livre des commissions : l'agent y lit ses lignes, l'admin
  // d'agence toutes celles de l'agence (avec « marquer payée » et « annuler »).
  if (isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/commissions', labelKey: 'commissions', icon: HandCoins, section: 'engagements' });
  }

  // TCK-260 — Carnet prestataires. Visible pour agency_admin (et global
  // admin / super_admin via le gate). Ouvert aux agences `standard` ET
  // `individual` (un host individual a aussi besoin de ses prestataires).
  // La page elle-même filtre par rôle ; on ne connaît pas l'agency.kind
  // ici, le contrôle ultime est côté backend (policy + permission).
  if (
    roles.includes('agency_admin') ||
    isAdmin(roles) ||
    roles.includes('super_admin')
  ) {
    items.push({
      href: '/app/maintenance/providers',
      labelKey: 'providerBook',
      icon: Wrench,
      section: 'requests',
    });
  }

  items.push({
    href: '/app/messages',
    labelKey: 'messaging',
    icon: MessageSquare,
    section: 'primary',
    counterKey: 'unreadMessages',
  });
  items.push({ href: '/app/documents', labelKey: 'documents', icon: FolderOpen, section: 'engagements' });

  // TCK-032 overview/stats
  // TCK-379 — `docs/features.md` §2.5 n'accorde AUCUN tableau de bord au prestataire, et
  // `/app/overview` aiguillait le sien vers la vue LOCATAIRE, qui lui répond
  // `has_customer_profile: false`. L'entrée n'est plus montrée, et l'aiguillage ne l'y envoie
  // plus (`app/overview/page.tsx`) : les deux moitiés du même défaut.
  if (occupeUnLogement(roles)) {
    items.push({ href: '/app/overview', labelKey: 'statistics', icon: BarChart3, section: 'manage' });
  }
  if (isAdmin(roles) || isAgent(roles) || isOwner(roles)) {
    // TCK-032 overview/stats — exports (P2)
    items.push({ href: '/app/overview/exports', labelKey: 'exports', icon: Download, section: 'manage' });
  }
  // Vue agence cross-team — visible to agency_admin so individuals see the
  // padlock, and to agents/admins. Standard-only : la page redirige elle-même
  // (`overview/agency/page.tsx`, test en ligne sur `agency.kind`) et l'API
  // rend 403 (`DashboardAgencyController`). Le cadenas couvre les DEUX rôles
  // servis ici — `isProRouteLocked` inclut `agent` depuis TCK-284, sans quoi
  // un agent d'agence `individual` cliquait une entrée d'apparence normale
  // pour se faire renvoyer en silence.
  //
  // TCK-595 (AC17 bis) — plus pour l'agent : les chiffres consolidés s'ouvrent par
  // `reports.view_agency` (rôle d'admin d'agence), l'API rend 403 à l'agent et le layout de la page
  // le renvoie sur sa vue. L'agent qui détient la capacité par un rôle personnalisé lit l'agence
  // par la bascule « Agence » de sa propre vue.
  if (roles.includes('agency_admin') || isAdmin(roles)) {
    items.push({ href: '/app/overview/agency', labelKey: 'agencyView', icon: BarChart3, section: 'manage' });
  }

  // TCK-633 lot F (ADR-0061 §1) — le portefeuille de crédits de l'espace. Le rôle approche
  // `boost.spend` (accordée à l'admin d'espace) ; la page et l'API tranchent (403 sinon).
  if (voitLePortefeuille(roles)) {
    items.push({ href: HREF_CREDITS, labelKey: 'credits', icon: Coins, section: 'primary' });
  }
  if (isAdmin(roles) || roles.includes('agency_admin')) {
    // TCK-032 overview/stats — KPIs personnalisables (P3) et alertes (P3).
    // TCK-284 — PAS standard-only : les deux pages ne portent plus aucun test
    // sur `agency.kind`, et ne sont plus dans `PRO_ROUTES`. La spec ne les
    // restreint pas (`docs/features.md` §1.12, liste fermée + clause
    // résiduelle) et l'API ne les a jamais restreintes.
    items.push({ href: '/app/overview/kpis', labelKey: 'kpis', icon: Gauge, section: 'manage' });
    items.push({ href: '/app/overview/alerts', labelKey: 'alerts', icon: BellRing, section: 'manage' });
  }

  // TCK-256 — owners directory. Visible to agency_admin and global admins.
  // Standard-only : `owners/page.tsx` redirige sur `agency.kind !== 'standard'`,
  // et l'API rend 403 des deux côtés — sur l'invitation
  // (`OwnerProfilePolicy@invite`) comme sur la LECTURE de la liste
  // (`OwnerProfileController::index` + `AgencyKindGuard`, TCK-284).
  if (
    roles.includes('agency_admin') ||
    isAdmin(roles) ||
    roles.includes('super_admin')
  ) {
    items.push({ href: '/app/owners', labelKey: 'owners', icon: Users, section: 'manage' });
  }

  // TCK-267 — "Passer en pro" CTA is rendered as a pinned card at the
  // bottom of the sidebar (above the user footer) instead of an inline
  // nav row. See {@see ProUpgradeCard} below for the visual, and the
  // conditional render in {@see AppSidebar} for the gate (which now also
  // checks `agency.kind` to hide the card once the agency is `standard`).

  // TCK-041 dashboard agent — biens: the `/app/properties` and
  // `/app/properties/new` entries above are now owned by TCK-041 (dashboard
  // agent CRUD). The dedup filter at the bottom keeps first occurrences.
  // TCK-042 dashboard agent — CRM
  if (isAgent(roles) || isAdmin(roles) || isOwner(roles)) {
    items.push({ href: '/app/customers', labelKey: 'crm', icon: Users, section: 'manage' });
  }
  // TCK-030 maintenance — entry already pushed above for agent/admin/service_provider.
  // TCK-031 inventories — agency-side workflow (entrée/sortie par bail).
  if (isAgent(roles) || isAdmin(roles) || isOwner(roles)) {
    items.push({ href: '/app/inventories', labelKey: 'inventories', icon: ClipboardList, section: 'engagements' });
  }
  // --- Wave 3 Ops Frontend nav entries (dedup below preserves first occurrence) ---
  // TCK-379 — ce bloc poussait `/app/bookings`, `/app/visits` et `/app/leases` sans aucune
  // condition de rôle. Le dédoublonnage plus bas masquait le défaut pour cinq rôles sur six
  // (l'entrée était déjà poussée avec sa garde au-dessus) ; il ne le masquait pas pour le
  // prestataire, seul rôle à qui ces trois entrées n'arrivaient QUE par ici.
  if (occupeUnLogement(roles)) {
    // TCK-043 bookings
    items.push({ href: '/app/bookings', labelKey: isCustomerOnly(roles) ? 'myBookings' : 'bookings', icon: CalendarCheck, section: 'primary' });
    // TCK-075 visits — customers see their requests, agents see what to manage.
    items.push({ href: '/app/visits', labelKey: isCustomerOnly(roles) ? 'myVisits' : 'visits', icon: CalendarClock, section: 'primary', counterKey: 'pendingVisits' });
  }
  // TCK-590 — la boîte « Demandes » : les messages laissés sur le site public, avec le nombre de
  // non traitées. Même audience que l'agenda : le bailleur est destinataire des demandes de ses
  // biens quand aucun agent n'en est le contact.
  if (isAgent(roles) || isOwner(roles) || isAdmin(roles)) {
    items.push({ href: '/app/leads', labelKey: 'leads', icon: Inbox, section: 'requests', counterKey: 'unhandledLeads' });
  }
  // TCK-072 — calendrier agrégé (visible pour agent/owner/admin qui gèrent un catalogue)
  if (isAgent(roles) || isOwner(roles) || isAdmin(roles)) {
    items.push({ href: '/app/calendar', labelKey: 'calendar', icon: CalendarDays, section: 'manage' });
  }
  // TCK-044 leases
  if (occupeUnLogement(roles)) {
    items.push({ href: '/app/leases', labelKey: isCustomerOnly(roles) ? 'myLeases' : 'leases', icon: FileText, section: 'engagements' });
  }
  // TCK-266 — sub-entry for the agency console: tenants whose move-in
  // inventory has been pending for more than 7 days. Visible to
  // agency_admin and agent (admin gate covers super_admin too).
  if (isAgent(roles) || isAdmin(roles)) {
    items.push({
      href: '/app/leases/onboarding-pending',
      labelKey: 'onboardingPending',
      icon: ClipboardCheck,
      section: 'engagements',
    });
  }
  // TCK-045 messages
  items.push({
    href: '/app/messages',
    labelKey: 'messaging',
    icon: MessageSquare,
    section: 'primary',
    counterKey: 'unreadMessages',
  });

  // TCK-649 — la section `admin` n'est PAS poussée ici : elle dépend de ce que le profil actif peut
  // ouvrir, que cette fonction — qui ne connaît que les rôles — ne sait pas. `avecSectionAgence`.

  // Dedup by href while preserving first occurrence
  const seen = new Set<string>();
  const uniques = items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
  // TCK-646 — la tête du menu dans l'ordre du porteur ; le reste garde son ordre de poussée (le
  // tri de `Array.prototype.sort` est stable).
  return uniques.sort((a, b) => rangEnTete(a) - rangEnTete(b));
}


/**
 * TCK-377 — Anneau de focus sur toutes les cibles cliquables de la barre.
 *
 * Il n'y en avait AUCUN : au clavier, seul le contour par défaut du navigateur subsistait. Le
 * jeton `--ring` (#a85332) mesure 5,32:1 sur le fond réel de l'aside (`--card` = #ffffff) et
 * 4,23:1 sur le fond de l'entrée ACTIVE (`--border` = #ebe5d5) — au-dessus du seuil non-texte de
 * 3:1 dans les deux cas, ce qui rend le `ring-offset` inutile ici. ⚠ Le jumeau super-admin
 * (TCK-359) a dû l'ajouter parce que là-bas `--ring` et `--sidebar-primary` se confondent sur
 * fond sombre ; ce n'est pas le cas sur la palette claire de `/app`, mesuré et non déduit.
 */
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Les pages de la section d'agence qui portent le compte d'une file d'attente. */
const COMPTEUR_DE_PAGE: Partial<Record<CheminAdmin, NavCounterKey>> = {
  '/app/agency/moderation': 'reviewModeration',
  '/app/agency/moderation/properties': 'propertyModeration',
};

/**
 * TCK-649 (ADR-0064 §2, AC2) — la section d'agence du menu, DÉRIVÉE de la table des pages.
 *
 * Une entrée par page à menu que le profil actif peut ouvrir (`entreesDeMenu`), dans l'ordre de la
 * table, avec son libellé et son icône ; aucune s'il n'en a aucune — la section disparaît alors
 * avec ses entrées ({@link groupBySection}). Elle remplace l'entrée unique « Administration » de
 * TCK-633, qui faisait changer de coque au clic.
 *
 * ⚠ C'est la TABLE qui dit qui voit quoi, jamais ce composant : aucune condition de rôle ici.
 */
export function avecSectionAgence(items: NavItem[], acces: AccesAdmin): NavItem[] {
  const section = entreesDeMenu(acces).map(
    (entree): NavItem => ({
      href: entree.chemin,
      labelKey: entree.cle,
      icon: entree.icone,
      section: 'admin',
      labelSpace: 'nav.admin',
      counterKey: COMPTEUR_DE_PAGE[entree.chemin],
    }),
  );
  return [...items, ...section];
}

function SidebarCounter({ value, label }: { value: number; label: string }) {
  return (
    <span
      aria-label={label}
      className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

function SidebarItem({
  href,
  labelKey,
  icon: Icon,
  active,
  emphasized,
  locked,
  counterKey,
  counter,
  onNavigate,
  labelSpace,
  valeur,
  nomAccessible,
}: NavItem & {
  active: boolean;
  counter?: number;
  onNavigate?: () => void;
  /** TCK-642 — une valeur en bout de ligne (le solde de crédits), déjà mise en forme. */
  valeur?: string;
  nomAccessible?: string;
}) {
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const label = labelSpace === 'nav.admin' ? tAdmin(labelKey) : t(labelKey);
  const libelleCompteur = (cle: NavCounterKey, count: number) =>
    COMPTEURS_DE_MODERATION.has(cle) ? tAdmin('pendingBadge', { count }) : t(`counters.${cle}`, { count });

  if (locked) {
    return (
      <span
        role="link"
        aria-disabled="true"
        title={t('proLocked')}
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground max-md:py-2.5"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <Lock className="ml-auto size-3.5 shrink-0" aria-hidden />
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={nomAccessible}
      className={cn(
        // `max-md:` = le tiroir seul (la barre fixe n'existe qu'à partir de `md`) : 40 px par
        // entrée au doigt, 36 px inchangés au pointeur.
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors max-md:py-2.5',
        FOCUS_RING,
        active
          ? 'bg-border text-foreground font-semibold'
          : 'text-muted-foreground hover:bg-muted',
        emphasized && !active && 'text-foreground font-semibold',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      {counterKey && counter && counter > 0 ? (
        <SidebarCounter value={counter} label={libelleCompteur(counterKey, counter)} />
      ) : null}
      {/* `md:hidden` : à partir de `md`, la pastille de la barre haute porte déjà le solde — la
          valeur ne s'affiche que dans le tiroir, le « menu mobile » de `/app`. */}
      {valeur !== undefined ? (
        <span
          data-slot="valeur-entree"
          className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground md:hidden"
        >
          {valeur}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarUserFooter({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const t = useTranslations('nav');
  // TCK-623 — un compte sans nom (téléphone, OAuth) : une silhouette, et ce qui désigne le compte.
  const initials = initialesDe(user);
  const libelle = libelleDe(user) ?? t('accountFallback');
  return (
    <Link
      href="/app/profile"
      onClick={onNavigate}
      className={cn('flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted', FOCUS_RING)}
    >
      <Avatar className="size-9">
        {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={libelle} /> : null}
        <AvatarFallback className="bg-foreground text-white">
          {initials ?? <UserRound className="size-4" aria-hidden="true" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{libelle}</p>
        <p className="truncate text-xs text-muted-foreground">{t('myProfile')}</p>
      </div>
    </Link>
  );
}

/**
 * Regroupe les entrées par section, dans l'ordre de {@link SECTION_ORDER}, en préservant l'ordre
 * de poussée à l'intérieur d'une section.
 *
 * Les sections vides ne rendent RIEN — c'est ce qui fait qu'un `customer`, qui n'a pas de
 * catalogue, ne voit pas de césure « Catalogue » vide. Et si le regroupement aboutissait à une
 * seule section non vide, les en-têtes disparaissent tous : *une césure unique ne coupe rien.*
 */
export function groupBySection(items: NavItem[]): { section: NavSection; items: NavItem[] }[] {
  const groups = SECTION_ORDER.map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);
  return groups;
}

/**
 * TCK-377 — « le groupement s'efface quand il n'a plus de travail à faire ».
 *
 * ⚠ Cette règle a d'abord été écrite `groups.length > 1`, **directement dans le composant**, et
 * elle y était doublement inerte :
 *
 *  1. **Aucun utilisateur ne la fait basculer.** `buildNavItems` pousse `/app` et `/app/messages`
 *     en `primary` et `/app/documents` en `engagements` SANS aucune condition de rôle : le
 *     minimum absolu est de DEUX groupes, y compris pour un compte sans aucun rôle. La branche
 *     `false` n'était donc atteignable par personne — et une règle qu'aucune entrée ne peut violer
 *     n'est pas gardable : la mutation `withHeadings = true` laissait les 88 tests verts.
 *  2. **Elle ne mesurait pas ce que la règle dit.** Ce qu'un en-tête doit gagner, c'est de la
 *     SÉPARATION ; une césure posée au-dessus d'UNE entrée n'en produit aucune. Compter les
 *     groupes ne le voit pas, compter les entrées d'un groupe le voit.
 *
 * La forme retenue garde l'ancienne clause et lui en ajoute une seconde, réellement atteignable :
 * les en-têtes ne paraissent que si **au moins une section LIBELLÉE porte deux entrées ou plus**.
 * `primary` est exclue de ce décompte parce qu'elle n'a pas de libellé ({@link SECTION_LABEL_KEYS})
 * — elle ne peut donc justifier aucune césure.
 *
 * Mesuré sur les sept rôles au 2026-08-27 : la seconde clause ne change le rendu que du
 * `service_provider`, qui recevait 2 en-têtes au-dessus d'UNE entrée chacune pour 4 entrées en
 * tout — exactement le cas que la Direction UX du ticket nomme. Les six autres rôles ont au moins
 * une section libellée à deux entrées et gardent leurs césures.
 */
export function withSectionHeadings(groups: { section: NavSection; items: NavItem[] }[]): boolean {
  if (groups.length <= 1) return false;
  return groups.some(
    (group) => SECTION_LABEL_KEYS[group.section] !== null && group.items.length > 1,
  );
}

/**
 * TCK-377 — AC6 : quels compteurs sont réellement sondés.
 *
 * Le sondage est armé par la PRÉSENCE de l'entrée comptée, jamais par une liste de rôles recopiée
 * à côté de la condition qui pousse l'entrée : *deux listes de rôles finissent toujours par
 * diverger, une liste dérivée non.* Une entrée cadenassée ne compte pas non plus — le cadenas
 * signifie que la page répondra 403, et un menu ne sonde pas une porte fermée.
 *
 * ⚠ **Ce paragraphe disait l'inverse jusqu'au 2026-08-27**, et la correction est le fait le plus
 * important de cet AC. Il annonçait « aucun des sept rôles ne déclenche la branche `false` », ce
 * qui était vrai du code de TCK-377 seul : `/app/visits` y était poussée sans garde de rôle. **Le
 * même lot a fusionné TCK-379, qui la retire au `service_provider`** — la branche `false` est donc
 * ATTEINTE par un rôle réel (`service_provider` → `{unreadMessages}` seul), et c'est précisément à
 * ce moment-là que plus rien ne l'observait : la mutation « les deux compteurs armés en dur »
 * laissait les 88 tests verts.
 *
 * Elle est désormais éprouvée **sur le composant monté**, rôle par rôle
 * (`AppSidebar.test.tsx`, AC6) : une fonction pure verte ne dit rien de ce que le composant en
 * fait.
 */
export function countersToPoll(items: NavItem[]): Set<NavCounterKey> {
  const keys = new Set<NavCounterKey>();
  for (const item of items) {
    if (item.counterKey && !item.locked) keys.add(item.counterKey);
  }
  return keys;
}

export function AppSidebar({
  user,
  className,
  onNavigate,
  agencyIsStandard,
  hasPendingUpgrade,
}: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const idTitres = useId();
  const { token } = useAuth();
  const accesAdmin = useAccesAdminOuRepli({
    roles: user.roles,
    agencyId: user.agency_id,
    agencyIsStandard,
  });
  const navItems = avecSectionAgence(buildNavItems(user), accesAdmin).map((item) => ({
    ...item,
    locked: isProRouteLocked(user, agencyIsStandard, item.href),
  }));

  const counted = countersToPoll(navItems);
  const unreadMessages = useUnreadCount({ enabled: counted.has('unreadMessages') });
  const pendingVisits = usePendingVisitsCount({ enabled: counted.has('pendingVisits') });
  const unhandledLeads = useUnhandledLeadsCount({ enabled: counted.has('unhandledLeads') });
  // TCK-649 — les deux files de modération, reprises à l'identique de la barre de l'ancienne
  // console (TCK-098) : mêmes clés de cache — celle des biens est partagée avec le bloc de files du
  // tableau de bord d'agence (TCK-375), qui vit désormais dans la MÊME coque —, même cadence.
  const { data: avisEnAttente } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () => fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    enabled: Boolean(token) && counted.has('reviewModeration'),
    refetchInterval: AGENCY_QUEUE_REFETCH_INTERVAL_MS,
    staleTime: AGENCY_QUEUE_STALE_TIME_MS,
  });
  const optionsBiens = propertyModerationCountQueryOptions(token ?? null, agencyIsStandard);
  const { data: biensEnAttente } = useQuery({
    ...optionsBiens,
    enabled: optionsBiens.enabled && counted.has('propertyModeration'),
  });
  // Une requête en échec rend `data === undefined` : le compteur vaut 0, et 0 ne s'affiche pas.
  // C'est la même branche que « rien en attente » — délibérément : le menu n'est pas l'endroit
  // où l'on apprend qu'un endpoint est tombé.
  const counters: Record<NavCounterKey, number> = {
    unreadMessages,
    pendingVisits: pendingVisits.data?.meta.total ?? 0,
    unhandledLeads: unhandledLeads.data?.meta?.total ?? 0,
    reviewModeration: avisEnAttente?.pending_count ?? 0,
    propertyModeration: biensEnAttente ?? 0,
  };
  // TCK-642 — le solde de l'espace, lu par la PRÉSENCE de l'entrée « Crédits » (même principe que
  // les compteurs) ; `null` tant qu'il n'est pas connu, et alors l'entrée reste nue.
  const solde = useSoldeCredits({
    enabled: navItems.some((item) => item.href === HREF_CREDITS && !item.locked),
  });

  const activeHref = resolveActiveHref(
    pathname,
    navItems.map((item) => item.href),
    APP_EXACT_ROOTS,
  );
  const groups = groupBySection(navItems);
  const withHeadings = withSectionHeadings(groups);

  const showProUpgradeCard =
    user.roles.includes('agency_admin') &&
    typeof user.agency_id === 'number' &&
    agencyIsStandard === false;

  return (
    <aside className={cn('flex h-full w-64 flex-col bg-card', className)}>
      {/* Revue design 2026-09-16 — à partir de `md`, la barre haute porte déjà la marque, 60 px
          au-dessus : le second logo ne se lisait que comme un doublon. Il reste dans le tiroir,
          où la barre haute est recouverte. `-mx-1 px-1` : l'anneau de focus — posé sur ce lien
          à l'ouverture du tiroir — ne rase plus les glyphes. */}
      <div className="px-5 py-5 md:hidden">
        <Link
          href="/"
          onClick={onNavigate}
          className={cn('inline-flex rounded-md px-1 py-1', FOCUS_RING)}
        >
          <Logo nom={tCommon('appName')} />
        </Link>
      </div>
      <nav aria-label={t('navLabel')} className="flex-1 overflow-y-auto px-3 pb-2 md:pt-5">
        {groups.map((group, index) => {
          const labelKey = SECTION_LABEL_KEYS[group.section];
          // TCK-649 — la section d'agence d'un admin `individual` s'appelle « Mon espace », comme
          // l'entrée unique qu'elle remplace (TCK-633).
          const titre = !withHeadings || labelKey === null
            ? null
            : group.section === 'admin' && accesAdmin.espaceIndividuel
              ? tAdmin('mySpace')
              : t(`sections.${labelKey}`);
          const idTitre = `${idTitres}-${group.section}`;
          // Une section titrée se lit comme un GROUPE : le lecteur d'écran annonce son nom en y
          // entrant (« Administration, groupe »), comme l'œil lit l'en-tête.
          return (
            <div
              key={group.section}
              role={titre ? 'group' : undefined}
              aria-labelledby={titre ? idTitre : undefined}
              className={cn('space-y-1', index > 0 && 'mt-4')}
            >
              {titre ? (
                <p
                  id={idTitre}
                  className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {titre}
                </p>
              ) : null}
              {group.items.map((item) => (
                <SidebarItem
                  key={item.href}
                  {...item}
                  active={item.href === activeHref}
                  counter={item.counterKey ? counters[item.counterKey] : undefined}
                  onNavigate={onNavigate}
                  {...(item.href === HREF_CREDITS && solde !== null
                    ? { valeur: format.number(solde), nomAccessible: tNav('creditsBalance', { count: solde }) }
                    : {})}
                />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="px-3 pb-4">
        {showProUpgradeCard ? (
          <ProUpgradeCard pending={Boolean(hasPendingUpgrade)} onNavigate={onNavigate} />
        ) : null}
        <SidebarUserFooter user={user} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
