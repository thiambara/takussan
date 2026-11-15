'use client';

import { useTranslations } from 'next-intl';

import { joursDepuis } from '@/lib/journee/journee';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import type { BailDeLaListe, EntreeDAttention, MotifDAttention } from '@/lib/queries/leases-file';

/**
 * TCK-2644 — la lecture d'une ligne de la file « À traiter » (maquette `app-baux`, approche a) : la
 * couleur du motif, ce qui attend, depuis quand, et LE geste. Une seule écriture, lue par la carte du
 * téléphone et par la rangée du tableau.
 */
export type TonDuMotif = 'danger' | 'attention' | 'info';

export const TON_DU_MOTIF: Readonly<Record<MotifDAttention, TonDuMotif>> = {
  signature_pending: 'attention',
  notice_received: 'info',
  rent_late: 'danger',
  late_fee_unpaid: 'danger',
  rent_review_open: 'info',
  deposit_to_refund: 'attention',
  ending_soon: 'attention',
  onboarding_incomplete: 'attention',
};

/** Le premier motif d'une ligne : l'API trie `attention[]` du plus grave au plus ancien. */
export function motifPrincipal(bail: BailDeLaListe): EntreeDAttention | null {
  return bail.attention?.[0] ?? null;
}

/** Les mois pleins (au moins 1) d'aujourd'hui à une date à venir — « dans 4 mois ». */
function moisJusquA(date: string, maintenant: Date): number {
  const jours = Math.round((Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - maintenant.getTime()) / 86_400_000);
  return Math.max(1, Math.round(jours / 30.44));
}

export function useLectureDuBail(maintenant: Date) {
  const t = useTranslations('lease.liste');
  const f = useFormatteurs();
  const jourMois = (d: string) => f.date(d, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const jourMoisAn = (d: string) => f.date(d, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const mois = (d: string) => f.date(d, { month: 'short', timeZone: 'UTC' });

  return {
    /** Le locataire nommé ; à défaut, « Locataire #12 ». */
    locataire: (bail: BailDeLaListe): string =>
      nomAffichable({ id: bail.tenant_id, first_name: bail.tenant?.first_name, last_name: bail.tenant?.last_name }, t('locataireSansNom', { id: String(bail.tenant_id) })),
    bien: (bail: BailDeLaListe): string => bail.property?.title ?? t('bienSansTitre', { id: String(bail.property_id) }),
    reference: (bail: BailDeLaListe): string => bail.reference_number || t('referenceDeRepli', { id: String(bail.id) }),

    /**
     * Ce qui attend. Le montant d'un impayé est la SOMME de l'API : un seul mois ne se nomme que si
     * une seule échéance est en retard (`overdue_count`), sinon le nombre de loyers.
     */
    quoi: (bail: BailDeLaListe, e: EntreeDAttention, manquants?: number, court = false): string => {
      const montant = e.amount !== undefined ? f.montantCourt(e.amount, bail.currency) : '';
      // Le tableau du bureau tait le montant d'UN loyer en retard, comme la maquette : sa ligne porte déjà
      // le loyer. Il le garde pour plusieurs loyers et pour la pénalité, que le loyer de la ligne ne dit
      // pas (décision de team-lead du 2026-11-13, point 4).
      switch (e.motif) {
        case 'signature_pending':
          return t('motifs.signature_pending');
        case 'notice_received':
          return t('motifs.notice_received', { date: jourMois(bail.early_termination_effective_date ?? bail.end_date ?? e.since) });
        case 'rent_late':
          return (bail.overdue_count ?? 1) > 1 || !e.due_date
            ? t('motifs.rent_late_plusieurs', { n: bail.overdue_count ?? 2, montant })
            : court
              ? t('motifsCourts.rent_late', { mois: mois(e.due_date) })
              : t('motifs.rent_late', { mois: mois(e.due_date), montant });
        case 'late_fee_unpaid':
          return t('motifs.late_fee_unpaid', { montant });
        case 'rent_review_open':
          return t('motifs.rent_review_open');
        case 'deposit_to_refund':
          return t('motifs.deposit_to_refund', { date: jourMois(e.since) });
        case 'ending_soon':
          return t('motifs.ending_soon', { date: jourMoisAn(bail.end_date ?? e.due_date ?? e.since) });
        case 'onboarding_incomplete':
          return manquants ? t('motifs.onboarding_incomplete_n', { n: manquants }) : t('motifs.onboarding_incomplete');
      }
    },

    /** Depuis quand : « depuis 6 j », « reçu il y a 2 j », « depuis le 1 nov. », « dans 4 mois ». */
    age: (bail: BailDeLaListe, e: EntreeDAttention): string => {
      switch (e.motif) {
        case 'notice_received':
          return t('ages.recu', { n: joursDepuis(e.since, maintenant) });
        case 'rent_review_open':
          return t('ages.depuisLe', { date: jourMois(e.since) });
        case 'ending_soon':
          return t('ages.dans', { n: moisJusquA(bail.end_date ?? e.due_date ?? e.since, maintenant) });
        default:
          return t('ages.depuis', { n: joursDepuis(e.since, maintenant) });
      }
    },

    /** Le libellé du geste, long (carte) ou court (colonne d'action du tableau). */
    geste: (motif: MotifDAttention, court = false): string => t(court ? `gestesCourts.${motif}` : `gestes.${motif}`),
  };
}

export type LectureDuBail = ReturnType<typeof useLectureDuBail>;
