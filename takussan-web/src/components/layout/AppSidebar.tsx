'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  ShieldCheck,
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import type { UserRole } from '@/types/user';
import { isAgent, isOwner, isCustomer, isAdmin, isServiceProvider, isTenant } from '@/lib/roles';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProUpgradeCard } from './ProUpgradeCard';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Une entrée porte une CLÉ de libellé, pas un libellé.
 *
 * `buildNavItems` est une fonction pure appelée hors composant : `useTranslations` n'y est pas
 * appelable, et l'y rendre appelable voudrait dire la transformer en hook — donc la rendre
 * intestable et non mémoïsable. Le patron retenu est celui que TCK-286 applique partout où le
 * texte naît loin de l'écran : **la donnée transporte la clé, le rendu la résout**.
 */
interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  emphasized?: boolean;
  locked?: boolean;
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

export function buildNavItems(user: User): NavItem[] {
  const items: NavItem[] = [];
  const roles = user.roles;

  items.push({ href: '/app', labelKey: 'dashboard', icon: LayoutDashboard });

  if (isOwner(roles) || isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/properties', labelKey: 'myProperties', icon: Building2 });
  }
  if (isAgent(roles) || isAdmin(roles)) {
    items.push({
      href: '/app/properties/new',
      labelKey: 'publishProperty',
      icon: PlusCircle,
      emphasized: true,
    });
  }

  // Discovery shortcuts (Wave 3 / TCK-047).
  // TCK-379 — plus « visible for every signed-in user » : chercher un bien, le mettre en
  // favori et enregistrer une recherche sont des gestes de qui occupe ou gère un logement.
  if (occupeUnLogement(roles)) {
    items.push({ href: '/app/favorites', labelKey: 'myFavorites', icon: Heart });
    items.push({
      href: '/app/saved-searches',
      labelKey: 'savedSearches',
      icon: BookmarkCheck,
    });
  }

  if (isCustomer(roles)) {
    // TCK-173 — full customer flow ordered by user journey:
    // discovery (favorites/saved searches above) →
    // requests (visits, bookings, maintenance) →
    // engagements (leases, payments, inventories).
    items.push({ href: '/app/visits', labelKey: 'myVisits', icon: CalendarClock });
    items.push({ href: '/app/bookings', labelKey: 'myBookings', icon: CalendarCheck });
    items.push({ href: '/app/maintenance', labelKey: 'maintenance', icon: Wrench });
    items.push({ href: '/app/leases', labelKey: 'myLeases', icon: FileText });
    items.push({ href: '/app/payments', labelKey: 'payments', icon: CreditCard });
    items.push({ href: '/app/inventories', labelKey: 'inventories', icon: ClipboardList });
    items.push({ href: '/app/profile/reviews', labelKey: 'myReviews', icon: BookmarkCheck });
  } else if (isOwner(roles)) {
    items.push({ href: '/app/bookings', labelKey: 'bookings', icon: CalendarCheck });
    items.push({ href: '/app/maintenance', labelKey: 'maintenance', icon: Wrench });
    items.push({ href: '/app/leases', labelKey: 'leases', icon: FileText });
    items.push({ href: '/app/payments', labelKey: 'finances', icon: CreditCard });
  } else if (isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/bookings', labelKey: 'bookings', icon: CalendarCheck });
    items.push({ href: '/app/leases', labelKey: 'leases', icon: FileText });
  }

  if (isAgent(roles) || isAdmin(roles) || isServiceProvider(roles)) {
    items.push({ href: '/app/maintenance', labelKey: isServiceProvider(roles) ? 'interventions' : 'maintenance', icon: Wrench });
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
    });
  }

  items.push({ href: '/app/messages', labelKey: 'messaging', icon: MessageSquare });
  items.push({ href: '/app/documents', labelKey: 'documents', icon: FolderOpen });

  // TCK-032 overview/stats
  // TCK-379 — `docs/features.md` §2.5 n'accorde AUCUN tableau de bord au prestataire, et
  // `/app/overview` aiguillait le sien vers la vue LOCATAIRE, qui lui répond
  // `has_customer_profile: false`. L'entrée n'est plus montrée, et l'aiguillage ne l'y envoie
  // plus (`app/overview/page.tsx`) : les deux moitiés du même défaut.
  if (occupeUnLogement(roles)) {
    items.push({ href: '/app/overview', labelKey: 'statistics', icon: BarChart3 });
  }
  if (isAdmin(roles) || isAgent(roles) || isOwner(roles)) {
    // TCK-032 overview/stats — exports (P2)
    items.push({ href: '/app/overview/exports', labelKey: 'exports', icon: Download });
  }
  // Vue agence cross-team — visible to agency_admin so individuals see the
  // padlock, and to agents/admins. Standard-only : la page redirige elle-même
  // (`overview/agency/page.tsx`, test en ligne sur `agency.kind`) et l'API
  // rend 403 (`DashboardAgencyController`). Le cadenas couvre les DEUX rôles
  // servis ici — `isProRouteLocked` inclut `agent` depuis TCK-284, sans quoi
  // un agent d'agence `individual` cliquait une entrée d'apparence normale
  // pour se faire renvoyer en silence.
  if (roles.includes('agency_admin') || isAdmin(roles) || isAgent(roles)) {
    items.push({ href: '/app/overview/agency', labelKey: 'agencyView', icon: BarChart3 });
  }
  if (isAdmin(roles) || roles.includes('agency_admin')) {
    // TCK-032 overview/stats — KPIs personnalisables (P3) et alertes (P3).
    // TCK-284 — PAS standard-only : les deux pages ne portent plus aucun test
    // sur `agency.kind`, et ne sont plus dans `PRO_ROUTES`. La spec ne les
    // restreint pas (`docs/features.md` §1.12, liste fermée + clause
    // résiduelle) et l'API ne les a jamais restreintes.
    items.push({ href: '/app/overview/kpis', labelKey: 'kpis', icon: Gauge });
    items.push({ href: '/app/overview/alerts', labelKey: 'alerts', icon: BellRing });
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
    items.push({ href: '/app/owners', labelKey: 'owners', icon: Users });
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
    items.push({ href: '/app/customers', labelKey: 'crm', icon: Users });
  }
  // TCK-030 maintenance — entry already pushed above for agent/admin/service_provider.
  // TCK-031 inventories — agency-side workflow (entrée/sortie par bail).
  if (isAgent(roles) || isAdmin(roles) || isOwner(roles)) {
    items.push({ href: '/app/inventories', labelKey: 'inventories', icon: ClipboardList });
  }
  // --- Wave 3 Ops Frontend nav entries (dedup below preserves first occurrence) ---
  // TCK-379 — ce bloc poussait `/app/bookings`, `/app/visits` et `/app/leases` sans aucune
  // condition de rôle. Le dédoublonnage plus bas masquait le défaut pour cinq rôles sur six
  // (l'entrée était déjà poussée avec sa garde au-dessus) ; il ne le masquait pas pour le
  // prestataire, seul rôle à qui ces trois entrées n'arrivaient QUE par ici.
  if (occupeUnLogement(roles)) {
    // TCK-043 bookings
    items.push({ href: '/app/bookings', labelKey: isCustomer(roles) ? 'myBookings' : 'bookings', icon: CalendarCheck });
    // TCK-075 visits — customers see their requests, agents see what to manage.
    items.push({ href: '/app/visits', labelKey: isCustomer(roles) ? 'myVisits' : 'visits', icon: CalendarClock });
  }
  // TCK-072 — calendrier agrégé (visible pour agent/owner/admin qui gèrent un catalogue)
  if (isAgent(roles) || isOwner(roles) || isAdmin(roles)) {
    items.push({ href: '/app/calendar', labelKey: 'calendar', icon: CalendarDays });
  }
  // TCK-044 leases
  if (occupeUnLogement(roles)) {
    items.push({ href: '/app/leases', labelKey: isCustomer(roles) ? 'myLeases' : 'leases', icon: FileText });
  }
  // TCK-266 — sub-entry for the agency console: tenants whose move-in
  // inventory has been pending for more than 7 days. Visible to
  // agency_admin and agent (admin gate covers super_admin too).
  if (isAgent(roles) || isAdmin(roles)) {
    items.push({
      href: '/app/leases/onboarding-pending',
      labelKey: 'onboardingPending',
      icon: ClipboardCheck,
    });
  }
  // TCK-045 messages
  items.push({ href: '/app/messages', labelKey: 'messaging', icon: MessageSquare });

  // Administration — pinned last in the nav for admins / super_admins.
  if (isAdmin(roles)) {
    items.push({ href: '/admin', labelKey: 'administration', icon: ShieldCheck, emphasized: true });
  }

  // Dedup by href while preserving first occurrence
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

function SidebarItem({
  href,
  labelKey,
  icon: Icon,
  active,
  emphasized,
  locked,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  const t = useTranslations('nav.sidebar');
  const label = t(labelKey);

  if (locked) {
    return (
      <span
        role="link"
        aria-disabled="true"
        title={t('proLocked')}
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground opacity-60"
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
        <Lock className="ml-auto size-3.5 shrink-0" aria-hidden />
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-border text-foreground font-semibold'
          : 'text-muted-foreground hover:bg-muted',
        emphasized && !active && 'text-foreground font-semibold',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SidebarUserFooter({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();
  return (
    <Link
      href="/app/profile"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
    >
      <Avatar className="size-9">
        {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.full_name} /> : null}
        <AvatarFallback className="bg-foreground text-white">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{user.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">{t('myProfile')}</p>
      </div>
    </Link>
  );
}

export function AppSidebar({
  user,
  className,
  onNavigate,
  agencyIsStandard,
  hasPendingUpgrade,
}: AppSidebarProps) {
  const pathname = usePathname();
  const tCommon = useTranslations('common');
  const navItems = buildNavItems(user).map((item) => ({
    ...item,
    locked: isProRouteLocked(user, agencyIsStandard, item.href),
  }));
  const showProUpgradeCard =
    user.roles.includes('agency_admin') &&
    typeof user.agency_id === 'number' &&
    agencyIsStandard === false;

  return (
    <aside className={cn('flex h-full w-64 flex-col bg-card', className)}>
      <div className="px-6 py-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="text-xl font-bold tracking-tighter text-foreground"
        >
          {tCommon('appName')}
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto space-y-1 px-3">
        {navItems.map((item) => (
          <SidebarItem
            key={item.href}
            {...item}
            active={pathname === item.href}
            onNavigate={onNavigate}
          />
        ))}
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
