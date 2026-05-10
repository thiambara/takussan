'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  CreditCard,
  FlaskConical,
  Home,
  LayoutDashboard,
  ListTree,
  Megaphone,
  PlugZap,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Tags,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Vue d'ensemble",
    items: [
      { href: '/super-admin', label: 'Console', icon: LayoutDashboard },
      { href: '/super-admin/reports', label: 'Reporting', icon: BarChart3 },
    ],
  },
  {
    label: 'Opérations',
    items: [
      { href: '/super-admin/agencies', label: 'Agences', icon: Building2 },
      { href: '/super-admin/users', label: 'Utilisateurs', icon: Users },
      { href: '/super-admin/super-admins', label: 'Super-admins', icon: ShieldCheck },
      { href: '/super-admin/properties', label: 'Biens', icon: Home },
      { href: '/super-admin/kyc', label: 'KYC', icon: ShieldCheck },
      { href: '/super-admin/moderation', label: 'Modération', icon: ShieldAlert },
    ],
  },
  {
    label: 'Revenus',
    items: [
      { href: '/super-admin/plans', label: 'Plans', icon: CreditCard },
      { href: '/super-admin/payouts', label: 'Reversements', icon: Send },
    ],
  },
  {
    label: 'Contenu',
    items: [
      { href: '/super-admin/tags', label: 'Tags', icon: Tags },
      { href: '/super-admin/enums', label: 'Enums', icon: ListTree },
      { href: '/super-admin/templates', label: 'Templates', icon: Bell },
      { href: '/super-admin/announcements', label: 'Annonces', icon: Megaphone },
    ],
  },
  {
    label: 'Plateforme',
    items: [
      { href: '/super-admin/settings', label: 'Paramètres', icon: SlidersHorizontal },
      { href: '/super-admin/integrations', label: 'Intégrations', icon: PlugZap },
      { href: '/super-admin/feature-flags', label: 'Feature flags', icon: FlaskConical },
      { href: '/super-admin/alerts', label: 'Alertes', icon: Siren },
      { href: '/super-admin/audit', label: 'Audit', icon: Activity },
      {
        href: '/super-admin/system',
        label: 'Système',
        icon: Settings2,
        children: [
          { href: '/super-admin/system/health', label: 'Santé', icon: Activity },
          { href: '/super-admin/system/maintenance', label: 'Maintenance', icon: Wrench },
          { href: '/super-admin/system/scheduler', label: 'Planificateur', icon: CalendarClock },
        ],
      },
    ],
  },
];

interface SuperAdminSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

/**
 * Distinct sidebar for the super-admin area (TCK-145). Dark stone palette
 * + ocre accents to make the cross-tenant context unmistakable next to the
 * agency-side `(dashboard)` look-and-feel.
 */
export function SuperAdminSidebar({ className, onNavigate }: SuperAdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'flex h-full w-64 shrink-0 flex-col overflow-hidden bg-stone-900 text-sm text-stone-200',
        className,
      )}
    >
      <div className="shrink-0 px-5 pb-4 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-300">Console Takussan</p>
        <p className="mt-1 text-base font-semibold text-white">Espace plateforme</p>
      </div>
      <nav
        aria-label="Navigation super-admin"
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-5 pt-1 [scrollbar-gutter:stable] [scrollbar-width:thin]"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
              {group.label}
            </p>
            {group.items.map((item) => (
              <SuperAdminNavItem
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-white/10 px-3 py-3">
        <Link
          href="/app"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-stone-400 transition-colors hover:bg-stone-800 hover:text-white"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Retour à l&apos;espace perso</span>
        </Link>
      </div>
    </aside>
  );
}

function SuperAdminNavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const active = isActivePath(pathname, item.href);
  const current = pathname === item.href;
  const Icon = item.icon;

  return (
    <div className="space-y-1">
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
          active
            ? 'bg-amber-500/15 font-semibold text-amber-200'
            : 'text-stone-300 hover:bg-stone-800 hover:text-white',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
      </Link>
      {item.children?.length ? (
        <div className="ml-5 space-y-1 border-l border-white/10 pl-2">
          {item.children.map((child) => {
            const childActive = isActivePath(pathname, child.href);
            const ChildIcon = child.icon;

            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-current={childActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                  childActive
                    ? 'bg-amber-500/10 font-semibold text-amber-200'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-white',
                )}
              >
                <ChildIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{child.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/super-admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
