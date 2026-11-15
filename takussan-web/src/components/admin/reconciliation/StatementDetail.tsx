'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { FileQuestion } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { StatusBadge } from '@/components/console';
import { FilDAriane } from '@/components/console/PageHeader';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
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
import { PayableStatusBadge } from './PayableStatusBadge';
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
  const tConsole = useTranslations('console.pageHeader');
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
  // TCK-2675 — au téléphone, une carte par ligne (le tableau à six colonnes défilait) ; dès `md`, le tableau.
  const bureau = useMatchesMedia('(width >= 48rem)');
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
  // TCK-2675 — un relevé inconnu (404) ou d'une autre agence (403, `BankStatementPolicy`) n'existe
  // pas pour cet écran : le dire, et rendre la liste. « Réessayer » ne ferait que relire le refus.
  if (releveQuery.error instanceof ApiError && (releveQuery.error.status === 404 || releveQuery.error.status === 403)) {
    return <ReleveIntrouvable />;
  }
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
  const nomDuReleve = releve.bank_name || t('list.fallbackName', { id: String(releve.id) });
  const lignes = lignesQuery.data?.data ?? [];
  const dernierePage = lignesQuery.data?.meta?.last_page ?? 1;

  const montant = (l: BankStatementLine) =>
    formatCurrency(enNombre(l.amount), locale, { currency: l.currency ?? 'XOF' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* TCK-2617 — plus de lien « ← Retour » : la flèche de l'en-tête au téléphone, le fil dès `md`. */}
          <DeclarerEnTete titre={nomDuReleve} />
          <FilDAriane
            label={tConsole('breadcrumb')}
            etapes={[{ label: t('title'), href: '/app/agency/finances/reconciliation' }, { label: nomDuReleve }]}
          />
          <h2 className="font-display text-lg font-semibold text-foreground">{nomDuReleve}</h2>
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
        <LignesDuReleve
          lignes={lignes}
          bureau={bureau}
          rendre={(l) => {
            const confiance = confianceEnFraction(l.match_confidence);
            const suggestion =
              l.matched_payment_type && l.matched_payment_id !== null
                ? t('detail.paymentRef', {
                    type: t(`paymentTypes.${l.matched_payment_type}`),
                    id: String(l.matched_payment_id),
                  })
                : null;
            return {
              date: l.posted_at ? formatDate(l.posted_at, locale) : '—',
              libelle: (
                <>
                  <p className="break-words text-foreground">{l.label || '—'}</p>
                  <p className="text-xs break-words text-muted-foreground">{[l.reference, l.counterparty].filter(Boolean).join(' · ')}</p>
                  {l.duplicate_of_line_id != null && (
                    <div className="mt-1">
                      {/* TCK-1919 (P157.06) — déjà importée par un autre relevé : marquée, pas sautée. */}
                      <StatusBadge tone="attention" label={t('detail.duplicate')} data-testid={`doublon-${l.id}`} />
                    </div>
                  )}
                </>
              ),
              sens: l.direction ? (
                <span className={l.direction === 'credit' ? 'text-xs text-foreground' : 'text-xs text-muted-foreground'}>
                  {t(`directions.${l.direction}`)}
                </span>
              ) : null,
              montant: (
                <>
                  {l.direction === 'debit' ? '−' : ''}
                  {montant(l)}
                </>
              ),
              rapprochement: (
                <>
                  {l.match_status && <StatusBadge tone={TON_LIGNE[l.match_status]} label={t(`lineStatus.${l.match_status}`)} />}
                  {suggestion && <p className="mt-1 text-xs text-foreground">{suggestion}</p>}
                  {l.matched_payment_type && (
                    <div className="mt-1">
                      <PayableStatusBadge type={l.matched_payment_type} status={l.matched_payment_status} data-testid={`statut-payable-${l.id}`} />
                    </div>
                  )}
                  {l.match_status === 'suggested' && confiance !== null && (
                    <p className="text-xs text-muted-foreground">
                      {t('detail.confidence', { value: formatPercent(confiance, locale, { maximumFractionDigits: 0 }) })}
                    </p>
                  )}
                </>
              ),
              actions: fige ? null : (
                <>
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
                      <Button type="button" size="sm" variant="outline" disabled={occupe} onClick={() => setRecherche(l)}>
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
                </>
              ),
            };
          }}
        />
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

/** Ce qu'une ligne affiche, rendu une fois et posé en rangée (bureau) ou en carte (téléphone). */
interface ContenuDeLigne {
  readonly date: ReactNode;
  readonly libelle: ReactNode;
  readonly sens: ReactNode;
  readonly montant: ReactNode;
  readonly rapprochement: ReactNode;
  readonly actions: ReactNode;
}

function LignesDuReleve({
  lignes,
  bureau,
  rendre,
}: {
  readonly lignes: readonly BankStatementLine[];
  readonly bureau: boolean;
  readonly rendre: (l: BankStatementLine) => ContenuDeLigne;
}) {
  const t = useTranslations('admin.reconciliation.detail');
  if (!bureau) {
    return (
      <ul className="space-y-3" aria-label={t('metaTitle')}>
        {lignes.map((l) => {
          const c = rendre(l);
          return (
            <li key={l.id} className="rounded-xl border border-border bg-card p-4 text-sm" data-testid={`ligne-${l.id}`}>
              <div className="flex items-baseline gap-2">
                <p className="min-w-0 flex-1 text-ui text-muted-foreground tabular-nums">
                  {c.date}
                  {c.sens ? <> · {c.sens}</> : null}
                </p>
                <p className="flex-none font-semibold tabular-nums text-foreground">{c.montant}</p>
              </div>
              <div className="mt-1 min-w-0">{c.libelle}</div>
              <div className="mt-2">{c.rapprochement}</div>
              {c.actions ? <div className="mt-3 flex flex-wrap gap-2">{c.actions}</div> : null}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium whitespace-nowrap">{t('date')}</th>
            <th className="px-3 py-2 font-medium">{t('label')}</th>
            <th className="px-3 py-2 font-medium">{t('direction')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('amount')}</th>
            <th className="px-3 py-2 font-medium">{t('match')}</th>
            <th className="px-3 py-2 font-medium">
              <span className="sr-only">{t('actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lignes.map((l) => {
            const c = rendre(l);
            return (
              <tr key={l.id} className="align-top" data-testid={`ligne-${l.id}`}>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">{c.date}</td>
                <td className="min-w-48 px-3 py-2">{c.libelle}</td>
                <td className="px-3 py-2 whitespace-nowrap">{c.sens}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-medium tabular-nums text-foreground">{c.montant}</td>
                <td className="px-3 py-2">{c.rapprochement}</td>
                <td className="px-3 py-2">{c.actions ? <div className="flex flex-wrap justify-end gap-1">{c.actions}</div> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** TCK-2675 — « Ce relevé n'existe pas » et le chemin du retour, sans « Réessayer ». */
function ReleveIntrouvable() {
  const t = useTranslations('admin.reconciliation');
  return (
    <section className="flex flex-col items-center rounded-xl border border-border bg-card px-4 py-10 text-center" data-testid="releve-introuvable">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="size-6" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold tracking-titre">{t('detail.introuvable')}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('detail.introuvableTexte')}</p>
      <Link href="/app/agency/finances/reconciliation" className="mt-5 text-sm font-medium text-primary hover:underline">
        {t('detail.versLaListe')}
      </Link>
    </section>
  );
}
