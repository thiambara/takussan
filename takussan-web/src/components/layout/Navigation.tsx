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
import { useTranslations } from 'next-intl';
import type { User, UserRole } from '@/types/user';
import { isAdmin, isAgent, isCustomer, isOwner, isServiceProvider } from '@/lib/roles';
import { cn } from '@/lib/utils';

export interface NavigationItem {
  readonly href: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly emphasized?: boolean;
}

/**
 * TCK-292 — les deux fabriques ci-dessous sont des fonctions PURES appelées hors composant :
 * `useTranslations` n'y est pas appelable. Elles reçoivent donc le traducteur, déjà borné à
 * l'espace de noms annoncé ici — même patron que `components/property-form/options.ts`.
 *
 * ```tsx
 * const t = useTranslations(NAVIGATION_NAMESPACES.dashboard);
 * const items = buildDashboardNavItems(user, t);
 * ```
 */
export const NAVIGATION_NAMESPACES = {
  dashboard: 'nav.sidebar',
  public: 'common.navigation',
} as const;

/** Un traducteur DÉJÀ borné à son espace de noms — la valeur rendue par `useTranslations(ns)`. */
export type Traducteur = (cle: string) => string;

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
  ariaLabel,
}: NavigationProps) {
  const pathname = usePathname();
  const tLayout = useTranslations('layout.nav');

  return (
    <nav
      aria-label={ariaLabel ?? tLayout('aria')}
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
 *
 * ⚠ `t` doit être borné à {@link NAVIGATION_NAMESPACES.dashboard} — les clés employées ici sont
 * exactement celles que `AppSidebar.buildNavItems` consomme déjà, aucune n'a été créée.
 */
export function buildDashboardNavItems(user: User | null, t: Traducteur): NavigationItem[] {
  if (!user) return [];
  const roles: UserRole[] = user.roles;
  const items: NavigationItem[] = [];

  items.push({ href: '/app', label: t('dashboard'), icon: LayoutDashboard });

  if (isOwner(roles) || isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/properties', label: t('myProperties'), icon: Building2 });
  }
  if (isAgent(roles) || isAdmin(roles)) {
    items.push({
      href: '/app/properties/new',
      label: t('publishProperty'),
      icon: PlusCircle,
      emphasized: true,
    });
    // « CRM » est un sigle, identique en fr/en/wo — pas de clé, comme « CSV » ou « XLSX »
    // ailleurs. Il diffère volontairement de `nav.sidebar.crm` (« Clients (CRM) »), que
    // `AppSidebar` affiche : ne pas les confondre changerait un libellé (AC3 de TCK-292).
    items.push({ href: '/app/customers', label: 'CRM', icon: Users });
  }

  if (isCustomer(roles)) {
    items.push({ href: '/app/bookings', label: t('myBookings'), icon: CalendarCheck });
    items.push({ href: '/app/leases', label: t('myLeases'), icon: FileText });
    items.push({ href: '/app/payments', label: t('payments'), icon: CreditCard });
  } else if (isOwner(roles)) {
    items.push({ href: '/app/bookings', label: t('bookings'), icon: CalendarCheck });
    items.push({ href: '/app/leases', label: t('leases'), icon: FileText });
    items.push({ href: '/app/payments', label: t('finances'), icon: CreditCard });
  } else if (isAgent(roles) || isAdmin(roles)) {
    items.push({ href: '/app/bookings', label: t('bookings'), icon: CalendarCheck });
    items.push({ href: '/app/leases', label: t('leases'), icon: FileText });
  }

  if (isAgent(roles) || isAdmin(roles) || isServiceProvider(roles)) {
    items.push({
      href: '/app/maintenance',
      label: isServiceProvider(roles) ? t('interventions') : t('maintenance'),
      icon: Wrench,
    });
  }

  items.push({ href: '/app/messages', label: t('messaging'), icon: MessageSquare });
  items.push({ href: '/app/documents', label: t('documents'), icon: FolderOpen });

  if (isAdmin(roles)) {
    items.push({
      href: '/admin',
      label: t('administration'),
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
 *
 * ⚠ `t` doit être borné à {@link NAVIGATION_NAMESPACES.public}.
 */
export function buildPublicNavItems(t: Traducteur): NavigationItem[] {
  return [
    { href: '/', label: t('home'), icon: Home },
    { href: '/properties', label: t('search') },
  ];
}
