import { format } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';

import { BarChart } from '@/components/charts/BarChart';
import { formatCurrency } from '@/lib/format';
import { localeDateFns } from '@/lib/format/dateFnsLocale';
import type { DashboardAgencyTimeseries } from '@/lib/queries/dashboard-agency';
import type { Locale as DateFnsLocale } from 'date-fns/locale';

type Props = {
  timeseries?: DashboardAgencyTimeseries;
};

/**
 * L'abscisse du graphe — un mois abrégé, DANS LA LOCALE ACTIVE (TCK-292, 2026-08-22).
 *
 * ⚠ La version précédente portait une table de douze mois français écrits à la main (`janv.`,
 * `févr.`, …) et un commentaire qui l'assumait : « ce n'est pas un libellé d'interface mais du
 * FORMATAGE DE DATE ». Les deux moitiés étaient fausses. C'est bien du texte affiché — c'est
 * l'axe d'un graphique que l'utilisateur lit — et « le formatage est figé en français partout »
 * décrivait une dette, pas une décision : une dette ne justifie pas la suivante. Le scanner de
 * `check-i18n.mjs` n'en voyait d'ailleurs que TROIS entrées sur douze (les seules accentuées),
 * donc le compte affiché pour ce fichier n'a jamais décrit ce qu'il contenait.
 *
 * Le jour du mois est arbitraire : `format(…, 'MMM')` ne lit que le mois. Le 1er est choisi parce
 * qu'il existe dans les douze mois de toutes les années.
 */
function shortLabel(yyyymm: string, dfLocale: DateFnsLocale): string {
  const [yyyy, mm] = yyyymm.split('-');
  const mois = Math.max(0, Math.min(11, Number(mm) - 1));
  return format(new Date(Number(yyyy) || 2000, mois, 1), 'MMM', { locale: dfLocale });
}

/**
 * Aperçu finance condensé — 12 derniers mois de revenus.
 *
 * Vrai graphique temporel multi-séries en P2 (ticket dédié) ; ici on se
 * contente d'une seule série revenus, alignée sur la sobriété du back-office.
 */
export function AgencyRevenueSnapshot({ timeseries }: Props) {
  const t = useTranslations('dashboard.agencyRevenue');
  const dfLocale = localeDateFns(useLocale());

  if (!timeseries || timeseries.months.length === 0) {
    return (
      <section
        aria-labelledby="agency-revenue-heading"
        className="rounded-2xl bg-app-surface-1 p-6"
      >
        <h2 id="agency-revenue-heading" className="mb-2 text-sm font-semibold text-app-ink">
          {t('heading')}
        </h2>
        <p className="text-xs text-app-ink-muted">{t('empty')}</p>
      </section>
    );
  }

  const total = timeseries.revenue.reduce((acc, n) => acc + n, 0);

  return (
    <section
      aria-labelledby="agency-revenue-heading"
      className="rounded-2xl bg-app-surface-1 p-6"
    >
      <header className="mb-4 flex items-baseline justify-between">
        <h2 id="agency-revenue-heading" className="text-sm font-semibold text-app-ink">
          {t('heading')}
        </h2>
        <p className="text-xs text-app-ink-muted">
          {t('total')} <span className="font-semibold text-app-ink">{formatCurrency(total, 'fr')}</span>
        </p>
      </header>
      <BarChart
        data={{
          labels: timeseries.months.map((mois) => shortLabel(mois, dfLocale)),
          series: [{ name: t('seriesName'), values: timeseries.revenue }],
        }}
        unit="F"
        className="h-64"
      />
    </section>
  );
}
