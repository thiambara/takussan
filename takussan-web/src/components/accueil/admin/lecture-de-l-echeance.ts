'use client';

import { useTranslations } from 'next-intl';

import { periodeDe } from '@/components/admin/finances/argent/encaissement';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PaymentHistoryRow } from '@/types/invoice';

/**
 * TCK-2775 — la lecture de l'échéance d'exemple d'« À faire » (« Seydou Camara · 250 000 F · Loyer
 * d'octobre ») : le nom du payeur, le reste dû, la période. La même que celle de l'écran Impayés
 * (`useLectureDImpaye`), sous les clés de l'ACCUEIL : celle de l'écran lit `admin`, que la frontière
 * de l'accueil ne sert plus depuis que la relance l'a quittée.
 */
export function useLectureDeLEcheance() {
  const t = useTranslations('accueil.admin.impayes.ligne');
  const f = useFormatteurs();
  return {
    nom: (row: PaymentHistoryRow) => row.payer?.name?.trim() || t('payeurInconnu'),
    /** Le reste dû : `amount_due` (celui du lien de paiement), sinon `remaining_amount`. */
    montantDu: (row: PaymentHistoryRow) => f.montantCourt(row.amount_due ?? row.remaining_amount, row.currency),
    periode: (row: PaymentHistoryRow) => {
      const { cle, mois } = periodeDe(row);
      const nomDuMois = mois ? f.date(`${mois.slice(0, 7)}-15T12:00:00Z`, { month: 'long' }) : '';
      // L'élision se dit dans le message (`voyelle`).
      return t(`periode.${cle}`, { mois: nomDuMois, voyelle: /^[aeiouyàâéèêh]/i.test(nomDuMois) ? 'oui' : 'non' });
    },
  };
}
