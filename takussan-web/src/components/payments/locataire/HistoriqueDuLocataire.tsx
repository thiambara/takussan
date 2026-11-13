'use client';

import { Check, CircleAlert, ReceiptText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { EmptyState } from '@/components/feedback';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs, type Formatteurs } from '@/lib/format/useFormatteurs';
import type { PaymentHistoryRow } from '@/types/invoice';

import { PAYMENT_STATUS_TONE, type PaymentStatus } from '../constants';
import { commenceParUneVoyelle, joursJusquA } from './resume';

/**
 * TCK-2650 — l'historique du locataire (maquette `app-paiements`, « Historique ») : des cartes au
 * téléphone, une table au bureau. La caution se NOMME (« Caution · versée le … ») — elle s'affichait
 * « Loyer du 1 juil. 2026 au 1 juil. 2026 » (AC5) ; la quittance PDF reste par ligne de loyer payée,
 * et la pénalité née d'un loyer se rappelle sous lui, due ou réglée.
 */
const METHODES = ['cash', 'bank_transfer', 'mobile_money', 'wave', 'orange_money', 'free_money', 'check', 'card'] as const;
type Methode = (typeof METHODES)[number];
const estMethode = (m: string | null): m is Methode => (METHODES as readonly string[]).includes(m ?? '');
const estStatut = (s: string | null): s is PaymentStatus => s !== null && s in PAYMENT_STATUS_TONE;

/** « Novembre 2026 » : le mois de la période, capitalisé. */
function moisCapitalise(f: Formatteurs, iso: string): string {
  const mois = f.date(iso, { month: 'long', year: 'numeric', dateStyle: undefined });
  return mois.charAt(0).toLocaleUpperCase(f.locale) + mois.slice(1);
}

export type NatureDeLigne = 'caution' | 'cautionRendue' | 'charges' | 'loyer' | 'reservation';

export function natureDe(row: Pick<PaymentHistoryRow, 'source' | 'payment_type'>): NatureDeLigne {
  if (row.source !== 'lease') return 'reservation';
  if (row.payment_type === 'deposit') return 'caution';
  if (row.payment_type === 'deposit_refund') return 'cautionRendue';
  if (row.payment_type === 'charges') return 'charges';
  return 'loyer';
}

function useLigne() {
  const t = useTranslations('payments.locataire.historique');
  const tMethode = useTranslations('payments.methods');
  const tStatut = useTranslations('payments.status');
  const f = useFormatteurs();

  const chargesDe = (iso: string) => {
    const mois = f.date(iso, { month: 'long', year: 'numeric', dateStyle: undefined });
    return t('chargesDe', { mois, voyelle: commenceParUneVoyelle(mois) ? 'oui' : 'non' });
  };

  return (row: PaymentHistoryRow) => {
    const nature = natureDe(row);
    const libelle =
      nature === 'caution'
        ? t('caution')
        : nature === 'cautionRendue'
          ? t('cautionRendue')
          : nature === 'reservation'
            ? t('reservation')
            : row.period_start
              ? nature === 'charges'
                ? chargesDe(row.period_start)
                : moisCapitalise(f, row.period_start)
              : t('loyer');
    const paye = row.status === 'paid' && row.paid_at ? (nature === 'caution' ? t('verseeLe', { date: f.jourMois(row.paid_at) }) : t('payeLe', { date: f.jourMois(row.paid_at) })) : null;
    const moyen = estMethode(row.payment_method) ? tMethode(row.payment_method) : null;
    // La quittance d'un loyer ou de charges payés ; le reçu de la caution versée (même document de l'API,
    // TCK-594). Ni la caution rendue ni la réservation n'en ont.
    const piece = nature === 'loyer' || nature === 'charges' ? 'quittance' : nature === 'caution' ? 'recu' : null;
    const quittance =
      row.source === 'lease' && row.status === 'paid' && piece !== null && row.lease_id !== null
        ? {
            chemin: cheminApi`/api/leases/${row.lease_id}/receipts/${row.id}/pdf`,
            nom: `${piece}-${row.reference_number ?? row.id}.pdf`,
            court: piece === 'quittance' ? t('quittance') : t('recu'),
            long: piece === 'quittance' ? t('quittancePdf') : t('recuPdf'),
          }
        : null;
    const retard = row.paid_at && row.due_date ? Math.max(0, joursJusquA(row.paid_at.slice(0, 10), row.due_date.slice(0, 10))) : 0;
    const montantPenalite = row.late_fee_amount ?? 0;
    const penaliteDue = (row.late_fee_outstanding ?? 0) > 0;
    const penalite =
      row.source === 'lease' && montantPenalite > 0
        ? {
            due: penaliteDue,
            texte: penaliteDue
              ? t('penaliteDue', { montant: f.montantCourt(row.late_fee_outstanding ?? montantPenalite, row.currency), jours: retard })
              : t('penaliteReglee', { montant: f.montantCourt(montantPenalite, row.currency) }),
          }
        : null;
    const statut = !paye && estStatut(row.status) ? { tone: PAYMENT_STATUS_TONE[row.status], label: tStatut(row.status) } : null;
    const echeance = !paye && row.due_date ? t('echeanceLe', { date: f.jourMois(row.due_date) }) : null;
    return { libelle, paye, moyen, quittance, penalite, statut, echeance, montant: f.montantCourt(row.amount, row.currency) };
  };
}

function NoteDePenalite({ penalite, compacte }: { readonly penalite: { readonly due: boolean; readonly texte: string }; readonly compacte?: boolean }) {
  const t = useTranslations('payments.locataire.historique');
  return penalite.due ? (
    <p className={compacte ? 'mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-xs' : 'mt-2.5 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-ui'} data-slot="penalite-due">
      <CircleAlert className="size-3.5 flex-none text-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1">{penalite.texte}</span>
      <span className="flex-none font-semibold text-warning">{t('due')}</span>
    </p>
  ) : (
    <p className={compacte ? 'mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-muted/70 px-2 py-1 text-xs text-encre-douce' : 'mt-2.5 flex items-center gap-2 rounded-lg bg-muted/70 px-3 py-2 text-ui text-encre-douce'} data-slot="penalite-reglee">
      <Check className="size-3.5 flex-none text-success" aria-hidden="true" />
      <span className="min-w-0 flex-1">{penalite.texte}</span>
    </p>
  );
}

export function HistoriqueDuLocataire({ lignes }: { readonly lignes: readonly PaymentHistoryRow[] }) {
  const t = useTranslations('payments.locataire.historique');
  const lire = useLigne();

  if (lignes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState icon={<ReceiptText className="size-6" strokeWidth={1.5} aria-hidden="true" />} title={t('videTitre')} description={t('videTexte')} />
      </div>
    );
  }

  const lues = lignes.map((row) => ({ row, l: lire(row) }));

  return (
    <>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card lg:hidden" data-testid="historique-client">
        {lues.map(({ row, l }) => (
          <li key={`${row.source}-${row.id}`} className="px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-corps font-semibold text-foreground">{l.libelle}</p>
                {l.paye ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-ui text-encre-douce">
                    <Check className="size-3.5 flex-none text-success" aria-hidden="true" />
                    {l.paye}
                  </p>
                ) : (
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-ui text-encre-douce">
                    {l.statut ? <StatusBadge tone={l.statut.tone} label={l.statut.label} /> : null}
                    {l.echeance}
                  </p>
                )}
                {l.moyen || row.reference_number ? (
                  <p className="truncate text-xs text-muted-foreground">{[l.moyen, row.reference_number].filter(Boolean).join(' · ')}</p>
                ) : null}
              </div>
              <div className="flex flex-none flex-col items-end gap-1.5">
                <p className="text-corps font-semibold tabular-nums text-foreground">{l.montant}</p>
                {l.quittance ? (
                  <BoutonTelechargement chemin={l.quittance.chemin} nomFichier={l.quittance.nom} variant="outline" size="lg">
                    {l.quittance.court}
                  </BoutonTelechargement>
                ) : null}
              </div>
            </div>
            {l.penalite ? <NoteDePenalite penalite={l.penalite} /> : null}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
        <table className="w-full text-sm" data-testid="historique-client-table">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">{t('colonnes.periode')}</th>
              <th className="px-3 py-2.5 font-medium">{t('colonnes.paye')}</th>
              <th className="px-3 py-2.5 text-right font-medium">{t('colonnes.montant')}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t('colonnes.justificatif')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lues.map(({ row, l }) => (
              <tr key={`${row.source}-${row.id}`} className="align-top">
                <td className="px-4 py-3">
                  <p className="whitespace-nowrap font-semibold text-foreground">{l.libelle}</p>
                  {row.reference_number ? <p className="whitespace-nowrap text-xs text-muted-foreground">{row.reference_number}</p> : null}
                  {l.penalite ? <NoteDePenalite penalite={l.penalite} compacte /> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {l.paye ? (
                    <span className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success" aria-hidden="true" />
                      {l.paye}
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {l.statut ? <StatusBadge tone={l.statut.tone} label={l.statut.label} /> : null}
                      {l.echeance}
                    </span>
                  )}
                  {l.moyen ? <span className="block pl-5 text-xs text-muted-foreground">{l.moyen}</span> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-foreground">{l.montant}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {l.quittance ? (
                    <BoutonTelechargement chemin={l.quittance.chemin} nomFichier={l.quittance.nom} variant="outline" size="sm">
                      {l.quittance.long}
                    </BoutonTelechargement>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
