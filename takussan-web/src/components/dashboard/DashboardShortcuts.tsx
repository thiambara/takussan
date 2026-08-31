import Link from 'next/link';
import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  CreditCard,
  Download,
  FileText,
  FolderOpen,
  Heart,
  type LucideIcon,
  MessageSquare,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  isAdmin,
  isAgent,
  isCustomerOnly,
  isOwner,
  isServiceProvider,
  isSuperAdmin,
  isTenant,
} from '@/lib/roles';
import type { UserRole } from '@/types/user';

/**
 * La donnée porte la CLÉ, le rendu la résout (patron TCK-286).
 *
 * `labelKey` est un chemin COMPLET depuis la racine du dictionnaire : douze des quatorze
 * raccourcis sont les mêmes entrées que la barre latérale, et pointer sur `nav.sidebar.*`
 * évite d'en créer une seconde table qui divergerait en silence.
 */
type Shortcut = { href: string; labelKey: string; icon: LucideIcon };

type Props = {
  roles: UserRole[];
  agencyId?: number | null;
};

function buildShortcuts(roles: UserRole[], agencyId: number | null | undefined): Shortcut[] {
  const list: Shortcut[] = [];

  if ((isAdmin(roles) || isSuperAdmin(roles)) && agencyId) {
    list.push({ href: '/admin', labelKey: 'nav.sidebar.administration', icon: ShieldCheck });
    list.push({ href: '/app/overview', labelKey: 'nav.sidebar.statistics', icon: BarChart3 });
    list.push({ href: '/app/overview/exports', labelKey: 'nav.sidebar.exports', icon: Download });
  }

  if (isAgent(roles)) {
    list.push({ href: '/app/customers', labelKey: 'dashboard.shortcuts.myCrm', icon: Users });
    list.push({ href: '/app/visits', labelKey: 'nav.sidebar.visits', icon: CalendarClock });
    list.push({ href: '/app/calendar', labelKey: 'nav.sidebar.calendar', icon: CalendarDays });
  }

  if (isOwner(roles)) {
    list.push({ href: '/app/properties', labelKey: 'nav.sidebar.myProperties', icon: Building2 });
    list.push({ href: '/app/leases', labelKey: 'nav.sidebar.myLeases', icon: FileText });
    list.push({ href: '/app/payments', labelKey: 'dashboard.shortcuts.myPayments', icon: CreditCard });
  }

  // TCK-492 — `isCustomerOnly` : avec `customer` en plancher, ce bloc se serait
  // ajouté à celui du bailleur juste au-dessus et aurait poussé `/app/leases`
  // une SECONDE fois dans la même liste.
  if (isTenant(roles) || isCustomerOnly(roles)) {
    list.push({ href: '/app/leases', labelKey: 'nav.sidebar.myLeases', icon: FileText });
    list.push({ href: '/app/payments', labelKey: 'nav.sidebar.payments', icon: CreditCard });
    list.push({ href: '/app/documents', labelKey: 'nav.sidebar.documents', icon: FolderOpen });
    list.push({ href: '/app/favorites', labelKey: 'nav.sidebar.myFavorites', icon: Heart });
  }

  if (isServiceProvider(roles)) {
    list.push({ href: '/app/maintenance', labelKey: 'nav.sidebar.interventions', icon: Wrench });
    list.push({ href: '/app/calendar', labelKey: 'nav.sidebar.calendar', icon: CalendarDays });
  }

  list.push({ href: '/app/messages', labelKey: 'nav.sidebar.messaging', icon: MessageSquare });

  // Dedup by href, preserving the first (highest-priority) occurrence.
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true)));
}

export function DashboardShortcuts({ roles, agencyId = null }: Props) {
  const t = useTranslations();
  const shortcuts = buildShortcuts(roles, agencyId);
  if (shortcuts.length === 0) return null;

  return (
    <section aria-labelledby="dashboard-shortcuts-heading" className="space-y-3">
      <h2 id="dashboard-shortcuts-heading" className="text-sm font-semibold text-muted-foreground">
        {t('dashboard.shortcuts.heading')}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {shortcuts.map(({ href, labelKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-2xl bg-card p-4 transition hover:bg-muted"
          >
            <Icon className="size-5 text-primary" aria-hidden />
            <span className="text-sm font-medium text-foreground">{t(labelKey)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
