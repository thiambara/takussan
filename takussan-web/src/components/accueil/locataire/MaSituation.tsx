import Link from 'next/link';
import { ChevronRight, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { Locale } from '@/i18n/config';
import { formatDate, formatNumber } from '@/lib/format';
import type { DashboardMeRecentDocument } from '@/lib/queries/dashboard-me';
import { cn } from '@/lib/utils';
import { MAINTENANCE_OPEN_STATUSES, maintenanceListHref } from '@/types/maintenance';

import type { VisiteAVenir } from '../client/VosVisites';

/**
 * TCK-2625 — ce que « Ma situation » (`/app/overview/tenant`, absorbée par l'accueil) montrait et que
 * l'accueil du locataire et du client garde (« rien ne s'y perd ») : « Ce qui m'attend » (la
 * prochaine visite, les interventions en cours, et les réservations en attente — une tuile de « Ma
 * situation » que « Ce mois » ne porte pas) et « Documents récents ». Les données sont celles de
 * `GET /api/dashboard/me` que la page a déjà lues : aucune requête de plus. « Échéances des 30
 * prochains jours » lit les dus, comme la carte « Loyer » : `EcheancesDes30Jours.tsx`.
 *
 * Composants serveur ; les libellés sont ceux de « Ma situation » (`dashboard.tenant.*`).
 */

const LIGNE =
  'flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';

export function CeQuiMAttend({
  visites,
  interventionsOuvertes,
  reservationsEnAttente,
  locale,
  className,
}: {
  readonly visites: readonly VisiteAVenir[];
  readonly interventionsOuvertes: number;
  /** La tuile « Réservations en attente » de « Ma situation », devenue une ligne ; masquée à zéro. */
  readonly reservationsEnAttente: number;
  readonly locale: Locale;
  readonly className?: string;
}) {
  const t = useTranslations('dashboard.tenant');
  const prochaine = visites[0];
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4', className)} aria-labelledby="ce-qui-m-attend" data-slot="ce-qui-m-attend">
      <h2 id="ce-qui-m-attend" className="mb-3 text-ui font-semibold text-muted-foreground">
        {t('whatAwaits')}
      </h2>
      <ul className="space-y-2 text-sm">
        <li>
          <Link href={prochaine ? `/app/visits/${prochaine.id}` : '/app/visits'} className={LIGNE}>
            <span className="text-muted-foreground">{t('nextVisit')}</span>
            <span className="text-right font-semibold text-foreground tabular-nums">
              {prochaine
                ? t('nextVisitAt', {
                    date: formatDate(prochaine.scheduled_at, locale, { dateStyle: undefined, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
                    property: prochaine.property?.title ?? t('propertyFallback'),
                  })
                : t('noVisit')}
            </span>
          </Link>
        </li>
        <li>
          <Link href={maintenanceListHref(MAINTENANCE_OPEN_STATUSES)} className={LIGNE}>
            <span className="text-muted-foreground">{t('openMaintenance')}</span>
            <span className="font-semibold text-foreground tabular-nums">{formatNumber(interventionsOuvertes, locale)}</span>
          </Link>
        </li>
        {reservationsEnAttente > 0 ? (
          <li>
            <Link href="/app/bookings" className={LIGNE}>
              <span className="text-muted-foreground">{t('pendingBookings')}</span>
              <span className="font-semibold text-foreground tabular-nums">{formatNumber(reservationsEnAttente, locale)}</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

export function DocumentsRecents({
  documents,
  className,
}: {
  readonly documents: readonly DashboardMeRecentDocument[];
  readonly className?: string;
}) {
  const t = useTranslations('dashboard.tenant');
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4', className)} aria-labelledby="documents-recents" data-slot="documents-recents">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="documents-recents" className="text-ui font-semibold text-muted-foreground">
          {t('recentDocs')}
        </h2>
        <Link href="/app/documents" className="inline-flex items-center gap-0.5 rounded text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
          {t('allDocs')}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noDocs')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <FileText className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-foreground">{d.name}</span>
              {d.type ? <span className="flex-none text-xs text-muted-foreground">{d.type}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
