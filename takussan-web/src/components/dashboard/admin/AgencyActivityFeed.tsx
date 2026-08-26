import Link from 'next/link';
import { ArrowRight, CalendarClock, Users, Wrench, UserCog } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';

import { formatNumber } from '@/lib/format';
import type { DashboardAgencySummary } from '@/lib/queries/dashboard-agency';

type Props = {
  summary: DashboardAgencySummary;
};

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
type Item = {
  href: string;
  id: 'bookings' | 'maintenance' | 'customers' | 'team';
  count: number;
  icon: ComponentType<{ className?: string }>;
};

/**
 * Vue condensée des activités opérationnelles : compteurs + liens directs
 * vers les pages détail. Pas d'API dédiée à l'activité — on s'appuie sur
 * les compteurs déjà exposés par `/api/dashboard/agency`.
 */
export function AgencyActivityFeed({ summary }: Props) {
  const t = useTranslations('dashboard.agencyActivity');
  const items: Item[] = [
    { href: '/app/bookings', id: 'bookings', count: summary.bookings.pending, icon: CalendarClock },
    { href: '/app/maintenance', id: 'maintenance', count: summary.maintenance.open, icon: Wrench },
    { href: '/app/customers', id: 'customers', count: summary.customers_count, icon: Users },
    { href: '/admin/team', id: 'team', count: summary.members_count, icon: UserCog },
  ];

  return (
    <section
      aria-labelledby="agency-activity-heading"
      className="rounded-2xl bg-card p-6"
    >
      <header className="mb-4 flex items-center justify-between">
        <h2 id="agency-activity-heading" className="text-sm font-semibold text-foreground">
          {t('heading')}
        </h2>
      </header>
      <ul className="divide-y divide-border">
        {items.map(({ href, id, count, icon: Icon }) => (
          <li key={href} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-muted text-primary">
                <Icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{t(`items.${id}.label`)}</p>
                <p className="text-xs text-muted-foreground">{formatNumber(count, 'fr')}</p>
              </div>
            </div>
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {t(`items.${id}.cta`)}
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
