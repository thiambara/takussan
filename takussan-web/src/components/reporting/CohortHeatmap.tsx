'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAdminReportCohorts } from '@/lib/queries/super-admin';
import { ReportExportButton } from './ReportExportButton';

export function CohortHeatmap() {
  const t = useTranslations('reporting.cohorts');
  const query = useQuery({
    queryKey: ['super-admin', 'reports', 'cohorts', 12],
    queryFn: () => fetchAdminReportCohorts({ depth: 12 }),
  });

  if (query.isLoading) return <Skeleton className="h-96 rounded-xl" />;

  const rows = query.data?.data.rows ?? [];
  const maxMonths = rows.reduce((acc, row) => Math.max(acc, row.cells.length), 0);

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <EnteteCohortes caption={t('caption')} />
        <EtatVide titre={t('empty')} indice={t('emptyHint')} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <EnteteCohortes caption={t('caption')} />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('cohort')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('size')}</th>
                {Array.from({ length: maxMonths }, (_, i) => (
                  <th key={i} className="px-2 py-2 text-center font-medium">M{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cohort} className="border-b border-border/40 last:border-b-0">
                  <td className="px-3 py-1.5 font-medium text-foreground">{row.cohort}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{row.cohort_size}</td>
                  {row.cells.map((cell) => (
                    <td key={cell.month} className="px-1 py-1">
                      <Cell rate={cell.rate} mois={cell.month} />
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, maxMonths - row.cells.length) }, (_, i) => (
                    <td key={`pad-${i}`} className="px-1 py-1" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function EnteteCohortes({ caption }: { caption: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <p className="text-sm text-muted-foreground">{caption}</p>
        <div className="ml-auto">
          <ReportExportButton report="cohorts" params={{ depth: 12 }} />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * L'intensité sort du jeton `--chart-1`, pas d'une couleur écrite à la main (TCK-361) : la valeur
 * en dur — un ambre 217/119/6 posé en canaux rouge-vert-bleu — était étrangère à la charte, et
 * surtout FIGÉE : le bloc sombre de `globals.css` ne pouvait pas l'atteindre, donc la carte de
 * chaleur restait claire en thème sombre. `color-mix` garde la teinte du jeton et n'en fait varier
 * que l'opacité.
 *
 * ⚠ Le récit s'écrit ici en toutes lettres, jamais en syntaxe copiable : un docblock qui montre la
 * forme interdite est exactement la documentation périmée qui fait repousser le motif — et il
 * ferait rougir `couleurs-issues-des-jetons.test.ts`, qui n'exempte pas les commentaires.
 *
 * L'attribut `title` a disparu : il n'était ni atteignable au clavier ni lisible sur mobile, et le
 * taux exact qu'il portait n'existait donc pour presque personne. Il est désormais dans le
 * `aria-label` de la cellule — que la valeur arrondie affichée ne redit pas au dixième près.
 */
function Cell({ rate, mois }: { rate: number | null; mois: number }) {
  const t = useTranslations('reporting.cohorts');

  if (rate === null || rate === undefined) {
    return <div className="h-7 rounded bg-muted/40" aria-label={t('cellEmpty', { month: mois })} />;
  }

  const intensite = Math.max(0.12, rate);

  return (
    <div
      className="flex h-7 items-center justify-center rounded text-[11px] font-medium tabular-nums text-foreground"
      style={{ backgroundColor: `color-mix(in srgb, var(--chart-1) ${(intensite * 100).toFixed(0)}%, transparent)` }}
      aria-label={t('cellAria', { month: mois, rate: (rate * 100).toFixed(1) })}
    >
      {Math.round(rate * 100)}%
    </div>
  );
}

function EtatVide({ titre, indice }: { titre: string; indice: string }) {
  return (
    <div
      data-testid="cohorts-empty"
      role="status"
      className="flex h-64 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center"
    >
      <p className="text-sm font-medium text-foreground">{titre}</p>
      <p className="text-xs text-muted-foreground">{indice}</p>
    </div>
  );
}
