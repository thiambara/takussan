import Link from 'next/link';
import { ArrowRight, CalendarClock, ChevronRight, Users, Wrench, UserCog } from 'lucide-react';
import type { ComponentType } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
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
  // Le compte de chaque ligne suit la locale active (TCK-374).
  const brute = useLocale();
  const locale = isLocale(brute) ? brute : DEFAULT_LOCALE;
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
      {/* Même grammaire que le bloc « À traiter » (`AgencyQueues`) : la ligne entière est le
          lien, et le libellé d'action cède la place à un chevron sous `sm`. À 390 px, le
          libellé à droite se cassait sur deux lignes et écrasait le titre sur deux autres. */}
      <ul className="divide-y divide-border">
        {items.map(({ href, id, count, icon: Icon }) => (
          <li key={href} className="py-3 first:pt-0 last:pb-0">
            <Link
              href={href}
              className="group flex min-h-11 items-center gap-4 rounded-lg px-2 py-1 transition-colors hover:bg-muted/60"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{t(`items.${id}.label`)}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">
                  {formatNumber(count, locale)}
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-primary group-hover:underline sm:inline-flex">
                {t(`items.${id}.cta`)}
                <ArrowRight className="size-3" aria-hidden />
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
