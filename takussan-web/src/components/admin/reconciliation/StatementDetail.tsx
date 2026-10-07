'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { StatusBadge } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';
import {
  useBankStatement,
  useBankStatementLines,
  useFinalizeStatement,
  useIgnoreLine,
  useMatchLine,
  useUnmatchLine,
} from '@/lib/queries/reconciliation';
import type { Locale } from '@/i18n/config';
import type { BankLineMatchStatus, BankStatementLine } from '@/types/reconciliation';

import { confianceEnFraction, enNombre, releveAVerifier, releveFige } from './format';
import { PaymentSearchDialog } from './PaymentSearchDialog';
import { STATEMENT_STATUS_TONE } from './StatementsList';

const FILTRES: readonly (BankLineMatchStatus | null)[] = [null, 'suggested', 'unmatched', 'confirmed', 'ignored'];

const TON_LIGNE = {
  unmatched: 'neutral',
  suggested: 'attention',
  confirmed: 'success',
  ignored: 'neutral',
} as const;

/**
 * TCK-593 (Partie 4) — le détail d'un relevé : ses lignes, chacune avec son sens (encaissement ou
 * décaissement), la suggestion de rapprochement et sa confiance, et les gestes — valider la
 * suggestion d'un clic, chercher le paiement à la main, ignorer, délier. Puis finaliser.
 *
 * Dense, et sûr sur tablette : la table défile dans son conteneur, les gestes se replient.
 */
export function StatementDetail({
  agencyId,
  statementId,
}: {
  readonly agencyId: number;
  readonly statementId: number;
}) {
  const t = useTranslations('admin.reconciliation');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const [filtre, setFiltre] = useState<BankLineMatchStatus | null>(null);
  const [page, setPage] = useState(1);
  const [recherche, setRecherche] = useState<BankStatementLine | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const releveQuery = useBankStatement(statementId);
  const lignesQuery = useBankStatementLines(statementId, filtre, page);
  const rapprocher = useMatchLine(statementId);
  const delier = useUnmatchLine(statementId);
  const ignorer = useIgnoreLine(statementId);
  const finaliser = useFinalizeStatement(statementId);
  const occupe = rapprocher.isPending || delier.isPending || ignorer.isPending || finaliser.isPending;

  async function agir(action: () => Promise<unknown>, repli: string) {
    setErreur(null);
    try {
      await action();
    } catch (err) {
      setErreur(messageErreur(err, repli));
    }
  }

  if (releveQuery.isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (releveQuery.isError || !releveQuery.data) {
    return (
      <ErrorState
        message={t('detail.error')}
        onRetry={() => void releveQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const releve = releveQuery.data.data;
  const fige = releveFige(releve);
  const ratio = releve.reconciled_ratio;
  const lignes = lignesQuery.data?.data ?? [];
  const dernierePage = lignesQuery.data?.meta?.last_page ?? 1;

  const montant = (l: BankStatementLine) =>
    formatCurrency(enNombre(l.amount), locale, { currency: l.currency ?? 'XOF' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/finances/reconciliation"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t('detail.back')}
          </Link>
          <h2 className="mt-1 font-display text-lg font-semibold text-foreground">
            {releve.bank_name || t('list.fallbackName', { id: String(releve.id) })}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {releve.status && (
              <StatusBadge
                tone={STATEMENT_STATUS_TONE[releve.status] ?? 'neutral'}
                label={t(`status.${releve.status}`)}
              />
            )}
            {ratio && (
              <span className="tabular-nums" data-testid="ratio-releve">
                {t('list.ratio', { confirmed: ratio.confirmed, total: ratio.total })}
                {' · '}
                {t('detail.remaining', { count: ratio.remaining })}
              </span>
            )}
          </div>
          {releveAVerifier(releve) && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {releve.status === 'failed' && (releve.skipped_lines_count ?? 0) === 0
                ? t('list.failed')
                : t('list.skipped', { count: releve.skipped_lines_count ?? 0 })}
            </p>
          )}
        </div>
        {!fige && (
          <Button
            type="button"
            onClick={() => void agir(() => finaliser.mutateAsync(), t('detail.finalizeFailed'))}
            disabled={occupe}
          >
            {t('detail.finalize')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label={t('detail.filterLabel')}>
        {FILTRES.map((f) => (
          <Button
            key={f ?? 'all'}
            type="button"
            size="sm"
            variant={filtre === f ? 'default' : 'outline'}
            aria-pressed={filtre === f}
            onClick={() => {
              setFiltre(f);
              setPage(1);
            }}
          >
            {f ? t(`lineStatus.${f}`) : t('detail.all')}
          </Button>
        ))}
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      )}

      {lignesQuery.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : lignesQuery.isError ? (
        <ErrorState
          message={t('detail.linesError')}
          onRetry={() => void lignesQuery.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : lignes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t('detail.noLines')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium whitespace-nowrap">{t('detail.date')}</th>
                <th className="px-3 py-2 font-medium">{t('detail.label')}</th>
                <th className="px-3 py-2 font-medium">{t('detail.direction')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('detail.amount')}</th>
                <th className="px-3 py-2 font-medium">{t('detail.match')}</th>
                <th className="px-3 py-2 font-medium">
                  <span className="sr-only">{t('detail.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((l) => {
                const confiance = confianceEnFraction(l.match_confidence);
                const suggestion =
                  l.matched_payment_type && l.matched_payment_id !== null
                    ? t('detail.paymentRef', {
                        type: t(`paymentTypes.${l.matched_payment_type}`),
                        id: String(l.matched_payment_id),
                      })
                    : null;
                return (
                  <tr key={l.id} className="align-top" data-testid={`ligne-${l.id}`}>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                      {l.posted_at ? formatDate(l.posted_at, locale) : '—'}
                    </td>
                    <td className="min-w-48 px-3 py-2">
                      <p className="text-foreground">{l.label || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {[l.reference, l.counterparty].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.direction && (
                        <span
                          className={
                            l.direction === 'credit' ? 'text-xs text-foreground' : 'text-xs text-muted-foreground'
                          }
                        >
                          {t(`directions.${l.direction}`)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium tabular-nums text-foreground">
                      {l.direction === 'debit' ? '−' : ''}
                      {montant(l)}
                    </td>
                    <td className="px-3 py-2">
                      {l.match_status && (
                        <StatusBadge tone={TON_LIGNE[l.match_status]} label={t(`lineStatus.${l.match_status}`)} />
                      )}
                      {suggestion && <p className="mt-1 text-xs text-foreground">{suggestion}</p>}
                      {l.match_status === 'suggested' && confiance !== null && (
                        <p className="text-xs text-muted-foreground">
                          {t('detail.confidence', { value: formatPercent(confiance, locale, { maximumFractionDigits: 0 }) })}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!fige && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {l.match_status === 'suggested' && l.matched_payment_type && l.matched_payment_id !== null && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={occupe}
                              onClick={() =>
                                void agir(
                                  () =>
                                    rapprocher.mutateAsync({
                                      lineId: l.id,
                                      payment_type: l.matched_payment_type!,
                                      payment_id: l.matched_payment_id!,
                                    }),
                                  t('detail.matchFailed'),
                                )
                              }
                            >
                              {t('detail.validate')}
                            </Button>
                          )}
                          {(l.match_status === 'suggested' || l.match_status === 'unmatched') && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={occupe}
                                onClick={() => setRecherche(l)}
                              >
                                {t('detail.search')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={occupe}
                                onClick={() => void agir(() => ignorer.mutateAsync(l.id), t('detail.ignoreFailed'))}
                              >
                                {t('detail.ignore')}
                              </Button>
                            </>
                          )}
                          {l.match_status === 'confirmed' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={occupe}
                              onClick={() => void agir(() => delier.mutateAsync(l.id), t('detail.unmatchFailed'))}
                            >
                              {t('detail.unmatch')}
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dernierePage > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('detail.previous')}
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('detail.pageOf', { page: String(page), total: String(dernierePage) })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= dernierePage}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('detail.next')}
          </Button>
        </div>
      )}

      {recherche && (
        <PaymentSearchDialog
          agencyId={agencyId}
          ligne={recherche}
          onClose={() => setRecherche(null)}
          onChoisir={async (candidat) => {
            await rapprocher.mutateAsync({
              lineId: recherche.id,
              payment_type: candidat.type,
              payment_id: candidat.id,
            });
            setRecherche(null);
          }}
        />
      )}
    </div>
  );
}
