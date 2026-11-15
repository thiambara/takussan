'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { PAYMENT_STATUS_TONE } from '@/components/payments/constants';
import { commenceParUneVoyelle } from '@/components/payments/locataire/resume';
import { useTelechargementApi } from '@/hooks/useTelechargementApi';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { usePaymentsHistory } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { ErreurDeBloc } from '../EtatsDeBloc';
import { QUITTANCES_LUES } from './MonLogement';

/** La maquette en montre trois ; au-delà, « Tous les paiements ». */
export const DERNIERS_PAIEMENTS_MONTRES = 3;

const METHODES = ['cash', 'bank_transfer', 'mobile_money', 'wave', 'orange_money', 'free_money', 'check', 'card'] as const;
type Methode = (typeof METHODES)[number];
const estMethode = (m: string | null): m is Methode => (METHODES as readonly string[]).includes(m ?? '');

/**
 * TCK-2852 (maquette `app-accueil` a, écran « Locataire », bureau) — « Derniers paiements », sous la
 * carte du loyer : les trois derniers paiements RÉGLÉS, chacun en une rangée « date · période · moyen ·
 * montant · Payé · Quittance », et « Tous les paiements » vers `/app/payments`.
 *
 * La lecture est celle de « Mon logement » (`/api/payments/history?filter[status]=paid&sort=-date`,
 * mêmes paramètres, même clé : une seule requête) — l'historique que la page Paiements lit aussi
 * (TCK-593). « Quittance » ne se rend que pour un loyer ou des charges soldés (la règle de
 * `HistoriqueDuLocataire`) : la caution a un reçu, la réservation n'a rien. C'est un BOUTON : le PDF
 * exige le jeton (`useTelechargementApi`), un lien nu rendrait 401.
 */
export function DerniersPaiements({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.locataire.paiements');
  const lus = usePaymentsHistory({ status: 'paid', sort: '-date', per_page: QUITTANCES_LUES });

  if (lus.isPending) {
    return <div data-slot="derniers-paiements" data-etat="chargement" aria-hidden="true" className={cn('h-48 animate-pulse rounded-xl bg-muted', className)} />;
  }
  if (lus.isError) {
    return <ErreurDeBloc quoi={t('quoi')} onReessayer={() => void lus.refetch()} className={className} />;
  }
  const lignes = (lus.data?.data ?? []).filter((r) => r.status === 'paid').slice(0, DERNIERS_PAIEMENTS_MONTRES);
  if (lignes.length === 0) return null;

  return (
    <section aria-labelledby="derniers-paiements" data-slot="derniers-paiements" className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <h2 id="derniers-paiements" className="text-sm font-semibold">
          {t('titre')}
        </h2>
        <Link
          href="/app/payments"
          className="ml-auto inline-flex items-center gap-0.5 rounded text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('tous')}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {lignes.map((row) => (
          <RangeeDePaiement key={`${row.source}-${row.id}`} row={row} />
        ))}
      </ul>
    </section>
  );
}

/**
 * La nature d'une ligne, comme `natureDe` de `HistoriqueDuLocataire` — recopiée : l'importer tirerait dans
 * l'accueil le graphe de l'historique (`BoutonTelechargement`, l'espace `documents`), que la frontière
 * de l'accueil ne sert pas (`check-i18n-namespaces`).
 */
function natureDe(row: Pick<PaymentHistoryRow, 'source' | 'payment_type'>): 'caution' | 'charges' | 'loyer' | 'reservation' {
  if (row.source !== 'lease') return 'reservation';
  if (row.payment_type === 'deposit' || row.payment_type === 'deposit_refund') return 'caution';
  if (row.payment_type === 'charges') return 'charges';
  return 'loyer';
}

/** « Loyer de novembre », « Charges d'octobre », « Caution » : ce que la ligne a payé. */
function usePeriode() {
  const t = useTranslations('accueil.locataire.paiements');
  const tLigne = useTranslations('payments.locataire.tete.ligne');
  const f = useFormatteurs();
  return (row: PaymentHistoryRow): string => {
    const nature = natureDe(row);
    if (nature === 'caution') return t('caution');
    if (nature === 'reservation') return t('reservation');
    if (row.payment_type === 'late_fee') return tLigne('penalite');
    const debut = row.period_start ?? row.due_date ?? null;
    const mois = debut ? f.date(debut, { month: 'long', dateStyle: undefined }) : null;
    const voyelle = mois && commenceParUneVoyelle(mois) ? 'oui' : 'non';
    if (nature === 'charges') return mois ? tLigne('chargesDe', { mois, voyelle }) : tLigne('charges');
    return mois ? tLigne('loyerDe', { mois, voyelle }) : tLigne('loyer');
  };
}

function RangeeDePaiement({ row }: { readonly row: PaymentHistoryRow }) {
  const t = useTranslations('accueil.locataire.paiements');
  const tMethode = useTranslations('payments.methods');
  const tStatut = useTranslations('payments.status');
  const tLogement = useTranslations('accueil.locataire.logement');
  const f = useFormatteurs();
  const periode = usePeriode()(row);
  const { telecharger, enCours, echec } = useTelechargementApi();
  // La règle de « Dernière quittance » (`MonLogement`) : un loyer ou des charges soldés, jamais la
  // caution (un reçu), une pénalité ni une réservation.
  const aUneQuittance = row.source === 'lease' && row.status === 'paid' && row.lease_id !== null && (row.payment_type === 'rent' || row.payment_type === 'charges');
  const quand = row.paid_at ?? row.date;

  return (
    <li data-slot="paiement" data-id={row.id}>
      <div className="flex min-h-12 items-center gap-4 px-4 py-2 text-sm">
        <span className="w-16 flex-none tabular-nums text-muted-foreground">{quand ? f.jourMois(quand) : '—'}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{periode}</span>
        {estMethode(row.payment_method) ? <span className="flex-none text-ui text-muted-foreground max-lg:hidden">{tMethode(row.payment_method)}</span> : null}
        <span className="w-24 flex-none text-right font-semibold tabular-nums">{f.montantCourt(row.amount, row.currency)}</span>
        <StatusBadge tone={PAYMENT_STATUS_TONE.paid} label={tStatut('paid')} className="flex-none" />
        <span className="w-20 flex-none text-right">
          {aUneQuittance ? (
            <button
              type="button"
              disabled={enCours}
              aria-busy={enCours}
              aria-label={t('quittanceDe', { periode })}
              onClick={() => void telecharger(cheminApi`/api/leases/${row.lease_id}/receipts/${row.id}/pdf`, `quittance-${row.reference_number ?? row.id}.pdf`)}
              className="rounded text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
              data-slot="quittance"
            >
              {t('quittance')}
            </button>
          ) : null}
        </span>
      </div>
      {echec ? (
        <p role="alert" className="px-4 pb-2 text-xs text-destructive">
          {tLogement(`telechargement.${echec}`)}
        </p>
      ) : null}
    </li>
  );
}
