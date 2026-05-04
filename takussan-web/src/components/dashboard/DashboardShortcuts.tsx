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

import {
  isAdmin,
  isAgent,
  isCustomer,
  isOwner,
  isServiceProvider,
  isSuperAdmin,
  isTenant,
} from '@/lib/roles';
import type { UserRole } from '@/types/user';

type Shortcut = { href: string; label: string; icon: LucideIcon };

type Props = {
  roles: UserRole[];
  agencyId?: number | null;
};

function buildShortcuts(roles: UserRole[], agencyId: number | null | undefined): Shortcut[] {
  const list: Shortcut[] = [];

  if ((isAdmin(roles) || isSuperAdmin(roles)) && agencyId) {
    list.push({ href: '/admin', label: 'Administration', icon: ShieldCheck });
    list.push({ href: '/app/overview', label: 'Statistiques', icon: BarChart3 });
    list.push({ href: '/app/overview/exports', label: 'Exports', icon: Download });
  }

  if (isAgent(roles)) {
    list.push({ href: '/app/customers', label: 'Mon CRM', icon: Users });
    list.push({ href: '/app/visits', label: 'Visites', icon: CalendarClock });
    list.push({ href: '/app/calendar', label: 'Calendrier', icon: CalendarDays });
  }

  if (isOwner(roles)) {
    list.push({ href: '/app/properties', label: 'Mes biens', icon: Building2 });
    list.push({ href: '/app/leases', label: 'Mes baux', icon: FileText });
    list.push({ href: '/app/payments', label: 'Mes paiements', icon: CreditCard });
  }

  if (isTenant(roles) || isCustomer(roles)) {
    list.push({ href: '/app/leases', label: 'Mes baux', icon: FileText });
    list.push({ href: '/app/payments', label: 'Paiements', icon: CreditCard });
    list.push({ href: '/app/documents', label: 'Documents', icon: FolderOpen });
    list.push({ href: '/app/favorites', label: 'Mes favoris', icon: Heart });
  }

  if (isServiceProvider(roles)) {
    list.push({ href: '/app/maintenance', label: 'Interventions', icon: Wrench });
    list.push({ href: '/app/calendar', label: 'Calendrier', icon: CalendarDays });
  }

  list.push({ href: '/app/messages', label: 'Messagerie', icon: MessageSquare });

  // Dedup by href, preserving the first (highest-priority) occurrence.
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true)));
}

export function DashboardShortcuts({ roles, agencyId = null }: Props) {
  const shortcuts = buildShortcuts(roles, agencyId);
  if (shortcuts.length === 0) return null;

  return (
    <section aria-labelledby="dashboard-shortcuts-heading" className="space-y-3">
      <h2 id="dashboard-shortcuts-heading" className="text-sm font-semibold text-app-ink-muted">
        Raccourcis
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {shortcuts.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-2xl bg-app-surface-1 p-4 transition hover:bg-app-surface-2"
          >
            <Icon className="size-5 text-app-accent" aria-hidden />
            <span className="text-sm font-medium text-app-ink">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
