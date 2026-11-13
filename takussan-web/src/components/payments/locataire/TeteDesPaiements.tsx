'use client';

import { ChevronRight, CircleAlert, CircleCheck, Clock, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isReachable, telHref } from '@/components/crm/contact';
import { buttonVariants } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { LigneDuDu, PaymentHistoryRow, ProchainLoyer, ResumeDuLoyer } from '@/types/invoice';

import { detailMontantDu } from '../montant-du';
import { PayerUneEcheance } from './PayerUneEcheance';
import { aujourdHuiADakar, commenceParUneVoyelle, compositionDuDu, joursJusquA, lignesDuDetail } from './resume';

/**
 * TCK-2650 — la tête de la page « Paiements » du locataire, selon `schedule_state` (maquette
 * `app-paiements`, approche A « Un total, un geste ») :
 *
 *  · `due` : « À régler », le TOTAL servi par l'API (pénalités et charges comprises, la page n'additionne
 *    rien), la phrase qui dit de quoi il est fait et où il se règle, le détail, « Comment payer à l'agence » ;
 *  · `up_to_date` : « Vous êtes à jour » et le prochain loyer — jamais au-dessus d'une dette ;
 *  · `none` : une carte NEUTRE, « Votre premier loyer n'est pas encore programmé », jamais « à jour ».
 *
 * `null` (aucun bail : un client de réservation) ne rend aucune tête.
 */
const LIEN_CONTOUR = buttonVariants({ variant: 'outline', size: 'lg' });

/** La ligne de l'historique qui porte l'échéance : `amount_due` est ce que la passerelle encaissera. */
function montantDe(row: PaymentHistoryRow | undefined) {
  return row
    ? detailMontantDu({
        amount_due: row.amount_due ?? 0,
        remaining_amount: row.remaining_amount ?? 0,
        late_fee_outstanding: row.late_fee_outstanding ?? 0,
        late_fee_payable_online: row.late_fee_payable_online ?? false,
      })
    : undefined;
}

interface TeteProps {
  readonly resume: ResumeDuLoyer;
  /** Les échéances dues lues sur l'historique (horizon de 6 mois) : le montant d'un « Payer ». */
  readonly dus: readonly PaymentHistoryRow[];
  /** L'historique chargé : la date de paiement du loyer qu'une pénalité a frappé. */
  readonly historique: readonly PaymentHistoryRow[];
  readonly onCommentPayerALAgence: () => void;
  readonly aujourdHui?: string;
}

export function TeteDesPaiements({ resume, dus, historique, onCommentPayerALAgence, aujourdHui = aujourdHuiADakar() }: TeteProps) {
  switch (resume.schedule_state) {
    case 'due':
      return <TeteDu resume={resume} dus={dus} historique={historique} onCommentPayerALAgence={onCommentPayerALAgence} />;
    case 'up_to_date':
      return <TeteAJour resume={resume} dus={dus} aujourdHui={aujourdHui} />;
    case 'none':
      return <TeteSansEcheance resume={resume} />;
    default:
      return null;
  }
}

function TeteDu({ resume, dus, historique, onCommentPayerALAgence }: Omit<TeteProps, 'aujourdHui'>) {
  const t = useTranslations('payments.locataire.tete');
  const f = useFormatteurs();
  const c = compositionDuDu(resume);
  const devise = resume.currency;
  const mois = (iso: string) => f.date(iso, { month: 'long', dateStyle: undefined });
  const liste = (mots: readonly string[]) => new Intl.ListFormat(f.locale, { style: 'long', type: 'conjunction' }).format(mots);

  const morceaux = [
    c.loyers > 0 ? t('morceaux.loyers', { n: c.loyers }) : null,
    c.charges > 0 ? t('morceaux.charges', { n: c.charges }) : null,
    c.penalites > 0
      ? c.moisDesPenalites.length > 0
        ? t('morceaux.penalitesDe', { n: c.penalites, mois: liste([...new Set(c.moisDesPenalites.map(mois))]) })
        : t('morceaux.penalites', { n: c.penalites })
      : null,
  ].filter((m): m is string => m !== null);
  const agence = resume.lease?.agency?.name ?? null;
  const lieu =
    c.lieu === 'agence'
      ? agence
        ? t('lieu.agenceNommee', { agence })
        : t('lieu.agence')
      : c.lieu === 'en_ligne'
        ? t('lieu.enLigne')
        : t('lieu.mixte', { enLigne: f.montantCourt(resume.parts.payable_online, devise), aLAgence: f.montantCourt(resume.parts.payable_at_agency, devise) });

  return (
    <section
      aria-labelledby="tete-a-regler"
      data-slot="tete-des-paiements"
      data-etat="due"
      className="rounded-2xl border border-warning/25 bg-warning/10 p-5 lg:flex lg:items-start lg:gap-10 lg:p-6"
    >
      <div className="lg:w-68 lg:flex-none">
        <p id="tete-a-regler" className="flex items-center gap-1.5 text-sm font-semibold text-warning">
          <CircleAlert className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('aRegler')}
        </p>
        <p className="mt-1.5 font-display text-affiche-40 font-semibold leading-none tracking-titre tabular-nums text-foreground" data-testid="total-du">
          {f.montantCourt(resume.total_due, devise)}
        </p>
        <p className="mt-2.5 text-corps leading-snug text-foreground">{t('phrase', { morceaux: liste(morceaux), lieu })}</p>
      </div>
      <div className="mt-4 min-w-0 flex-1 lg:mt-0">
        <ul className="divide-y divide-warning/20 border-y border-warning/20" data-slot="detail-du-du">
          {lignesDuDetail(resume.items).map((ligne) => (
            <LigneDuDetail key={`${ligne.kind}-${ligne.lease_payment_id}`} ligne={ligne} dus={dus} historique={historique} devise={devise} aLAgence={resume.parts.payable_at_agency} />
          ))}
        </ul>
        {resume.parts.payable_at_agency > 0 ? (
          <button
            type="button"
            onClick={onCommentPayerALAgence}
            className="mt-1 flex h-11 items-center gap-1 text-corps font-semibold text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('commentPayerALAgence')}
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function LigneDuDetail({
  ligne,
  dus,
  historique,
  devise,
  aLAgence,
}: {
  readonly ligne: LigneDuDu;
  readonly dus: readonly PaymentHistoryRow[];
  readonly historique: readonly PaymentHistoryRow[];
  readonly devise: string | null;
  readonly aLAgence: number;
}) {
  const t = useTranslations('payments.locataire.tete.ligne');
  const tPayer = useTranslations('payments.locataire.payer');
  const f = useFormatteurs();
  const debut = ligne.period_start ?? ligne.due_date;
  const mois = debut ? f.date(debut, { month: 'long', dateStyle: undefined }) : null;
  const voyelle = mois && commenceParUneVoyelle(mois) ? 'oui' : 'non';
  const titre =
    ligne.kind === 'late_fee'
      ? mois
        ? t('penaliteDe', { mois, voyelle })
        : t('penalite')
      : ligne.kind === 'charges'
        ? mois
          ? t('chargesDe', { mois, voyelle })
          : t('charges')
        : mois
          ? t('loyerDe', { mois, voyelle })
          : t('loyer');

  // Le loyer qu'une pénalité a frappé, s'il est dans l'historique chargé : payé le …, N jours de retard.
  const loyer = ligne.kind === 'late_fee' ? historique.find((r) => r.source === 'lease' && r.id === ligne.lease_payment_id) : undefined;
  const retard =
    loyer?.paid_at && loyer.due_date ? Math.max(0, joursJusquA(loyer.paid_at.slice(0, 10), loyer.due_date.slice(0, 10))) : (ligne.days_late ?? 0);
  const detail =
    ligne.kind === 'late_fee'
      ? loyer?.paid_at
        ? t('loyerPayeLe', { date: f.jourMois(loyer.paid_at), jours: retard })
        : ligne.due_date
          ? t('echeanceDu', { date: f.jourMois(ligne.due_date) })
          : null
      : ligne.due_date
        ? retard > 0
          ? t('dueDepuis', { date: f.jourMois(ligne.due_date), jours: retard })
          : t('echeanceDu', { date: f.jourMois(ligne.due_date) })
        : null;

  const enLigne = ligne.payable_online && ligne.kind !== 'late_fee' ? dus.find((r) => r.source === 'lease' && r.id === ligne.lease_payment_id) : undefined;

  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{titre}</span>
        {detail ? <span className="block text-ui text-encre-douce">{detail}</span> : null}
      </span>
      <span className="flex flex-none flex-col items-end gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-foreground">{f.montantCourt(ligne.amount, ligne.currency ?? devise)}</span>
        {enLigne ? (
          <PayerUneEcheance
            echeance={{
              paymentId: enLigne.id,
              currency: enLigne.currency ?? devise,
              montant: montantDe(enLigne),
              montantAffiche: enLigne.amount_due ?? ligne.amount,
              nature: ligne.kind,
              periodStart: ligne.period_start,
            }}
            aLAgence={aLAgence}
            libelle={tPayer('payer', { montant: f.montantCourt(enLigne.amount_due ?? ligne.amount, enLigne.currency ?? devise) })}
          />
        ) : null}
      </span>
    </li>
  );
}

function TeteAJour({ resume, dus, aujourdHui }: { readonly resume: ResumeDuLoyer; readonly dus: readonly PaymentHistoryRow[]; readonly aujourdHui: string }) {
  const t = useTranslations('payments.locataire.tete');
  const f = useFormatteurs();
  const prochain = resume.next_rent;
  return (
    <section
      aria-labelledby="tete-a-jour"
      data-slot="tete-des-paiements"
      data-etat="up_to_date"
      className="rounded-2xl border border-success/25 bg-success/10 p-5 lg:flex lg:items-center lg:gap-8 lg:p-6"
    >
      <div className="min-w-0 flex-1">
        <p id="tete-a-jour" className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('aJour')}
        </p>
        {prochain ? (
          <>
            <p className="mt-2 text-corps text-encre-douce">{t('prochainLoyer')}</p>
            <p className="font-display text-affiche-32 font-semibold leading-tight tracking-titre tabular-nums text-foreground">
              {f.montantCourt(prochain.amount, prochain.currency ?? resume.currency)}
            </p>
            <p className="text-corps text-foreground">
              {t('leDans', { date: f.date(prochain.due_date, { day: 'numeric', month: 'long', dateStyle: undefined }), jours: joursJusquA(prochain.due_date, aujourdHui) })}
            </p>
            {prochain.charges_amount > 0 ? (
              <p className="text-ui text-muted-foreground">{t('plusCharges', { montant: f.montantCourt(prochain.charges_amount, prochain.currency ?? resume.currency) })}</p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-corps text-encre-douce">{t('aucunLoyerAVenir')}</p>
        )}
      </div>
      {prochain?.payable_online ? (
        <div className="mt-4 lg:mt-0 lg:w-60 lg:flex-none">
          <BoutonPayerLeProchain prochain={prochain} dus={dus} libelle={t('payerDAvance')} secondaire aLAgence={resume.parts.payable_at_agency} />
        </div>
      ) : null}
    </section>
  );
}

function TeteSansEcheance({ resume }: { readonly resume: ResumeDuLoyer }) {
  const t = useTranslations('payments.locataire.tete');
  const f = useFormatteurs();
  const bail = resume.lease;
  const telephone = bail?.agency?.phone ?? resume.offline_payment?.agency_phone ?? null;
  const loyer = bail?.monthly_rent != null ? f.montantCourt(bail.monthly_rent, bail.currency ?? resume.currency) : null;
  return (
    <section
      aria-labelledby="tete-sans-echeance"
      data-slot="tete-des-paiements"
      data-etat="none"
      className="rounded-2xl border border-border bg-card p-5 lg:flex lg:items-center lg:gap-8 lg:p-6"
    >
      <div className="min-w-0 flex-1">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Clock className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h2 id="tete-sans-echeance" className="mt-3 font-display text-xl font-semibold leading-snug tracking-titre text-foreground">
          {t('premierLoyerPasProgramme')}
        </h2>
        <p className="mt-2 text-corps leading-snug text-muted-foreground">
          {[
            bail?.reference_number ? (loyer ? t('bailEtLoyer', { reference: bail.reference_number, loyer }) : t('bail', { reference: bail.reference_number })) : null,
            bail?.agency?.name ? t('agencePrepare', { agence: bail.agency.name }) : t('agencePrepareSansNom'),
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
      </div>
      {isReachable(telephone) ? (
        <div className="mt-4 lg:mt-0 lg:w-60 lg:flex-none">
          <a href={telHref(telephone)} className={cn(LIEN_CONTOUR, 'w-full')}>
            <MessageSquare className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('contacterLAgence')}
          </a>
        </div>
      ) : null}
    </section>
  );
}

function BoutonPayerLeProchain({
  prochain,
  dus,
  libelle,
  secondaire,
  aLAgence,
}: {
  readonly prochain: ProchainLoyer;
  readonly dus: readonly PaymentHistoryRow[];
  readonly libelle: string;
  readonly secondaire: boolean;
  readonly aLAgence: number;
}) {
  const row = dus.find((r) => r.source === 'lease' && r.id === prochain.lease_payment_id);
  return (
    <PayerUneEcheance
      echeance={{
        paymentId: prochain.lease_payment_id,
        currency: prochain.currency,
        montant: montantDe(row),
        montantAffiche: prochain.amount,
        nature: 'rent',
        periodStart: row?.period_start ?? prochain.due_date,
      }}
      aLAgence={aLAgence}
      libelle={libelle}
      variant={secondaire ? 'outline' : 'default'}
      className="w-full"
    />
  );
}

/**
 * La carte « Prochain loyer » sous une dette : la date en tuile, le montant, « Payer maintenant » —
 * secondaire quand le dû se règle à l'agence (le geste principal est alors « Comment payer à l'agence »).
 */
export function CarteDuProchainLoyer({
  resume,
  dus,
  aujourdHui = aujourdHuiADakar(),
  nombreAVenir,
}: {
  readonly resume: ResumeDuLoyer;
  readonly dus: readonly PaymentHistoryRow[];
  readonly aujourdHui?: string;
  /** Les échéances de l'horizon après celle-ci : « Les N prochaines échéances ». */
  readonly nombreAVenir: { readonly n: number; readonly jusquAu: string | null };
}) {
  const t = useTranslations('payments.locataire.prochain');
  const f = useFormatteurs();
  const prochain = resume.next_rent;
  if (!prochain) return null;
  const jours = joursJusquA(prochain.due_date, aujourdHui);
  const secondaire = resume.parts.payable_at_agency > 0;
  return (
    <section aria-label={t('titre')} data-slot="prochain-loyer" className="rounded-xl border border-border bg-card p-4 lg:flex lg:items-center lg:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span className="flex w-12 flex-none flex-col overflow-hidden rounded-lg border border-border bg-card text-center" aria-hidden="true">
          <span className="bg-secondary py-0.5 text-legende font-semibold uppercase tracking-wide text-primary-deep">
            {f.date(prochain.due_date, { month: 'short', dateStyle: undefined })}
          </span>
          <span className="py-1 font-display text-xl font-semibold leading-none tabular-nums">{f.date(prochain.due_date, { day: 'numeric', dateStyle: undefined })}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ui text-muted-foreground">{t('dans', { jours })}</p>
          <p className="font-display text-2xl font-semibold tabular-nums tracking-titre text-foreground">{f.montantCourt(prochain.amount, prochain.currency ?? resume.currency)}</p>
          {prochain.charges_amount > 0 ? (
            <p className="text-ui text-muted-foreground">{t('plusCharges', { montant: f.montantCourt(prochain.charges_amount, prochain.currency ?? resume.currency) })}</p>
          ) : null}
        </div>
      </div>
      {prochain.payable_online ? (
        <div className="mt-4 lg:mt-0 lg:w-56 lg:flex-none">
          <BoutonPayerLeProchain prochain={prochain} dus={dus} libelle={t('payerMaintenant')} secondaire={secondaire} aLAgence={resume.parts.payable_at_agency} />
        </div>
      ) : null}
      {nombreAVenir.n > 0 ? (
        <a
          href="#echeances-a-venir"
          className="mt-3 flex h-11 items-center border-t border-border pt-1 text-sm text-foreground lg:hidden"
        >
          <span className="min-w-0 flex-1 truncate">{t('aVenir', { n: nombreAVenir.n })}</span>
          {nombreAVenir.jusquAu ? <span className="text-muted-foreground">{t('jusquAu', { date: f.jourMois(nombreAVenir.jusquAu) })}</span> : null}
          <ChevronRight className="ml-1 size-4 text-muted-foreground" aria-hidden="true" />
        </a>
      ) : null}
    </section>
  );
}
