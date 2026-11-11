'use client';

import { Banknote, Check, Landmark, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { PAYMENT_STATUS_TONE, type PaymentStatus } from '@/components/payments/constants';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { initialesDuNom, jourDe, joursRecents, periodeDe } from './encaissement';

/**
 * TCK-2659 — un encaissement NOMMÉ : qui a payé, pour quel bien, quelle période — le montant à
 * droite (maquette `LigneEncaissement`, `app-argent-lignes.tsx`). Jamais « Bail #8 » ni « #27 » :
 * la référence ne vient qu'en dernière colonne du bureau.
 */

/** Le pictogramme d'un moyen : espèces, virement, sinon le téléphone (mobile money, carte). */
export function IconeDeMoyen({ moyen, className }: { readonly moyen: string | null; readonly className?: string }) {
  const Icone = moyen === 'cash' ? Banknote : moyen === 'bank_transfer' || moyen === 'check' ? Landmark : Smartphone;
  return <Icone className={cn('size-3.5 flex-none', className)} strokeWidth={1.75} aria-hidden="true" />;
}

/** Les libellés partagés d'une ligne : période, moyen, moment. */
export function useLectureDEncaissement() {
  const t = useTranslations('admin.finances.argent');
  const tMoyens = useTranslations('payments.methods');
  const f = useFormatteurs();
  const { aujourdhui, hier } = joursRecents();

  /** `court` (téléphone, maquette) : « Loyer nov. » ; sinon « Loyer de novembre », « Loyer d’octobre ». */
  const periode = (row: PaymentHistoryRow, court = false) => {
    const { cle, mois } = periodeDe(row);
    if (mois && court) return t(`periode.${cle}Court`, { mois: f.date(`${mois.slice(0, 7)}-15T12:00:00Z`, { month: 'short' }) });
    const nomDuMois = mois ? f.date(`${mois.slice(0, 7)}-15T12:00:00Z`, { month: 'long' }) : '';
    // L'élision se dit dans le message (`voyelle`).
    return t(`periode.${cle}`, { mois: nomDuMois, voyelle: /^[aeiouyàâéèêh]/i.test(nomDuMois) ? 'oui' : 'non' });
  };
  const moyen = (row: PaymentHistoryRow) =>
    row.payment_method ? (tMoyens.has(row.payment_method) ? tMoyens(row.payment_method) : row.payment_method.replace(/_/g, ' ')) : null;
  /** « aujourd'hui », « hier », sinon « 7 nov. » — l'API ne date les encaissements qu'au jour. */
  const quand = (row: PaymentHistoryRow) => {
    const jour = jourDe(row);
    if (!jour) return null;
    if (jour === aujourdhui) return t('jour.aujourdhuiMinuscule');
    if (jour === hier) return t('jour.hierMinuscule');
    return f.jourMois(`${jour}T12:00:00Z`);
  };
  const montant = (row: PaymentHistoryRow) => f.montantCourt(row.amount, row.currency);
  const nom = (row: PaymentHistoryRow) => row.payer?.name?.trim() || t('payeurInconnu');
  const bien = (row: PaymentHistoryRow) => row.property?.title?.trim() || null;
  return { periode, moyen, quand, montant, nom, bien };
}

/**
 * Le statut d'une ligne : au téléphone, « ✓ Payé » à l'encre du succès (la maquette), sinon sa
 * pastille ; au bureau (`pastille`), toujours la pastille. Le ton vient de `PAYMENT_STATUS_TONE`.
 */
export function StatutDEncaissement({ status, court, pastille }: { readonly status: string | null; readonly court?: boolean; readonly pastille?: boolean }) {
  const tStatus = useTranslations('payments.status');
  const s = (status ?? 'pending') as PaymentStatus;
  if (s === 'paid' && !pastille) {
    return (
      <span className="inline-flex flex-none items-center gap-1 text-xs font-medium text-success">
        <Check className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
        {tStatus('paid')}
      </span>
    );
  }
  return <StatusBadge tone={PAYMENT_STATUS_TONE[s] ?? 'neutral'} label={tStatus.has(s) ? tStatus(s) : s} className={cn('flex-none', court && 'h-5 px-1.5 text-legende')} />;
}

export function AvatarDuPayeur({ nom, taille = '40' }: { readonly nom: string; readonly taille?: '32' | '40' }) {
  return (
    <Avatar size={taille} aria-hidden="true">
      <AvatarFallback>{initialesDuNom(nom)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Téléphone : la ligne de 72 px, trois étages (payeur et montant ; bien et statut ; période, moyen, moment).
 * L'interligne des deux étages du bas est posé (`leading-normal`, 19,5 px de la maquette) : hérité, il
 * valait 18,6 px sous le registre et 19,5 px sous le point du mois.
 */
export function LigneDEncaissementTelephone({ row, sansJour }: { readonly row: PaymentHistoryRow; readonly sansJour?: boolean }) {
  const l = useLectureDEncaissement();
  const bien = l.bien(row);
  const meta = [l.periode(row, true), l.moyen(row), sansJour ? null : l.quand(row)].filter(Boolean).join(' · ');
  const echoue = row.status === 'failed';
  return (
    <div data-slot="ligne-encaissement" className="flex min-h-18 items-start gap-3 px-4 py-3">
      <AvatarDuPayeur nom={l.nom(row)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-corps font-semibold leading-tight">{l.nom(row)}</p>
          <p className={cn('flex-none text-corps font-semibold tabular-nums leading-tight', echoue && 'text-muted-foreground line-through')}>{l.montant(row)}</p>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-ui leading-normal text-muted-foreground">{bien ?? '—'}</p>
          <StatutDEncaissement status={row.status} court />
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-ui leading-normal text-muted-foreground">
          <IconeDeMoyen moyen={row.payment_method} />
          <span className="truncate">{meta}</span>
        </p>
      </div>
    </div>
  );
}
