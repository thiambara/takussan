'use client';

import Link from 'next/link';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { detailMontantDu } from '@/components/payments/montant-du';
import { PayerUneEcheance } from '@/components/payments/locataire/PayerUneEcheance';
import { aujourdHuiADakar, commenceParUneVoyelle } from '@/components/payments/locataire/resume';
import { buttonVariants } from '@/components/ui/button';
import { carteDuLoyer } from '@/lib/accueil/carte-du-loyer';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useDusDuLocataire } from '@/lib/queries/dus-du-locataire';
import { useResumeDuLoyer } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
import type { LigneDuDu, PaymentHistoryRow, ProchainLoyer } from '@/types/invoice';

import { ErreurDeBloc } from '../EtatsDeBloc';

/**
 * TCK-2625 (maquette `app-accueil` a, écran « Locataire ») — la carte « Loyer » en tête de l'accueil
 * du locataire : combien, avant quand, et « Payer » en un geste. Ce qu'elle dit est décidé par
 * `carteDuLoyer` sur le résumé de l'API (`GET /api/me/rent-summary`) — le restant, jamais le brut ;
 * la caution n'y entre pas.
 *
 * « Payer » est le parcours de la page Paiements (`PayerUneEcheance`, TCK-2650 : le choix parmi les
 * seuls fournisseurs que le serveur ouvre, le retour, la vérification), monté sur l'échéance que la
 * carte vise ; son montant exact (pénalité encaissée en ligne comprise) vient de la ligne des dus que
 * la page Paiements lit aussi (`useDusDuLocataire`, même requête, même cache).
 *
 * Écart de donnée à la maquette : « Wave · Orange Money · Free Money » sous le bouton — les
 * fournisseurs ouverts ne se lisent qu'à l'ouverture de la feuille (`…/providers`).
 */
export function CarteDuLoyer({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.locataire.carte');
  const resumeQ = useResumeDuLoyer();
  const dusQ = useDusDuLocataire();
  const aujourdHui = aujourdHuiADakar();

  if (resumeQ.isPending) {
    return <div data-slot="carte-du-loyer" data-etat="chargement" aria-hidden="true" className={cn('h-44 animate-pulse rounded-2xl bg-muted', className)} />;
  }
  if (resumeQ.isError) {
    return <ErreurDeBloc quoi={t('quoi')} onReessayer={() => void resumeQ.refetch()} className={className} />;
  }
  const carte = carteDuLoyer(resumeQ.data?.data, aujourdHui);
  if (!carte) return null;
  const dus = dusQ.data?.data ?? [];

  switch (carte.genre) {
    case 'du':
      return <CarteDu carte={carte} dus={dus} className={className} />;
    case 'aJour':
      return <CarteAJour prochain={carte.prochain} dans={carte.dans} devise={carte.devise} aLAgence={carte.aLAgence} dus={dus} className={className} />;
    case 'sansEcheance':
      return <CarteSansEcheance className={className} />;
  }
}

/** « Loyer de novembre », « Charges d'octobre » : la nature et le mois de l'échéance visée. */
function useTitreDeLEcheance() {
  const t = useTranslations('payments.locataire.tete.ligne');
  const f = useFormatteurs();
  return (nature: string, debut: string | null) => {
    const mois = debut ? f.date(debut, { month: 'long', dateStyle: undefined }) : null;
    const voyelle = mois && commenceParUneVoyelle(mois) ? 'oui' : 'non';
    if (nature === 'charges') return mois ? t('chargesDe', { mois, voyelle }) : t('charges');
    return mois ? t('loyerDe', { mois, voyelle }) : t('loyer');
  };
}

/** Le bouton « Payer » : la feuille de la page Paiements, sur cette échéance. */
function BoutonPayer({
  paymentId,
  nature,
  periodStart,
  montantAffiche,
  devise,
  aLAgence,
  dus,
  className,
}: {
  readonly paymentId: number;
  readonly nature: string;
  readonly periodStart: string | null;
  readonly montantAffiche: number;
  readonly devise: string | null;
  readonly aLAgence: number;
  readonly dus: readonly PaymentHistoryRow[];
  readonly className?: string;
}) {
  const t = useTranslations('accueil.locataire.carte');
  const row = dus.find((r) => r.source === 'lease' && r.id === paymentId);
  return (
    <PayerUneEcheance
      echeance={{
        paymentId,
        currency: row?.currency ?? devise,
        montant: row
          ? detailMontantDu({
              amount_due: row.amount_due ?? 0,
              remaining_amount: row.remaining_amount ?? 0,
              late_fee_outstanding: row.late_fee_outstanding ?? 0,
              late_fee_payable_online: row.late_fee_payable_online ?? false,
            })
          : undefined,
        montantAffiche,
        nature,
        periodStart: row?.period_start ?? periodStart,
      }}
      aLAgence={aLAgence}
      libelle={t('payer')}
      className={cn('h-12 w-full font-semibold md:h-10 md:w-auto md:px-8', className)}
    />
  );
}

function CarteDu({
  carte,
  dus,
  className,
}: {
  readonly carte: Extract<NonNullable<ReturnType<typeof carteDuLoyer>>, { genre: 'du' }>;
  readonly dus: readonly PaymentHistoryRow[];
  readonly className?: string;
}) {
  const t = useTranslations('accueil.locataire.carte');
  const tTete = useTranslations('payments.locataire.tete');
  const f = useFormatteurs();
  const titre = useTitreDeLEcheance();
  const enRetard = carte.joursDeRetard !== null;
  const cible: LigneDuDu | null = carte.aPayer;
  // Une seule ligne : elle se nomme (« Loyer de novembre ») ; plusieurs : « À régler ».
  const tete = carte.lignes === 1 && cible ? titre(cible.kind, cible.period_start ?? cible.due_date) : tTete('aRegler');

  return (
    <section
      aria-labelledby="carte-du-loyer-titre"
      data-slot="carte-du-loyer"
      data-etat="du"
      data-ton={enRetard ? 'alerte' : 'primaire'}
      className={cn('rounded-2xl p-5 md:p-6', enRetard ? 'border border-destructive/20 bg-destructive/6' : 'bg-primary/8', className)}
    >
      <p id="carte-du-loyer-titre" className={cn('flex items-center gap-1.5 text-ui font-medium', enRetard ? 'text-destructive' : 'text-primary-deep')}>
        {enRetard ? <CircleAlert className="size-4" strokeWidth={1.75} aria-hidden="true" /> : null}
        {tete}
      </p>
      <div className="md:flex md:items-end md:gap-6">
        <div className="min-w-0 flex-1">
          <p className="mt-1 font-display text-affiche-28 font-semibold tabular-nums tracking-titre md:text-affiche-32" data-testid="montant-du-loyer">
            {f.montantCourt(carte.total, carte.devise)}
          </p>
          {enRetard ? (
            <p className="text-sm font-medium text-destructive">{t('enRetard', { n: carte.joursDeRetard ?? 0 })}</p>
          ) : cible?.due_date ? (
            <p className="text-sm text-muted-foreground">{t('avant', { date: f.date(cible.due_date, { day: 'numeric', month: 'long', dateStyle: undefined }) })}</p>
          ) : null}
          {carte.lignes > 1 ? (
            <Link href="/app/payments" className="mt-1 inline-block rounded text-ui font-medium text-primary-deep underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
              {t('detail', { n: carte.lignes })}
            </Link>
          ) : null}
        </div>
        <div className="mt-4 md:mt-0 md:flex-none">
          {cible ? (
            <BoutonPayer
              paymentId={cible.lease_payment_id}
              nature={cible.kind}
              periodStart={cible.period_start}
              montantAffiche={cible.amount}
              devise={cible.currency ?? carte.devise}
              aLAgence={carte.aLAgence}
              dus={dus}
            />
          ) : (
            <Link href="/app/payments?moyen=agence" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 w-full font-semibold md:h-10 md:w-auto')}>
              {tTete('commentPayerALAgence')}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function CarteAJour({
  prochain,
  dans,
  devise,
  aLAgence,
  dus,
  className,
}: {
  readonly prochain: ProchainLoyer | null;
  readonly dans: number | null;
  readonly devise: string | null;
  readonly aLAgence: number;
  readonly dus: readonly PaymentHistoryRow[];
  readonly className?: string;
}) {
  const t = useTranslations('accueil.locataire.carte');
  const tTete = useTranslations('payments.locataire.tete');
  const f = useFormatteurs();
  const titre = useTitreDeLEcheance();

  if (!prochain) {
    return (
      <section data-slot="carte-du-loyer" data-etat="a-jour" className={cn('flex items-center gap-3 rounded-2xl border border-success/25 bg-success/10 p-5', className)}>
        <CircleCheck className="size-5 flex-none text-success" strokeWidth={1.75} aria-hidden="true" />
        <p className="min-w-0 flex-1">
          <span className="block text-corps font-semibold">{tTete('aJour')}</span>
          <span className="block text-ui text-muted-foreground">{tTete('aucunLoyerAVenir')}</span>
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="carte-du-loyer-titre" data-slot="carte-du-loyer" data-etat="a-jour" className={cn('rounded-2xl bg-primary/8 p-5 md:p-6', className)}>
      <p id="carte-du-loyer-titre" className="text-ui font-medium text-primary-deep">
        {titre('rent', prochain.due_date)}
      </p>
      <div className="md:flex md:items-end md:gap-6">
        <div className="min-w-0 flex-1">
          <p className="mt-1 font-display text-affiche-28 font-semibold tabular-nums tracking-titre md:text-affiche-32" data-testid="montant-du-loyer">
            {f.montantCourt(prochain.amount, devise)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('avantDans', { date: f.date(prochain.due_date, { day: 'numeric', month: 'long', dateStyle: undefined }), jours: dans ?? 0 })}
          </p>
          {prochain.charges_amount > 0 ? <p className="text-ui text-muted-foreground">{tTete('plusCharges', { montant: f.montantCourt(prochain.charges_amount, devise) })}</p> : null}
        </div>
        {prochain.payable_online ? (
          <div className="mt-4 md:mt-0 md:flex-none">
            <BoutonPayer
              paymentId={prochain.lease_payment_id}
              nature="rent"
              periodStart={prochain.due_date}
              montantAffiche={prochain.amount}
              devise={devise}
              aLAgence={aLAgence}
              dus={dus}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CarteSansEcheance({ className }: { readonly className?: string }) {
  const tTete = useTranslations('payments.locataire.tete');
  return (
    <section data-slot="carte-du-loyer" data-etat="sans-echeance" className={cn('flex items-center gap-3 rounded-2xl border border-border bg-card p-5', className)}>
      <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Clock className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-corps font-semibold">{tTete('premierLoyerPasProgramme')}</p>
    </section>
  );
}
