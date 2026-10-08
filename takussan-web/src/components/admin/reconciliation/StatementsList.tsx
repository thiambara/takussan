'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { StatusBadge, type StatusTone } from '@/components/console';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useBankStatements } from '@/lib/queries/reconciliation';
import type { Locale } from '@/i18n/config';
import type { BankStatement, BankStatementStatus } from '@/types/reconciliation';

import { releveAVerifier } from './format';

export const STATEMENT_STATUS_TONE: Record<BankStatementStatus, StatusTone> = {
  processing: 'info',
  failed: 'danger',
  ready_for_review: 'attention',
  partially_reconciled: 'attention',
  reconciled: 'success',
  archived: 'neutral',
};

/**
 * TCK-593 (Partie 4) — les relevés de l'agence. Un relevé qui a échoué, ou dont l'analyse a sauté
 * des lignes, le DIT avec son compte : un import « réussi » qui a perdu la moitié du fichier est
 * le défaut que le paramétrage CSV existe pour corriger, et il ne se voit nulle part ailleurs.
 */
export function StatementsList({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('admin.reconciliation');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const query = useBankStatements(agencyId);

  if (query.isLoading) return <Skeleton className="h-32 rounded-xl" />;
  if (query.isError) {
    return (
      <ErrorState
        message={t('list.error')}
        onRetry={() => void query.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }
  const releves = query.data?.data ?? [];
  if (releves.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="size-8" aria-hidden="true" />}
        title={t('list.emptyTitle')}
        description={t('list.emptyDescription')}
      />
    );
  }

  const periode = (r: BankStatement) =>
    r.period_start && r.period_end
      ? `${formatDate(r.period_start, locale)} → ${formatDate(r.period_end, locale)}`
      : '—';

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t('list.statement')}</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">{t('list.period')}</th>
            <th className="px-3 py-2 font-medium">{t('list.status')}</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">{t('list.progress')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {releves.map((r) => {
            const ratio = r.reconciled_ratio;
            const sautees = r.skipped_lines_count ?? 0;
            return (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/finances/reconciliation/${r.id}`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {r.bank_name || t('list.fallbackName', { id: String(r.id) })}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {r.source_format ? t(`import.formats.${r.source_format}`) : null}
                    {r.created_at ? ` · ${formatDate(r.created_at, locale)}` : null}
                  </p>
                  {releveAVerifier(r) && (
                    <p
                      role="alert"
                      className="mt-1 flex items-start gap-1 text-xs text-destructive"
                      data-testid={`releve-${r.id}-a-verifier`}
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {r.status === 'failed' && sautees === 0
                          ? t('list.failed')
                          : t('list.skipped', { count: sautees })}
                      </span>
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                  {periode(r)}
                </td>
                <td className="px-3 py-2">
                  {r.status && (
                    <StatusBadge
                      tone={STATEMENT_STATUS_TONE[r.status] ?? 'neutral'}
                      label={t(`status.${r.status}`)}
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-foreground">
                  {ratio
                    ? t('list.ratio', { confirmed: ratio.confirmed, total: ratio.total })
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
