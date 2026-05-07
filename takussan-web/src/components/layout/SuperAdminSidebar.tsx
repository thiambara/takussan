'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bell, Building2, Home, LayoutDashboard, ListTree, PlugZap, Settings2, ShieldAlert, SlidersHorizontal, Tags, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: '/super-admin', label: 'Console', icon: LayoutDashboard },
  { href: '/super-admin/agencies', label: 'Agences', icon: Building2 },
  { href: '/super-admin/properties', label: 'Biens', icon: Home },
  { href: '/super-admin/moderation', label: 'Modération', icon: ShieldAlert },
  { href: '/super-admin/tags', label: 'Tags', icon: Tags },
  { href: '/super-admin/enums', label: 'Enums', icon: ListTree },
  { href: '/super-admin/templates', label: 'Templates', icon: Bell },
  { href: '/super-admin/settings', label: 'Paramètres', icon: SlidersHorizontal },
  { href: '/super-admin/integrations', label: 'Intégrations', icon: PlugZap },
  { href: '/super-admin/users', label: 'Utilisateurs', icon: Users },
  { href: '/super-admin/audit', label: 'Audit', icon: Activity },
  { href: '/super-admin/system', label: 'Système', icon: Settings2 },
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
    <nav
      aria-label="Navigation super-admin"
      className={cn(
        'flex h-full w-60 flex-col gap-1 bg-stone-900 px-3 py-6 text-sm text-stone-200',
        className,
      )}
    >
      <div className="px-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Console Takussan</p>
        <p className="mt-1 text-base font-semibold text-white">Espace plateforme</p>
      </div>
      {NAV.map((item) => {
        const active = item.href === '/super-admin'
          ? pathname === '/super-admin'
          : pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
              active
                ? 'bg-amber-500/15 text-amber-200'
                : 'text-stone-300 hover:bg-stone-800 hover:text-white',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
