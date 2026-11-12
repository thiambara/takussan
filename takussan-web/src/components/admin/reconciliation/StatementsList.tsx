'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { StatusBadge, type StatusTone } from '@/components/console';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
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
 *
 * TCK-2675 — en cartes (maquette `app-rapprochement`, `CarteReleve`) : la colonne de droite du
 * bureau et la section « Relevés » du téléphone. Banque et statut, période et avancement, jauge.
 * `limite` n'en montre que les premiers (le téléphone en montre deux, puis « Voir les N relevés »).
 */
export function StatementsList({
  agencyId,
  limite,
  vide,
}: {
  readonly agencyId: number;
  readonly limite?: number;
  /** Ce qui s'affiche sans relevé (par défaut, l'état vide d'avant). */
  readonly vide?: ReactNode;
}) {
  const t = useTranslations('admin.reconciliation');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const f = useFormatteurs();
  const query = useBankStatements(agencyId);
  const [tous, setTous] = useState(false);

  if (query.isLoading) return <Skeleton className="m-4 h-24 rounded-lg" />;
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
    // `null` est une réponse (rien à montrer : la section a déjà son entrée d'import) ; seul
    // l'absence de la prop donne l'état vide d'avant.
    return vide !== undefined ? (
      vide
    ) : (
      <EmptyState
        icon={<FileSpreadsheet className="size-8" aria-hidden="true" />}
        title={t('list.emptyTitle')}
        description={t('list.emptyDescription')}
      />
    );
  }

  // TCK-2675 — un relevé d'un mois entier se nomme par son mois (« Octobre 2026 », la maquette) ;
  // une autre période garde ses deux bornes.
  const periode = (r: BankStatement) => {
    if (!r.period_start || !r.period_end) return null;
    const mois = moisEntier(r.period_start, r.period_end);
    if (mois) {
      const texte = f.date(`${mois}-01T12:00:00Z`, { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return texte.charAt(0).toLocaleUpperCase(f.locale) + texte.slice(1);
    }
    return `${formatDate(r.period_start, locale)} → ${formatDate(r.period_end, locale)}`;
  };
  const affiches = limite !== undefined && !tous ? releves.slice(0, limite) : releves;

  return (
    <>
      <ul className="divide-y divide-border" aria-label={t('list.title')}>
        {affiches.map((r) => {
          const ratio = r.reconciled_ratio;
          const sautees = r.skipped_lines_count ?? 0;
          const debut =
            periode(r) ??
            [r.source_format ? t(`import.formats.${r.source_format}`) : null, r.created_at ? formatDate(r.created_at, locale) : null]
              .filter(Boolean)
              .join(' · ');
          const avancement = ratio && ratio.total > 0 ? t('list.ratio', { confirmed: ratio.confirmed, total: ratio.total }) : null;
          return (
            <li key={r.id} className="px-4 py-3" data-testid={`releve-${r.id}`}>
              <div className="flex items-center gap-2">
                <Link
                  href={`/app/agency/finances/reconciliation/${r.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {r.bank_name || t('list.fallbackName', { id: String(r.id) })}
                </Link>
                {r.status && (
                  <StatusBadge tone={STATEMENT_STATUS_TONE[r.status] ?? 'neutral'} label={t(`status.${r.status}`)} />
                )}
              </div>
              <p className="mt-0.5 text-ui text-muted-foreground tabular-nums">
                {debut}
                {debut && avancement ? ' · ' : null}
                {avancement ? <span>{avancement}</span> : null}
              </p>
              {ratio && ratio.total > 0 ? (
                <Progress
                  value={Math.round((ratio.confirmed / ratio.total) * 100)}
                  ton={ratio.confirmed === ratio.total ? 'success' : 'primary'}
                  aria-label={t('list.progress')}
                  className="mt-2.5"
                />
              ) : null}
              {releveAVerifier(r) && (
                <p
                  role="alert"
                  className="mt-2 flex items-start gap-1 text-ui text-destructive"
                  data-testid={`releve-${r.id}-a-verifier`}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{r.status === 'failed' && sautees === 0 ? t('list.failed') : t('list.skipped', { count: sautees })}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {limite !== undefined && !tous && releves.length > limite ? (
        <button type="button" className="w-full border-t border-border px-4 py-3 text-left text-sm font-medium text-primary hover:underline" onClick={() => setTous(true)}>
          {t('releves.voirTous', { count: releves.length })}
        </button>
      ) : null}
    </>
  );
}

/** « 2026-10 » quand la période va du premier au dernier jour d'un même mois, sinon `null`. */
export function moisEntier(debut: string, fin: string): string | null {
  const [a, b] = [debut.slice(0, 10), fin.slice(0, 10)];
  if (!/^\d{4}-\d{2}-01$/.test(a) || a.slice(0, 7) !== b.slice(0, 7)) return null;
  const [annee, mois] = a.split('-').map(Number) as [number, number];
  const dernier = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return Number(b.slice(8, 10)) === dernier ? a.slice(0, 7) : null;
}
