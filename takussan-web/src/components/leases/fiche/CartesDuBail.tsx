'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Check } from 'lucide-react';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { LeaseWithRelations } from '@/lib/queries/leases';
import { cn } from '@/lib/utils';
import type { LeasePayment } from '@/types/lease';

import { Carte, Jauge } from './PiecesDuBail';

/**
 * TCK-2645 — les cartes du dossier : Loyer (avec les charges, décision du porteur du 2026-11-10),
 * Durée, Caution. Chaque montant et chaque état est celui de l'API (le bail, ses échéances) ; seul le
 * nombre de jours de retard se compte ici, depuis l'échéance que l'API dit échue (`is_overdue`).
 */

/** Aujourd'hui à Dakar (`AAAA-MM-JJ`). Dakar vit en UTC toute l'année (GMT, sans heure d'été). */
export function aujourdhuiADakar(maintenant: Date = new Date()): string {
  return maintenant.toISOString().slice(0, 10);
}

/** Jours entre deux dates `AAAA-MM-JJ` — partagé avec l'échéancier, pour que la carte et la ligne disent le même retard. */
export function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(fin.slice(0, 10)) - Date.parse(debut.slice(0, 10))) / 86_400_000);
}

function moisEntre(debut: string, fin: string): number {
  const [ad, md, jd] = debut.slice(0, 10).split('-').map(Number);
  const [af, mf, jf] = fin.slice(0, 10).split('-').map(Number);
  return (af - ad) * 12 + (mf - md) + (jf >= jd ? 0 : -1);
}

function useMoisDe() {
  const f = useFormatteurs();
  return (date: string) => {
    const mois = f.date(date, { month: 'long' });
    return mois.charAt(0).toLocaleUpperCase(f.locale) + mois.slice(1);
  };
}

/** L'échéance de loyer qui dit « l'état du mois » : la plus ancienne en retard, sinon celle du mois en cours. */
export function echeanceDuMois(paiements: readonly LeasePayment[], aujourdhui: string): LeasePayment | null {
  const loyers = paiements
    .filter((p) => p.payment_type === 'rent' && p.status !== 'cancelled')
    .sort((a, b) => (a.due_date ?? a.period_start).localeCompare(b.due_date ?? b.period_start));
  return loyers.find((p) => p.is_overdue) ?? loyers.find((p) => (p.due_date ?? p.period_start).slice(0, 7) === aujourdhui.slice(0, 7)) ?? null;
}

export function CarteLoyer({
  lease,
  paiements,
  aRegler,
  className,
}: {
  readonly lease: LeaseWithRelations;
  readonly paiements: readonly LeasePayment[] | undefined;
  /** Le locataire a une échéance due sans paiement en ligne (décision 14). */
  readonly aRegler?: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('lease.fiche.loyer');
  const f = useFormatteurs();
  const moisDe = useMoisDe();
  const vente = lease.type === 'sale';
  const montant = vente ? lease.sale_price : lease.monthly_rent;
  const aujourdhui = aujourdhuiADakar();
  const mois = !vente && paiements ? echeanceDuMois(paiements, aujourdhui) : null;
  const charges = !vente && typeof lease.monthly_charges === 'number' && lease.monthly_charges > 0 ? lease.monthly_charges : null;

  return (
    <Carte className={cn('p-4', className)} data-testid="carte-loyer">
      <p className="text-ui text-muted-foreground">
        {vente ? t('prix') : lease.payment_day ? t('echeance', { jour: lease.payment_day }) : t('titre')}
      </p>
      <p className="mt-0.5 font-display text-2xl font-semibold tracking-titre tabular-nums">
        {f.montantCourt(montant, lease.currency)}
        {vente ? null : <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground"> {t('parMois')}</span>}
      </p>
      {charges !== null ? (
        <p className="mt-1 text-ui text-muted-foreground tabular-nums">{t('charges', { montant: f.montantCourt(charges, lease.currency) })}</p>
      ) : null}
      {mois ? <EtatDuMois echeance={mois} mois={moisDe(mois.due_date ?? mois.period_start)} aujourdhui={aujourdhui} /> : null}
      {aRegler ? <p className="mt-2 text-ui text-muted-foreground">{t('aRegler')}</p> : null}
    </Carte>
  );
}

function EtatDuMois({ echeance, mois, aujourdhui }: { readonly echeance: LeasePayment; readonly mois: string; readonly aujourdhui: string }) {
  const t = useTranslations('lease.fiche.loyer');
  const f = useFormatteurs();
  const penalite = echeance.late_fee_outstanding > 0 ? echeance.late_fee_outstanding : null;
  if (echeance.is_overdue || echeance.status === 'late') {
    const jours = echeance.due_date ? joursEntre(echeance.due_date, aujourdhui) : 0;
    return (
      <div className="mt-3 rounded-lg bg-destructive/10 p-3" data-testid="etat-du-mois">
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="size-4 flex-none" strokeWidth={2} aria-hidden="true" />
          {jours > 0 ? t('enRetard', { mois, jours }) : t('enRetardSansJours', { mois })}
        </p>
        {penalite !== null ? (
          <p className="mt-1 pl-6 text-ui text-foreground">
            {t.rich('penaliteDue', {
              montant: f.montantCourt(penalite, echeance.currency),
              total: f.montantCourt(echeance.remaining_amount + penalite, echeance.currency),
              m: (morceau) => <span className="font-medium tabular-nums">{morceau}</span>,
            })}
          </p>
        ) : null}
      </div>
    );
  }
  if (echeance.status === 'paid') {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-ui text-success" data-testid="etat-du-mois">
        <Check className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
        {t('paye', { mois, date: f.jourMois(echeance.paid_at) })}
      </p>
    );
  }
  return (
    <p className="mt-3 text-ui text-muted-foreground" data-testid="etat-du-mois">
      {t('aVenir', { mois, date: f.jourMois(echeance.due_date) })}
    </p>
  );
}

export function CarteDuree({ lease, className }: { readonly lease: LeaseWithRelations; readonly className?: string }) {
  const t = useTranslations('lease.fiche.duree');
  const f = useFormatteurs();
  const date = (d: string) => f.date(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const indemnite = lease.early_termination_penalty_months ?? 0;
  const total = lease.end_date ? Math.max(1, moisEntre(lease.start_date, lease.end_date) + 1) : null;
  const ecoules = Math.max(0, moisEntre(lease.start_date, aujourdhuiADakar()) + 1);
  const enCours = total !== null && lease.status !== 'draft' && lease.status !== 'pending_signature' && ecoules >= 1 && ecoules <= total;
  return (
    <Carte className={cn('p-4', className)} data-testid="carte-duree">
      <p className="text-ui text-muted-foreground">{indemnite > 0 ? t('titreIndemnite', { mois: indemnite }) : t('titre')}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">
        {lease.end_date ? t('periode', { debut: date(lease.start_date), fin: date(lease.end_date) }) : t('sansFin', { debut: date(lease.start_date) })}
      </p>
      {enCours && total !== null ? (
        <>
          <Jauge part={ecoules / total} className="mt-3" />
          <p className="mt-1.5 text-ui text-muted-foreground">{t('avancement', { n: ecoules, total })}</p>
        </>
      ) : null}
    </Carte>
  );
}

export function CarteCaution({
  lease,
  paiements,
  className,
}: {
  readonly lease: LeaseWithRelations;
  readonly paiements: readonly LeasePayment[] | undefined;
  readonly className?: string;
}) {
  const t = useTranslations('lease.fiche.caution');
  const f = useFormatteurs();
  const caution = lease.deposit_amount ?? 0;
  const loyer = lease.monthly_rent ?? 0;
  const enMois = loyer > 0 && caution > 0 && Number.isInteger(caution / loyer) ? caution / loyer : null;
  const ligne = paiements?.find((p) => p.payment_type === 'deposit' && p.status !== 'cancelled') ?? null;

  let etat: { readonly texte: string; readonly ton: 'succes' | 'neutre' } | null = null;
  if (lease.deposit_refunded_at) etat = { texte: t('restituee', { date: f.jourMois(lease.deposit_refunded_at) }), ton: 'neutre' };
  else if (ligne?.status === 'paid' && ligne.paid_at) etat = { texte: t('encaissee', { date: f.jourMois(ligne.paid_at) }), ton: 'succes' };
  else if (ligne) etat = { texte: t('aEncaisser'), ton: 'neutre' };
  // Décision 7 (b) : un bail renouvelé n'a pas d'échéance de caution, sa caution vit sur le parent.
  else if (paiements && lease.renewed_from_lease_id) etat = { texte: t('reprise'), ton: 'neutre' };

  return (
    <Carte className={cn('p-4', className)} data-testid="carte-caution">
      <p className="text-ui text-muted-foreground">{enMois !== null ? t('titreMois', { mois: enMois }) : t('titre')}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{caution > 0 ? f.montantCourt(caution, lease.currency) : '—'}</p>
      {etat ? (
        <p className={cn('mt-1.5 flex items-center gap-1.5 text-ui', etat.ton === 'succes' ? 'text-success' : 'text-muted-foreground')}>
          {etat.ton === 'succes' ? <Check className="size-3.5" strokeWidth={2.25} aria-hidden="true" /> : null}
          {etat.texte}
        </p>
      ) : null}
    </Carte>
  );
}
