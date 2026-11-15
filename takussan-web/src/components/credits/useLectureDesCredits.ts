'use client';

import { useTranslations } from 'next-intl';

import type { BoostKind, BoostVariant, CreditMovement } from '@/components/boost/types';
import { useFormatteurs } from '@/lib/format/useFormatteurs';

import { familleDe, type FamilleDOffre } from './lecture';

/**
 * TCK-2664 — les libellés de la page Crédits, en un seul endroit : le nom d'une offre (« Vedette 7 j »),
 * l'objet et le détail d'une opération de l'historique.
 */
export function useLectureDesCredits() {
  const t = useTranslations('credits');
  const f = useFormatteurs();

  const famille = (x: FamilleDOffre) => t(`offres.${x}.nom`);
  /** « Vedette 7 j », « Badge « Urgent » », « Remontée » : la durée n'est dite que pour la Vedette. */
  const offre = (kind: BoostKind, variant: BoostVariant | null, jours?: number | null) => {
    const x = familleDe(kind, variant);
    return x === 'featured' && jours ? t('offres.featured.court', { jours }) : famille(x);
  };

  /** Le titre d'une opération : l'offre et le bien pour une mise en avant, sinon son motif ou son type. */
  const objet = (m: CreditMovement) => {
    if (m.boost) {
      const o = offre(m.boost.kind, m.boost.variant);
      return m.boost.property ? t('movements.object', { offer: o, property: m.boost.property.title }) : o;
    }
    return m.reason ?? t(`types.${m.type}`);
  };

  /** Le détail : l'opération (si le titre ne la dit pas), la date et l'heure, le motif (s'il n'est pas le titre). */
  const detail = (m: CreditMovement, { avecDate = true }: { readonly avecDate?: boolean } = {}) => {
    const titre = objet(m);
    const operation = t(`types.${m.type}`);
    return [
      operation !== titre ? operation : null,
      avecDate ? t('historique.quand', { date: f.jourMois(m.created_at), heure: f.heure(m.created_at) }) : null,
      m.reason && m.reason !== titre ? m.reason : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  return { famille, offre, objet, detail };
}
