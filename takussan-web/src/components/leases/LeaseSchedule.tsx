'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, MoreHorizontal } from 'lucide-react';
import { useIssuePaymentLink, useLeasePayments, useMarkLateFeePaid } from '@/lib/queries/leases';
import { EmptyState, ErrorState } from '@/components/feedback';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge, type StatusTone } from '@/components/console';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import type { LeasePayment } from '@/types/lease';
import { cn } from '@/lib/utils';
import { PayOnlineButton } from '@/components/payments/PayOnlineButton';
import { detailMontantDu } from '@/components/payments/montant-du';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useToast } from '@/components/ui/toast';
import { checkoutEnCours, type CheckoutEnCours } from '@/components/payments/checkout-en-cours';
import { useAuth } from '@/context/AuthContext';
import { useMyProfiles } from '@/hooks/useProfiles';
import { PasserOutreDialog } from './PasserOutreDialog';
import { aujourdhuiADakar, joursEntre } from './fiche/CartesDuBail';
import { peutPasserOutreAuCheckout } from './passer-outre';

interface LeaseScheduleProps {
  readonly leaseId: number;
  /** Agency owning the lease — drives which gateway providers are available. */
  readonly agencyId?: number | null;
  /** TCK-593 (passe 3, m3) — sur un bail sans agence, c'est son bailleur qui passe outre. */
  readonly landlordId?: number | null;
  /**
   * TCK-593 — le lecteur gère le bail (agent, admin d'agence, propriétaire) : il peut constater
   * qu'une pénalité a été réglée à l'agence. Le locataire ne le peut pas (403 côté API).
   */
  readonly canManage?: boolean;
  /**
   * P152.02 — constater la pénalité réglée se juge par `LeasePolicy::recordPayment`
   * (`MarkLateFeePaidRequest`), pas par le rôle de gestion : le drapeau `abilities.record_payment`.
   */
  readonly canRecordPayment?: boolean;
  /**
   * TCK-2645 — le lecteur est le locataire de CE bail (`abilities.give_notice`, décision 12) : lui seul
   * a « Payer » sur ses lignes (décision 3 a), et l'état vide parle de son logement.
   */
  readonly locataire?: boolean;
  /** TCK-2645 — au bureau, les N prochaines échéances, puis « Les n échéances » qui déplie (décision 4 a). */
  readonly limite?: number;
  /**
   * TCK-2645 (lot 3) — « Les n échéances » est l'action de la CARTE (maquette a-1) : la fiche tient
   * l'état et le passe ici. Absent, l'échéancier garde son propre bouton sous la liste.
   */
  readonly toutes?: boolean;
  /** Aujourd'hui à Dakar (`AAAA-MM-JJ`), pour compter « En retard de N j ». Injecté par les tests. */
  readonly aujourdhui?: string;
  /** TCK-2645 — « Encaisser » sur la ligne (gestion, `record_payment`) : ouvre le paiement reçu présélectionné. */
  readonly onEncaisser?: (paymentId: number) => void;
}

/** TCK-2645 — « Payé » en `--success`, jamais en terracotta (la couleur d'action). */
const TON_DU_STATUT: Record<ReturnType<typeof displayStatus>, StatusTone> = {
  paid: 'success',
  late: 'danger',
  pending: 'neutral',
  partially_paid: 'attention',
  failed: 'danger',
  refunded: 'neutral',
  cancelled: 'neutral',
  other: 'neutral',
};

/**
 * TCK-2645 (lot 3) — « Payé » d'une échéance qui a porté une pénalité : en attention (maquette a-1,
 * « Payé le 29 oct. », pénalité réglée). Pas la seule date : un loyer réglé dans le délai de grâce,
 * après l'échéance mais sans pénalité, n'est pas un retard (bail 36 de la démo, « Payé le 8 oct. »).
 */
function payeeAvecPenalite(p: LeasePayment): boolean {
  return p.status === 'paid' && typeof p.late_fee_amount === 'number' && p.late_fee_amount > 0;
}

function echeanceDe(p: LeasePayment): string {
  return (p.due_date ?? p.period_start).slice(0, 10);
}

/**
 * TCK-2645 — l'ordre de lecture : l'échéance en cours en tête (les retards, puis les dues à venir,
 * de la plus proche à la plus lointaine), puis le passé, du plus récent au plus ancien. La caution
 * n'y est pas : elle a sa carte (AC5).
 */
export function ordreDeLEcheancier(paiements: readonly LeasePayment[]): LeasePayment[] {
  const lignes = paiements.filter((p) => p.payment_type !== 'deposit' && p.payment_type !== 'deposit_refund');
  const ouverte = (p: LeasePayment) => p.status === 'pending' || p.status === 'late' || p.status === 'partially_paid' || p.status === 'failed';
  const enRetard = lignes.filter((p) => ouverte(p) && p.is_overdue).sort((a, b) => echeanceDe(a).localeCompare(echeanceDe(b)));
  const aVenir = lignes.filter((p) => ouverte(p) && !p.is_overdue).sort((a, b) => echeanceDe(a).localeCompare(echeanceDe(b)));
  const passe = lignes.filter((p) => !ouverte(p)).sort((a, b) => echeanceDe(b).localeCompare(echeanceDe(a)));
  return [...enRetard, ...aVenir, ...passe];
}

/**
 * Statut affiché. Une échéance `pending` s'affiche « en retard » quand l'API la dit échue
 * (`is_overdue`, TCK-1831, P183.01 : règle de `scopeOverdue`, due AVANT aujourd'hui — l'échéance
 * du jour reste « en attente »). Le statut `late` seul ne suffit pas : l'API ne l'écrit que
 * lorsqu'elle applique une pénalité de retard (`LateFeeCalculator`, bail à `late_fee_percent`
 * positif, délai de grâce écoulé), et sans pénalité configurée aucune échéance n'est jamais
 * marquée `late` côté serveur (TCK-1829, P183.05). Le RETARD n'est jamais jugé sur l'horloge du
 * navigateur ; seul son COMPTE de jours (« En retard de 6 j », TCK-2645 lot 3) part d'aujourd'hui à
 * Dakar, comme la carte Loyer, une fois l'échéance dite échue par l'API.
 *
 * TCK-1264 (P146.02) — suit chaque cas de `PaymentStatus` : `refunded`, `failed` et
 * `partially_paid` ne retombent plus sur « Autre ». Une restitution de dépôt (`deposit_refund`)
 * n'est jamais dite échue par l'API (`is_overdue` faux) : c'est l'agence qui la doit, pas le
 * locataire (features.md, TCK-595).
 */
function displayStatus(
  p: LeasePayment,
): 'paid' | 'late' | 'pending' | 'cancelled' | 'partially_paid' | 'failed' | 'refunded' | 'other' {
  // VERIF-596 passe 6 (m-i) — une échéance d'un bail parent que son renouvellement a reprise : plus
  // due, ni loyer ni pénalité. Jugée AVANT l'échéance passée, qui la dirait « en retard ».
  if (p.status === 'cancelled') return 'cancelled';
  if (p.status === 'paid') return 'paid';
  if (p.status === 'refunded') return 'refunded';
  if (p.status === 'failed') return 'failed';
  if (p.status === 'partially_paid') return 'partially_paid';
  if (p.status === 'pending' && p.is_overdue) return 'late';
  if (p.status === 'late') return 'late';
  if (p.status === 'pending') return 'pending';
  return 'other';
}

/**
 * Échéancier du bail.
 *
 * TCK-593 — une LISTE, plus une table : chaque échéance est une ligne qui se replie en carte sur
 * téléphone et s'aligne en colonnes à partir de `lg` ; le conteneur ne défile pas. TCK-2645 (lot 3) :
 * ces colonnes sont celles de la table de la maquette, sous un en-tête commun (sous-grilles).
 *
 * TCK-2645 — la ligne de la maquette `app-baux` : le type et le mois (« Loyer · novembre 2026 »),
 * l'échéance, le montant, la pénalité comme un ÉTAT (« Pénalité 32 000 F · due »), le statut en
 * couleur (`--success` pour « Payé »), puis un seul geste visible — « Payer » pour le locataire,
 * « Encaisser » pour la gestion, sinon la quittance — et le reste dans le menu de la ligne
 * (« Marquer la pénalité réglée », « Copier le lien de paiement »).
 */
export function LeaseSchedule({
  leaseId,
  agencyId,
  landlordId,
  canManage = false,
  canRecordPayment = false,
  locataire = false,
  limite,
  toutes: toutesImpose,
  aujourdhui: aujourdhuiImpose,
  onEncaisser,
}: LeaseScheduleProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.schedule');
  const tFiche = useTranslations('lease.fiche.echeancier');
  const tScheduleStatus = useTranslations('lease.schedule.status');
  const tCommon = useTranslations('common');
  const tGateway = useTranslations('payments.gateway');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const paymentsQuery = useLeasePayments(leaseId);
  const { data, isLoading, isError } = paymentsQuery;
  const markLateFeePaid = useMarkLateFeePaid(leaseId);
  const issuePaymentLink = useIssuePaymentLink();
  const { user } = useAuth();
  const { data: mesProfils } = useMyProfiles();
  // Passe 3 (m3) — l'offre de passer outre suit la règle de l'API : un bailleur d'agence gère le
  // bail (`canManage`) mais n'y a pas droit, et saisissait un motif pour un 403.
  const peutPasserOutre = peutPasserOutreAuCheckout(
    { agencyId: agencyId ?? null, landlordId: landlordId ?? null },
    user?.id,
    mesProfils?.data ?? [],
  );
  // Passe 2 (M5) — l'échéance dont un checkout en ligne bloque l'enregistrement de la pénalité.
  const [bloquee, setBloquee] = useState<{
    paymentId: number;
    checkout: CheckoutEnCours;
  } | null>(null);
  const [toutesInterne, setToutes] = useState(false);
  const toutes = toutesImpose ?? toutesInterne;
  const aujourdhui = aujourdhuiImpose ?? aujourdhuiADakar();

  const payments = useMemo(() => ordreDeLEcheancier(data?.data ?? []), [data]);
  // TCK-602 — les fournisseurs ne dépendent que de l'agence et de la devise du bail : la première
  // échéance due suffit à les lire, une requête par échéancier et non par ligne.
  const { providers } = usePaymentProviders(
    'lease-payments',
    locataire ? (payments.find((p) => p.status !== 'cancelled' && p.amount_due > 0)?.id ?? null) : null,
  );

  if (isLoading) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (isError) {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => void paymentsQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-8" aria-hidden="true" />}
        title={locataire ? tFiche('videLocataireTitre') : t('empty_title')}
        description={locataire ? tFiche('videLocataireDetail') : t('empty_description')}
      />
    );
  }

  /**
   * TCK-602 — le lien de paiement d'une échéance, copié pour être transmis au locataire sans
   * compte (la relance le porte déjà quand un fournisseur sert l'agence).
   */
  async function copierLienDePaiement(paymentId: number) {
    try {
      const { data: lien } = await issuePaymentLink.mutateAsync({ paymentId });
      let copie = false;
      try {
        await navigator.clipboard.writeText(lien.url);
        copie = true;
      } catch {
        // Presse-papiers refusé (contexte non sécurisé, permission) : le lien s'affiche à la place.
      }
      toast.add({
        title: copie ? t('paymentLink.copied') : t('paymentLink.ready'),
        description: copie ? undefined : lien.url,
        type: 'success',
      });
    } catch (err) {
      toast.add({ title: messageErreur(err, t('paymentLink.failed')), type: 'error' });
    }
  }

  async function constaterPenaliteReglee(paymentId: number, motifPassageOutre?: string) {
    try {
      await markLateFeePaid.mutateAsync(
        motifPassageOutre === undefined
          ? { paymentId }
          : { paymentId, override_open_checkout: true, override_reason: motifPassageOutre },
      );
      setBloquee(null);
      toast.add({ title: t('lateFee.markedPaid'), type: 'success' });
    } catch (err) {
      // Un checkout en ligne vit : à qui le peut, on propose de passer outre au lieu d'un refus
      // nu ; aux autres, on dit lequel et jusqu'à quand (passe 3, m3).
      const enCours = motifPassageOutre === undefined ? checkoutEnCours(err) : null;
      if (enCours && peutPasserOutre) {
        setBloquee({ paymentId, checkout: enCours });
        return;
      }
      toast.add({
        title: enCours
          ? tGateway('error.checkoutInProgress', {
              amount: formatCurrency(enCours.montant, locale, { currency: enCours.devise }),
              time: formatDate(enCours.reessayerApres, locale, { dateStyle: undefined, timeStyle: 'short' }),
            })
          : messageErreur(err, t('lateFee.markFailed')),
        type: 'error',
      });
    }
  }

  const visibles = limite !== undefined && !toutes ? payments.slice(0, limite) : payments;
  const reste = toutesImpose === undefined && limite !== undefined && payments.length > limite;
  /** « Échéance : », « Pénalité … · due », le type d'un loyer : dits au téléphone, portés par l'en-tête au bureau. */
  const auTelephone = (c: ReactNode) => <span className="lg:sr-only">{c}</span>;

  return (
    <>
      {/*
        TCK-2645 (lot 3) — au bureau, la TABLE de la maquette a-1 (Période · Échéance · Montant ·
        Pénalité · Statut) sans quitter la liste : une grille dont l'en-tête et chaque ligne sont des
        sous-grilles ; au téléphone, chaque ligne reste une carte empilée (TCK-593). L'en-tête est
        visuel (`aria-hidden`) : chaque cellule garde son libellé, masqué à l'œil seulement.
      */}
      {/* Des pistes `auto`, comme une table : à leur contenu quand la place le permet, repliées sinon ;
          au plus étroit (1024-1280, colonne de droite ouverte), la grille défile dans sa carte (AC-F6). */}
      <div className="lg:grid lg:grid-cols-[repeat(6,auto)] lg:gap-x-6 lg:overflow-x-auto" data-testid="grille-echeancier">
        <div
          aria-hidden="true"
          className="h-10 items-center border-b border-border bg-muted/40 px-4 text-xs font-medium text-muted-foreground max-lg:hidden lg:col-span-full lg:grid lg:grid-cols-subgrid"
          data-testid="entete-echeancier"
        >
          <span>{t('colPeriod')}</span>
          <span>{t('colDueDate')}</span>
          <span className="text-right">{t('colAmount')}</span>
          <span className="text-right">{tFiche('colPenalite')}</span>
          <span>{t('colStatus')}</span>
          <span />
        </div>
        <ul
          className="divide-y divide-border text-sm tabular-nums lg:col-span-full lg:grid lg:grid-cols-subgrid"
          aria-label={t('listLabel')}
          data-testid="echeancier"
        >
          {visibles.map((p) => {
            const st = displayStatus(p);
            const annulee = st === 'cancelled';
            const montant = (valeur: number) => f.montantCourt(valeur, p.currency);
            const penalite = !annulee && typeof p.late_fee_amount === 'number' && p.late_fee_amount > 0 ? p.late_fee_amount : null;
            const penaliteHorsLigne = p.late_fee_outstanding > 0 && !p.late_fee_payable_online;
            const type = p.payment_type === 'rent' ? tFiche('loyer') : p.payment_type === 'charges' ? tFiche('charges') : tFiche('autre');
            const mois = f.date(p.period_start, { month: 'long', year: 'numeric' });
            const periode = tFiche('periode', { type, mois });
            const due = !annulee && p.amount_due > 0;
            const ouverte = !annulee && (p.status === 'pending' || p.status === 'late' || p.status === 'partially_paid' || p.status === 'failed');
            const marquerPenalite = canRecordPayment && !annulee && p.late_fee_outstanding > 0;
            const copierLien = canManage && due && !locataire;
            // TCK-2645 (lot 3) — « En retard de 6 j », « Payé le 29 oct. » : l'état et sa date (maquette a-1).
            const joursDeRetard = st === 'late' && p.due_date ? joursEntre(p.due_date, aujourdhui) : 0;
            const libelle =
              joursDeRetard > 0
                ? tFiche('enRetardDe', { jours: joursDeRetard })
                : st === 'paid' && p.paid_at
                  ? tFiche('payeLe', { date: f.jourMois(p.paid_at) })
                  : tScheduleStatus(st);
            const ton = st === 'paid' && payeeAvecPenalite(p) ? 'attention' : TON_DU_STATUT[st];
            return (
              <li
                key={p.id}
                data-testid={`echeance-${p.id}`}
                className={cn(
                  'flex flex-col gap-2 px-4 py-3 lg:col-span-full lg:grid lg:min-h-12 lg:grid-cols-subgrid lg:items-center lg:gap-x-6 lg:gap-y-0 lg:py-1.5',
                  // La teinte du retard reste au téléphone ; au bureau, le statut le dit seul (maquette a-1).
                  st === 'late' && 'bg-destructive/5 lg:bg-transparent',
                )}
              >
                <div className="min-w-0 lg:contents">
                  <p className="font-medium text-foreground">
                    {tFiche.rich('periodeRiche', {
                      type,
                      mois,
                      // Un loyer se dit par son mois au bureau (« Novembre 2026 ») ; les charges gardent leur type.
                      t: (c) => (p.payment_type === 'rent' ? auTelephone(c) : c),
                      m: (c) => <span className="lg:capitalize">{c}</span>,
                    })}
                  </p>
                  <p className="text-ui text-muted-foreground lg:text-sm lg:text-encre-douce">
                    {tFiche.rich('echeanceLe', { date: p.due_date ? f.jourMois(p.due_date) : '—', l: auTelephone })}
                  </p>
                </div>

                <div className="min-w-0 lg:contents">
                  <p className={cn('font-medium text-foreground lg:text-right lg:font-normal', annulee && 'text-muted-foreground line-through')}>
                    {montant(p.amount)}
                  </p>
                  {penalite !== null ? (
                    <p className="text-ui text-muted-foreground lg:text-right lg:text-sm lg:text-encre-douce" data-testid="penalite">
                      {p.late_fee_paid_at
                        ? tFiche.rich('penaliteReglee', { montant: montant(penalite), date: f.jourMois(p.late_fee_paid_at), l: auTelephone })
                        : penaliteHorsLigne
                          ? tFiche.rich('penaliteAgence', { montant: montant(penalite), l: auTelephone })
                          : tFiche.rich('penaliteDue', { montant: montant(penalite), l: auTelephone })}
                    </p>
                  ) : (
                    <p aria-hidden="true" className="text-right text-encre-douce max-lg:hidden">
                      —
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:contents">
                  <StatusBadge tone={ton} label={libelle} className="lg:justify-self-start" />
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {locataire && due ? (
                      <PayOnlineButton
                        paymentType="lease-payments"
                        paymentId={p.id}
                        currency={p.currency}
                        availableProviders={providers}
                        montant={detailMontantDu(p)}
                      />
                    ) : null}
                    {!locataire && onEncaisser && canRecordPayment && ouverte ? (
                      <Button type="button" size="sm" onClick={() => onEncaisser(p.id)}>
                        {tFiche('encaisser')}
                      </Button>
                    ) : null}
                    {p.receipt_available ? (
                      // TCK-2645 (lot 3) — maquette a-1 : « Quittance », un lien de la ligne, pas un bouton à bord.
                      <BoutonTelechargement
                        chemin={`/api/leases/${leaseId}/receipts/${p.id}/pdf`}
                        nomFichier={`quittance-${p.reference_number ?? p.id}.pdf`}
                        variant="link"
                        size="sm"
                        className="px-0"
                      >
                        {tFiche('quittance')}
                      </BoutonTelechargement>
                    ) : null}
                    {marquerPenalite || copierLien ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={tFiche('menu', { periode })}
                          className="inline-flex size-controle-petit flex-none items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {marquerPenalite ? (
                            <DropdownMenuItem disabled={markLateFeePaid.isPending} onClick={() => void constaterPenaliteReglee(p.id)}>
                              {tFiche('marquerPenalite')}
                            </DropdownMenuItem>
                          ) : null}
                          {copierLien ? (
                            <DropdownMenuItem
                              disabled={issuePaymentLink.isPending}
                              onClick={() => void copierLienDePaiement(p.id)}
                              data-testid="lien-de-paiement"
                            >
                              {tFiche('copierLien')}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {reste ? (
        <div className="border-t border-border px-4 py-2.5">
          <Button type="button" variant="link" className="h-auto px-0" onClick={() => setToutes((v) => !v)} aria-expanded={toutes}>
            {toutes ? tFiche('moins') : tFiche('toutes', { n: payments.length })}
          </Button>
        </div>
      ) : null}
      <PasserOutreDialog
        checkout={bloquee?.checkout ?? null}
        occupe={markLateFeePaid.isPending}
        onAnnuler={() => setBloquee(null)}
        onConfirmer={(motif) => {
          if (bloquee) void constaterPenaliteReglee(bloquee.paymentId, motif);
        }}
      />
    </>
  );
}
