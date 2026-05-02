import Link from 'next/link';
import { ArrowRight, CalendarClock, Users, Wrench, UserCog } from 'lucide-react';
import type { ComponentType } from 'react';

import { formatNumber } from '@/lib/format';
import type { DashboardAgencySummary } from '@/lib/queries/dashboard-agency';

type Props = {
  summary: DashboardAgencySummary;
};

type Item = {
  href: string;
  label: string;
  count: number;
  icon: ComponentType<{ className?: string }>;
  cta: string;
};

/**
 * Vue condensée des activités opérationnelles : compteurs + liens directs
 * vers les pages détail. Pas d'API dédiée à l'activité — on s'appuie sur
 * les compteurs déjà exposés par `/api/dashboard/agency`.
 */
export function AgencyActivityFeed({ summary }: Props) {
  const items: Item[] = [
    {
      href: '/admin/bookings',
      label: 'Réservations en attente',
      count: summary.bookings.pending,
      icon: CalendarClock,
      cta: 'Traiter les demandes',
    },
    {
      href: '/admin/maintenance',
      label: 'Interventions ouvertes',
      count: summary.maintenance.open,
      icon: Wrench,
      cta: 'Voir les tickets',
    },
    {
      href: '/admin/users',
      label: 'Clients (CRM)',
      count: summary.customers_count,
      icon: Users,
      cta: 'Gérer le CRM',
    },
    {
      href: '/admin/team',
      label: "Membres de l'agence",
      count: summary.members_count,
      icon: UserCog,
      cta: "Gérer l'équipe",
    },
  ];

  return (
    <section
      aria-labelledby="agency-activity-heading"
      className="rounded-2xl bg-app-surface-1 p-6"
    >
      <header className="mb-4 flex items-center justify-between">
        <h2 id="agency-activity-heading" className="text-sm font-semibold text-app-ink">
          Activité récente
        </h2>
      </header>
      <ul className="divide-y divide-app-surface-3">
        {items.map(({ href, label, count, icon: Icon, cta }) => (
          <li key={href} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-app-surface-2 text-app-accent">
                <Icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-app-ink">{label}</p>
                <p className="text-xs text-app-ink-muted">{formatNumber(count, 'fr')}</p>
              </div>
            </div>
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
            >
              {cta}
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
