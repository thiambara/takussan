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
import { isAgent, isOwner, isCustomer, isAdmin, isServiceProvider } from '@/lib/roles';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProUpgradeCard } from './ProUpgradeCard';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
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

function buildNavItems(user: User): NavItem[] {
  const items: NavItem[] = [];
  const roles = user.roles;

  items.push({ href: '/app', label: 'Tableau de bord', icon: LayoutDashboard });

  if (isOwner(roles) || isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/properties', label: 'Mes biens', icon: Building2 });
  }
  if (isAgent(roles) || isAdmin(roles)) {
    items.push({
      href: '/app/properties/new',
      label: 'Publier un bien',
      icon: PlusCircle,
      emphasized: true,
    });
  }

  // Discovery shortcuts (Wave 3 / TCK-047) — visible for every signed-in user.
  items.push({ href: '/app/favorites', label: 'Mes favoris', icon: Heart });
  items.push({
    href: '/app/saved-searches',
    label: 'Recherches sauvegardées',
    icon: BookmarkCheck,
  });

  if (isCustomer(roles)) {
    // TCK-173 — full customer flow ordered by user journey:
    // discovery (favorites/saved searches above) →
    // requests (visits, bookings, maintenance) →
    // engagements (leases, payments, inventories).
    items.push({ href: '/app/visits', label: 'Mes visites', icon: CalendarClock });
    items.push({ href: '/app/bookings', label: 'Mes réservations', icon: CalendarCheck });
    items.push({ href: '/app/maintenance', label: 'Maintenance', icon: Wrench });
    items.push({ href: '/app/leases', label: 'Mes baux', icon: FileText });
    items.push({ href: '/app/payments', label: 'Paiements', icon: CreditCard });
    items.push({ href: '/app/inventories', label: 'États des lieux', icon: ClipboardList });
    items.push({ href: '/app/profile/reviews', label: 'Mes avis', icon: BookmarkCheck });
  } else if (isOwner(roles)) {
    items.push({ href: '/app/bookings', label: 'Réservations', icon: CalendarCheck });
    items.push({ href: '/app/maintenance', label: 'Maintenance', icon: Wrench });
    items.push({ href: '/app/leases', label: 'Baux', icon: FileText });
    items.push({ href: '/app/payments', label: 'Finances', icon: CreditCard });
  } else if (isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/bookings', label: 'Réservations', icon: CalendarCheck });
    items.push({ href: '/app/leases', label: 'Baux', icon: FileText });
  }

  if (isAgent(roles) || isAdmin(roles) || isServiceProvider(roles)) {
    items.push({ href: '/app/maintenance', label: isServiceProvider(roles) ? 'Interventions' : 'Maintenance', icon: Wrench });
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
      label: 'Carnet prestataires',
      icon: Wrench,
    });
  }

  items.push({ href: '/app/messages', label: 'Messagerie', icon: MessageSquare });
  items.push({ href: '/app/documents', label: 'Documents', icon: FolderOpen });

  // TCK-032 overview/stats
  items.push({ href: '/app/overview', label: 'Statistiques', icon: BarChart3 });
  if (isAdmin(roles) || isAgent(roles) || isOwner(roles)) {
    // TCK-032 overview/stats — exports (P2)
    items.push({ href: '/app/overview/exports', label: 'Exports', icon: Download });
  }
  // Vue agence cross-team — visible to agency_admin so individuals see the
  // padlock, and to agents/admins. Standard-only : la page redirige elle-même
  // (`overview/agency/page.tsx`, test en ligne sur `agency.kind`) et l'API
  // rend 403 (`DashboardAgencyController`). Le cadenas couvre les DEUX rôles
  // servis ici — `isProRouteLocked` inclut `agent` depuis TCK-284, sans quoi
  // un agent d'agence `individual` cliquait une entrée d'apparence normale
  // pour se faire renvoyer en silence.
  if (roles.includes('agency_admin') || isAdmin(roles) || isAgent(roles)) {
    items.push({ href: '/app/overview/agency', label: 'Vue agence', icon: BarChart3 });
  }
  if (isAdmin(roles) || roles.includes('agency_admin')) {
    // TCK-032 overview/stats — KPIs personnalisables (P3) et alertes (P3).
    // TCK-284 — PAS standard-only : les deux pages ne portent plus aucun test
    // sur `agency.kind`, et ne sont plus dans `PRO_ROUTES`. La spec ne les
    // restreint pas (`docs/features.md` §1.12, liste fermée + clause
    // résiduelle) et l'API ne les a jamais restreintes.
    items.push({ href: '/app/overview/kpis', label: 'KPIs', icon: Gauge });
    items.push({ href: '/app/overview/alerts', label: 'Alertes', icon: BellRing });
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
    items.push({ href: '/app/owners', label: 'Propriétaires', icon: Users });
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
    items.push({ href: '/app/customers', label: 'Clients (CRM)', icon: Users });
  }
  // TCK-030 maintenance — entry already pushed above for agent/admin/service_provider.
  // TCK-031 inventories — agency-side workflow (entrée/sortie par bail).
  if (isAgent(roles) || isAdmin(roles) || isOwner(roles)) {
    items.push({ href: '/app/inventories', label: 'États des lieux', icon: ClipboardList });
  }
  // --- Wave 3 Ops Frontend nav entries (dedup below preserves first occurrence) ---
  // TCK-043 bookings
  items.push({ href: '/app/bookings', label: isCustomer(roles) ? 'Mes réservations' : 'Réservations', icon: CalendarCheck });
  // TCK-075 visits — customers see their requests, agents see what to manage.
  items.push({ href: '/app/visits', label: isCustomer(roles) ? 'Mes visites' : 'Visites', icon: CalendarClock });
  // TCK-072 — calendrier agrégé (visible pour agent/owner/admin qui gèrent un catalogue)
  if (isAgent(roles) || isOwner(roles) || isAdmin(roles)) {
    items.push({ href: '/app/calendar', label: 'Calendrier', icon: CalendarDays });
  }
  // TCK-044 leases
  items.push({ href: '/app/leases', label: isCustomer(roles) ? 'Mes baux' : 'Baux', icon: FileText });
  // TCK-266 — sub-entry for the agency console: tenants whose move-in
  // inventory has been pending for more than 7 days. Visible to
  // agency_admin and agent (admin gate covers super_admin too).
  if (isAgent(roles) || isAdmin(roles)) {
    items.push({
      href: '/app/leases/onboarding-pending',
      label: 'Onboardings en attente',
      icon: ClipboardCheck,
    });
  }
  // TCK-045 messages
  items.push({ href: '/app/messages', label: 'Messagerie', icon: MessageSquare });

  // Administration — pinned last in the nav for admins / super_admins.
  if (isAdmin(roles)) {
    items.push({ href: '/admin', label: 'Administration', icon: ShieldCheck, emphasized: true });
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
  label,
  icon: Icon,
  active,
  emphasized,
  locked,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  if (locked) {
    return (
      <span
        role="link"
        aria-disabled="true"
        title="Réservé aux comptes pro"
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-app-ink-muted opacity-60"
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
          ? 'bg-app-surface-3 text-app-topbar font-semibold'
          : 'text-app-ink-muted hover:bg-app-surface-2',
        emphasized && !active && 'text-app-topbar font-semibold',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SidebarUserFooter({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();
  return (
    <Link
      href="/app/profile"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-app-surface-2"
    >
      <Avatar className="size-9">
        {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.full_name} /> : null}
        <AvatarFallback className="bg-app-topbar text-white">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-app-ink">{user.full_name}</p>
        <p className="truncate text-xs text-app-ink-muted">Mon profil</p>
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
  const navItems = buildNavItems(user).map((item) => ({
    ...item,
    locked: isProRouteLocked(user, agencyIsStandard, item.href),
  }));
  const showProUpgradeCard =
    user.roles.includes('agency_admin') &&
    typeof user.agency_id === 'number' &&
    agencyIsStandard === false;

  return (
    <aside className={cn('flex h-full w-64 flex-col bg-app-surface-1', className)}>
      <div className="px-6 py-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="text-xl font-bold tracking-tighter text-app-topbar"
        >
          Takussan
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
