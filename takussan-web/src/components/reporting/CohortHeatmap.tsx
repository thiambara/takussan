'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAdminReportCohorts } from '@/lib/queries/super-admin';
import { ReportExportButton } from './ReportExportButton';

export function CohortHeatmap() {
  const query = useQuery({
    queryKey: ['super-admin', 'reports', 'cohorts', 12],
    queryFn: () => fetchAdminReportCohorts({ depth: 12 }),
  });

  if (query.isLoading) return <Skeleton className="h-96 rounded-xl" />;

  const rows = query.data?.data.rows ?? [];
  const maxMonths = rows.reduce((acc, row) => Math.max(acc, row.cells.length), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            Cohortes d&apos;agences par mois d&apos;inscription · profondeur 12 mois.
          </p>
          <div className="ml-auto">
            <ReportExportButton report="cohorts" params={{ depth: 12 }} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Cohorte</th>
                <th className="px-3 py-2 text-right font-medium">Taille</th>
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
                      <Cell rate={cell.rate} />
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

function Cell({ rate }: { rate: number | null }) {
  if (rate === null || rate === undefined) {
    return <div className="h-7 rounded bg-muted/40" />;
  }
  const intensity = Math.max(0.1, rate);
  return (
    <div
      className="flex h-7 items-center justify-center rounded text-[11px] font-medium tabular-nums text-stone-900"
      style={{ backgroundColor: `rgba(217, 119, 6, ${intensity})` }}
      title={`${(rate * 100).toFixed(1)} %`}
    >
      {Math.round(rate * 100)}%
    </div>
  );
}
