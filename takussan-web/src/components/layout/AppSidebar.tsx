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
  PlusCircle,
  BarChart3,
  Download,
  Gauge,
  BellRing,
  Heart,
  BookmarkCheck,
  ClipboardList,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { isAgent, isOwner, isCustomer, isAdmin, isServiceProvider } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  emphasized?: boolean;
}

interface AppSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
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

  items.push({ href: '/app/messages', label: 'Messagerie', icon: MessageSquare });
  items.push({ href: '/app/documents', label: 'Documents', icon: FolderOpen });

  // TCK-032 overview/stats
  items.push({ href: '/app/overview', label: 'Statistiques', icon: BarChart3 });
  if (isAdmin(roles) || isAgent(roles) || isOwner(roles)) {
    // TCK-032 overview/stats — exports (P2)
    items.push({ href: '/app/overview/exports', label: 'Exports', icon: Download });
  }
  if (isAdmin(roles)) {
    // TCK-032 overview/stats — KPIs personnalisables (P3)
    items.push({ href: '/app/overview/kpis', label: 'KPIs', icon: Gauge });
    // TCK-032 overview/stats — alertes (P3)
    items.push({ href: '/app/overview/alerts', label: 'Alertes', icon: BellRing });
  }

  if (isAdmin(roles)) {
    items.push({ href: '/admin', label: 'Administration', icon: ShieldCheck, emphasized: true });
  }

  // TCK-258 — team management. Visible to agency_admin (and global admins).
  // The /app/team page itself redirects out for individual agencies, so we
  // don't need to know agency.kind here — the role gate is enough for the
  // sidebar entry to disappear for non-agency-admin actors.
  if (roles.includes('agency_admin') || roles.includes('super_admin')) {
    items.push({ href: '/app/team', label: 'Équipe', icon: Users });
  }

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
  // TCK-045 messages
  items.push({ href: '/app/messages', label: 'Messagerie', icon: MessageSquare });

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
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
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

export function AppSidebar({ user, className, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const navItems = buildNavItems(user);

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
        <SidebarUserFooter user={user} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
