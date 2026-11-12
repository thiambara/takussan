'use client';

import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PaymentHistoryRow } from '@/types/invoice';

import { joursRecents } from '../argent/encaissement';
import { useLectureDEncaissement } from '../argent/LigneDEncaissement';

/**
 * TCK-2660 — la lecture d'un impayé : ce qu'il reste dû (le montant que le lien fera payer), la
 * dernière relance (« relancé aujourd'hui », « relancé le 3 nov. », « jamais relancé ») et son canal.
 * Aucun « Lu le … » : rien ne le mesure (ADR-0105, Conséquences).
 */
export function useLectureDImpaye() {
  const t = useTranslations('admin.finances.impayes');
  const f = useFormatteurs();
  const l = useLectureDEncaissement();
  const { aujourdhui } = joursRecents();

  /** Le reste dû de l'échéance : `amount_due` (celui du lien), sinon `remaining_amount`. */
  const du = (row: PaymentHistoryRow) => row.amount_due ?? row.remaining_amount;
  const montantDu = (row: PaymentHistoryRow) => f.montantCourt(du(row), row.currency);

  const relance = (row: PaymentHistoryRow) => {
    const derniere = row.last_reminder;
    if (!derniere) return t('relance.jamais');
    if (derniere.at.slice(0, 10) === aujourdhui) return t('relance.aujourdhui');
    return t('relance.le', { date: f.jourMois(derniere.at) });
  };

  const canal = (derniere: { readonly source?: string | null; readonly channel?: string | null } | null | undefined) => {
    if (!derniere) return null;
    if (derniere.source === 'automatic') return t('canal.automatique');
    if (derniere.channel === 'whatsapp') return t('canal.whatsapp');
    if (derniere.channel === 'call') return t('canal.appel');
    return null;
  };

  return { ...l, du, montantDu, relance, canal };
}
