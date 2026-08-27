'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  FlaskConical,
  Home,
  LayoutDashboard,
  ListTree,
  ListX,
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
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { fetchAdminAgencyUpgradePendingCount } from '@/lib/queries/super-admin';

interface NavItem {
  href: string;
  /** CLÉ sous `nav.superAdmin.items`, pas le libellé : `NAV_GROUPS` est une constante de module. */
  labelKey: string;
  icon: LucideIcon;
  children?: NavItem[];
  /**
   * When set, the sidebar fetches the matching badge value via react-query.
   * Currently used for `upgrade-requests` (TCK-268) — kept generic so other
   * queues can opt-in without re-plumbing the layout.
   */
  badgeKey?: 'upgrade-requests-pending';
}

interface NavGroup {
  /** CLÉ sous `nav.superAdmin.groups`. */
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'overview',
    items: [
      { href: '/super-admin', labelKey: 'console', icon: LayoutDashboard },
      { href: '/super-admin/reports', labelKey: 'reports', icon: BarChart3 },
    ],
  },
  {
    labelKey: 'operations',
    items: [
      { href: '/super-admin/agencies', labelKey: 'agencies', icon: Building2 },
      {
        href: '/super-admin/agency-upgrade-requests',
        labelKey: 'upgradeRequests',
        icon: ClipboardCheck,
        badgeKey: 'upgrade-requests-pending',
      },
      { href: '/super-admin/users', labelKey: 'users', icon: Users },
      { href: '/super-admin/super-admins', labelKey: 'superAdmins', icon: ShieldCheck },
      { href: '/super-admin/properties', labelKey: 'properties', icon: Home },
      { href: '/super-admin/kyc', labelKey: 'kyc', icon: ShieldCheck },
      { href: '/super-admin/moderation', labelKey: 'moderation', icon: ShieldAlert },
    ],
  },
  {
    labelKey: 'revenue',
    items: [
      { href: '/super-admin/plans', labelKey: 'plans', icon: CreditCard },
      { href: '/super-admin/payouts', labelKey: 'payouts', icon: Send },
    ],
  },
  {
    labelKey: 'content',
    items: [
      { href: '/super-admin/tags', labelKey: 'tags', icon: Tags },
      { href: '/super-admin/enums', labelKey: 'enums', icon: ListTree },
      { href: '/super-admin/templates', labelKey: 'templates', icon: Bell },
      { href: '/super-admin/announcements', labelKey: 'announcements', icon: Megaphone },
    ],
  },
  {
    labelKey: 'platform',
    items: [
      { href: '/super-admin/settings', labelKey: 'settings', icon: SlidersHorizontal },
      { href: '/super-admin/integrations', labelKey: 'integrations', icon: PlugZap },
      { href: '/super-admin/feature-flags', labelKey: 'featureFlags', icon: FlaskConical },
      { href: '/super-admin/alerts', labelKey: 'alerts', icon: Siren },
      { href: '/super-admin/audit', labelKey: 'audit', icon: Activity },
      {
        href: '/super-admin/system',
        labelKey: 'system',
        icon: Settings2,
        children: [
          { href: '/super-admin/system/health', labelKey: 'health', icon: Activity },
          // TCK-365 — les jobs échoués vivaient au bas de `/system/health`, sans entrée de menu :
          // on n'y arrivait qu'en sachant déjà que la page existait.
          { href: '/super-admin/system/jobs', labelKey: 'failedJobs', icon: ListX },
          { href: '/super-admin/system/maintenance', labelKey: 'maintenance', icon: Wrench },
          { href: '/super-admin/system/scheduler', labelKey: 'scheduler', icon: CalendarClock },
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
  const t = useTranslations('nav.superAdmin');
  const tGroups = useTranslations('nav.superAdmin.groups');

  return (
    <aside
      className={cn(
        'flex h-full w-64 shrink-0 flex-col overflow-hidden bg-stone-900 text-sm text-stone-200',
        className,
      )}
    >
      <div className="shrink-0 px-5 pb-4 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-300">{t('eyebrow')}</p>
        <p className="mt-1 text-base font-semibold text-white">{t('title')}</p>
      </div>
      <nav
        aria-label={t('ariaNav')}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-5 pt-1 [scrollbar-gutter:stable] [scrollbar-width:thin]"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
              {tGroups(group.labelKey)}
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
          <span className="truncate">{t('backToPersonal')}</span>
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
  const badge = useNavBadge(item.badgeKey);
  const t = useTranslations('nav.superAdmin');
  const tItems = useTranslations('nav.superAdmin.items');

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
        <span className="flex-1 truncate">{tItems(item.labelKey)}</span>
        {badge && badge > 0 ? (
          <span
            aria-label={t('pendingBadge', { count: badge })}
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-stone-900"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
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
                <span className="truncate">{tItems(child.labelKey)}</span>
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

/**
 * TCK-268 — Live badge counts for sidebar entries that surface a backlog.
 *
 * The polling cadence stays generous (60 s) so the sidebar never becomes a
 * tight cron; the dedicated pages can still invalidate the same query key
 * immediately after a decision is recorded.
 */
function useNavBadge(badgeKey?: NavItem['badgeKey']): number | null {
  const upgradePending = useQuery({
    queryKey: ['super-admin', 'agency-upgrade-requests', 'pending-count'],
    queryFn: fetchAdminAgencyUpgradePendingCount,
    enabled: badgeKey === 'upgrade-requests-pending',
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (badgeKey === 'upgrade-requests-pending') {
    return upgradePending.data ?? null;
  }
  return null;
}
