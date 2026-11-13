'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';

import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HORIZON_DES_DUS_MOIS, useDusDuLocataire } from '@/lib/queries/dus-du-locataire';
import { usePaymentsHistory, useResumeDuLoyer } from '@/lib/queries/payments';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow, ResumeDuLoyer } from '@/types/invoice';

import { CommentPayerALAgence } from './locataire/CommentPayerALAgence';
import { HistoriqueDuLocataire } from './locataire/HistoriqueDuLocataire';
import { MonBail } from './locataire/MonBail';
import { aujourdHuiADakar } from './locataire/resume';
import { CarteDuProchainLoyer, TeteDesPaiements } from './locataire/TeteDesPaiements';
import { detailMontantDu } from './montant-du';
import { PayOnlineButton } from './PayOnlineButton';

/**
 * TCK-593 (Partie 2), TCK-2650 — la page « Paiements » du CLIENT (locataire, acheteur), en lecture seule.
 *
 * Sa question est « combien je dois, et je paie où ? ». Depuis TCK-2650 (maquette `app-paiements`,
 * approche A), la tête se lit sur `GET /api/me/rent-summary` (TCK-2649) selon `schedule_state` : le
 * TOTAL dû, pénalités et charges comprises, tel que l'API le calcule (`due`), « Vous êtes à jour » et
 * le prochain loyer (`up_to_date`), ou une carte neutre quand l'échéancier n'est pas émis (`none`).
 * Puis la carte « Prochain loyer » sous une dette, l'historique, et les échéances à venir.
 *
 * Un client sans bail (`schedule_state` nul, réservations seulement) ou un résumé illisible garde la
 * tête d'avant : le prochain dû de l'historique, `amount_due` tel que l'API le rend.
 *
 * Les dus sont filtrés CÔTÉ SERVEUR (`useDusDuLocataire`, `filter[status]=pending,partially_paid,late,failed`) :
 * la page n'additionne rien.
 */
const PAR_PAGE = 20;
/** Les échéances à venir affichées : six, comme la maquette. */
const A_VENIR_MAX = 6;

/**
 * La tête d'avant (client sans bail) garde le sélecteur générique, qui reçoit `undefined` : l'API refuse
 * à l'initiation un fournisseur que l'agence n'a pas. La tête du locataire (TCK-2650) passe par
 * `PayerUneEcheance`, qui ne propose que les fournisseurs que le serveur ouvre (TCK-602).
 */
const FOURNISSEURS_INCONNUS = undefined;

function montantsDe(row: PaymentHistoryRow) {
  return detailMontantDu({
    amount_due: row.amount_due ?? 0,
    remaining_amount: row.remaining_amount,
    late_fee_outstanding: row.late_fee_outstanding ?? 0,
    late_fee_payable_online: row.late_fee_payable_online ?? false,
  });
}

/** Les échéances de loyer encore à payer, dont la date n'est pas passée : « Échéances à venir ». */
export function echeancesAVenir(dus: readonly PaymentHistoryRow[], aujourdHui: string): readonly PaymentHistoryRow[] {
  return dus
    .filter((row) => row.source === 'lease' && (row.due_date ?? '').slice(0, 10) > aujourdHui && (row.amount_due ?? row.amount) > 0)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, A_VENIR_MAX);
}

export function CustomerPayments() {
  const t = useTranslations('payments.locataire');
  const tCustomer = useTranslations('payments.customer');
  const tCommon = useTranslations('common');
  const [page, setPage] = useState(1);
  // « Payer à l'agence » de la page de retour (TCK-2650) ouvre la feuille des moyens hors ligne.
  // `useSearchParams` rend `null` hors du routeur (tests de composant) : la feuille reste alors fermée.
  const parametres = useSearchParams() as ReturnType<typeof useSearchParams> | null;
  const [agenceOuverte, setAgenceOuverte] = useState(() => parametres?.get('moyen') === 'agence');
  const aujourdHui = aujourdHuiADakar();

  const resumeQ = useResumeDuLoyer();
  const dus = useDusDuLocataire();
  const historique = usePaymentsHistory({ sort: '-date', page, per_page: PAR_PAGE });

  const resume: ResumeDuLoyer | null = resumeQ.data?.data ?? null;
  const etat = resume?.schedule_state ?? null;
  const lignesDues = dus.data?.data ?? [];
  const lignes = historique.data?.data ?? [];
  const dernierePage = historique.data?.meta?.last_page ?? 1;
  const aVenir = etat === 'none' ? [] : echeancesAVenir(lignesDues, aujourdHui);
  // La caution versée, si elle est sur la page d'historique chargée (« Mon bail »).
  const caution = lignes.find((row) => row.source === 'lease' && row.payment_type === 'deposit' && row.status === 'paid')?.amount ?? null;

  return (
    // Bureau (maquette) : la colonne de 720 px et « Mon bail » à droite dès 1280 ; dessous entre `lg` et 1280.
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <div className="min-w-0 space-y-6 xl:max-w-180 xl:flex-1">
        {resumeQ.isLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : resume && etat ? (
          <>
            <TeteDesPaiements resume={resume} dus={lignesDues} historique={lignes} onCommentPayerALAgence={() => setAgenceOuverte(true)} aujourdHui={aujourdHui} />
            {etat === 'due' ? (
              <CarteDuProchainLoyer
                resume={resume}
                dus={lignesDues}
                aujourdHui={aujourdHui}
                nombreAVenir={{ n: aVenir.length, jusquAu: aVenir.at(-1)?.due_date ?? null }}
              />
            ) : null}
          </>
        ) : (
          <ProchainPaiementHerite dus={dus} />
        )}

        <section aria-labelledby="historique-paiements">
          <h2 id="historique-paiements" className="mb-3 font-display text-lg font-semibold tracking-titre text-foreground">
            {t('historique.titre')}
          </h2>
          {historique.isLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : historique.isError ? (
            <ErrorState message={tCustomer('error')} onRetry={() => void historique.refetch()} retryLabel={tCommon('actions.retry')} />
          ) : (
            <HistoriqueDuLocataire lignes={lignes} />
          )}
          {dernierePage > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                {tCustomer('previous')}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">{tCustomer('pageOf', { page: String(page), total: String(dernierePage) })}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((p) => Math.min(dernierePage, p + 1))} disabled={page >= dernierePage}>
                {tCustomer('next')}
              </Button>
            </div>
          )}
        </section>

        {resume && etat && aVenir.length > 0 ? <EcheancesAVenir lignes={aVenir} /> : null}
      </div>

      {resume && etat ? <MonBail resume={resume} caution={caution} /> : null}
      {resume ? <CommentPayerALAgence resume={resume} open={agenceOuverte} onOpenChange={setAgenceOuverte} /> : null}
    </div>
  );
}

function EcheancesAVenir({ lignes }: { readonly lignes: readonly PaymentHistoryRow[] }) {
  const t = useTranslations('payments.locataire.aVenir');
  const f = useFormatteurs();
  const mois = (iso: string) => {
    const m = f.date(iso, { month: 'long', dateStyle: undefined });
    return m.charAt(0).toLocaleUpperCase(f.locale) + m.slice(1);
  };
  return (
    <section id="echeances-a-venir" aria-labelledby="titre-echeances-a-venir" className="scroll-mt-20">
      <h2 id="titre-echeances-a-venir" className="font-display text-lg font-semibold tracking-titre text-foreground">
        {t('titre')}
      </h2>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6" data-slot="echeances-a-venir">
        {lignes.map((row, i) => (
          <li key={row.id} className={cn('rounded-xl border bg-card px-3 py-2.5', i === 0 ? 'border-foreground/30' : 'border-border')}>
            <p className="text-xs text-muted-foreground">{mois(row.period_start ?? row.due_date ?? '')}</p>
            <p className="text-sm font-semibold">{row.due_date ? f.jourMois(row.due_date) : null}</p>
            <p className="text-xs tabular-nums text-muted-foreground">{f.montantCourt(row.amount_due ?? row.amount, row.currency)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * La tête d'avant TCK-2650, gardée pour le client sans bail (réservations) et pour un résumé illisible :
 * le prochain dû de l'historique, « Payer », la pénalité à régler à part, et les échéances de l'horizon.
 */
function ProchainPaiementHerite({ dus }: { readonly dus: ReturnType<typeof usePaymentsHistory> }) {
  const t = useTranslations('payments.customer');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();

  const aPayer = (dus.data?.data ?? []).filter((row) => row.source === 'lease' && (row.amount_due ?? 0) > 0);
  const [prochain, ...suivants] = aPayer;
  const enDevise = (valeur: number, devise: string | null) => f.montant(valeur, devise ?? 'XOF');
  const libelle = (row: PaymentHistoryRow) =>
    row.source === 'lease'
      ? row.period_start && row.period_end
        ? t('period', { start: f.date(row.period_start), end: f.date(row.period_end) })
        : t('rent')
      : t('booking');

  function rappelPenalite(row: PaymentHistoryRow) {
    const { penaliteHorsLigne } = montantsDe(row);
    if (penaliteHorsLigne <= 0) return null;
    return (
      <p className="text-sm text-muted-foreground" data-testid="penalite-hors-ligne">
        {t('lateFeeAtAgency', { amount: enDevise(penaliteHorsLigne, row.currency) })}
      </p>
    );
  }

  function boutonPayer(row: PaymentHistoryRow) {
    return <PayOnlineButton paymentType="lease-payments" paymentId={row.id} currency={row.currency ?? 'XOF'} availableProviders={FOURNISSEURS_INCONNUS} montant={montantsDe(row)} />;
  }

  return (
    <section aria-labelledby="prochain-paiement" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="prochain-paiement" className="font-display text-base font-semibold tracking-tight text-foreground">
        {t('nextTitle')}
      </h2>
      {dus.isLoading ? (
        <Skeleton className="mt-3 h-20 rounded-lg" />
      ) : dus.isError ? (
        <ErrorState message={t('error')} onRetry={() => void dus.refetch()} retryLabel={tCommon('actions.retry')} />
      ) : !prochain ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-accent" aria-hidden="true" />
          {t('upToDate')}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-3xl font-bold tabular-nums text-foreground" data-testid="montant-du">
                {enDevise(prochain.amount_due ?? 0, prochain.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                {libelle(prochain)}
                {prochain.due_date ? ` · ${t('dueOn', { date: f.date(prochain.due_date) })}` : null}
              </p>
            </div>
            {boutonPayer(prochain)}
          </div>
          {rappelPenalite(prochain)}
        </div>
      )}
      {suivants.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">{t('otherDuesHorizon', { months: HORIZON_DES_DUS_MOIS })}</h3>
            <a href="#historique-paiements" className="text-sm text-primary underline-offset-4 hover:underline">
              {t('historyLink')}
            </a>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {suivants.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0 text-sm">
                  <p className="font-medium tabular-nums text-foreground">{enDevise(row.amount_due ?? 0, row.currency)}</p>
                  <p className="text-muted-foreground">{libelle(row)}</p>
                  {rappelPenalite(row)}
                </div>
                {boutonPayer(row)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
