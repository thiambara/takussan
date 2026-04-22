'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CalendarCheck,
  CreditCard,
  FileText,
  FolderOpen,
  Home,
  LayoutDashboard,
  MessageSquare,
  PlusCircle,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import type { User, UserRole } from '@/types/user';
import { isAdmin, isAgent, isCustomer, isOwner, isServiceProvider } from '@/lib/roles';
import { cn } from '@/lib/utils';

export interface NavigationItem {
  readonly href: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly emphasized?: boolean;
}

export interface NavigationProps {
  readonly items: readonly NavigationItem[];
  /** Render as vertical (sidebar) or horizontal (header) list. */
  readonly orientation?: 'horizontal' | 'vertical';
  /** Fires after a navigation click — useful to close mobile drawers. */
  readonly onNavigate?: () => void;
  readonly className?: string;
  readonly ariaLabel?: string;
}

/**
 * Role-aware navigation primitive.
 *
 * Consumers compute the items they want (see {@link buildDashboardNavItems}
 * and {@link buildPublicNavItems}) and pass them in. Keeps the component
 * dumb so the same list can render in a sidebar, a header or a mobile
 * drawer — active-route detection is shared.
 */
export function Navigation({
  items,
  orientation = 'vertical',
  onNavigate,
  className,
  ariaLabel = 'Navigation',
}: NavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        orientation === 'vertical' ? 'flex flex-col gap-1' : 'flex flex-row items-center gap-4',
        className,
      )}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              orientation === 'vertical'
                ? active
                  ? 'bg-app-surface-3 text-app-topbar font-semibold'
                  : 'text-app-ink-muted hover:bg-app-surface-2'
                : active
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
              item.emphasized && !active && 'text-app-topbar font-semibold',
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Navigation items for the authenticated dashboard, computed from the
 * user's roles. Mirrors the layout used by `AppSidebar`.
 */
export function buildDashboardNavItems(user: User | null): NavigationItem[] {
  if (!user) return [];
  const roles: UserRole[] = user.roles;
  const items: NavigationItem[] = [];

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
    items.push({ href: '/app/crm', label: 'CRM', icon: Users });
  }

  if (isCustomer(roles)) {
    items.push({ href: '/app/bookings', label: 'Mes réservations', icon: CalendarCheck });
    items.push({ href: '/app/leases', label: 'Mes baux', icon: FileText });
    items.push({ href: '/app/payments', label: 'Paiements', icon: CreditCard });
  } else if (isOwner(roles)) {
    items.push({ href: '/app/bookings', label: 'Réservations', icon: CalendarCheck });
    items.push({ href: '/app/leases', label: 'Baux', icon: FileText });
    items.push({ href: '/app/payments', label: 'Finances', icon: CreditCard });
  } else if (isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/bookings', label: 'Réservations', icon: CalendarCheck });
    items.push({ href: '/app/leases', label: 'Baux', icon: FileText });
  }

  if (isAgent(roles) || isAdmin(roles) || isServiceProvider(roles)) {
    items.push({
      href: '/app/maintenance',
      label: isServiceProvider(roles) ? 'Interventions' : 'Maintenance',
      icon: Wrench,
    });
  }

  items.push({ href: '/app/messages', label: 'Messagerie', icon: MessageSquare });
  items.push({ href: '/app/documents', label: 'Documents', icon: FolderOpen });

  if (isAdmin(roles)) {
    items.push({
      href: '/admin',
      label: 'Administration',
      icon: ShieldCheck,
      emphasized: true,
    });
  }

  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.href)) return false;
    seen.add(i.href);
    return true;
  });
}

/**
 * Minimal public navigation items (used in the generic `Header`).
 */
export function buildPublicNavItems(): NavigationItem[] {
  return [
    { href: '/', label: 'Accueil', icon: Home },
    { href: '/properties', label: 'Rechercher' },
  ];
}
