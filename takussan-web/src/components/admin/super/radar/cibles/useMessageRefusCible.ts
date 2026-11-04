'use client';

import { useTranslations } from 'next-intl';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { ERREURS_CIBLES_RADAR } from '../codes-radar';
import { critereDuChamp, parametresDuRefus } from './criteres';

/** Le code d'un refus (`{code}`), s'il y en a un. */
export function codeDuRefus(erreur: unknown): string | undefined {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return undefined;
  const code = (erreur.data as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * TCK-2469 — le libellé d'un refus des cibles, lu par son CODE (`radar.targets.*`, {@link ERREURS_CIBLES_RADAR}) : le
 * critère fautif est nommé par son libellé (`params.field` → `targets.fields.*`), la borne par `params.max`. Jamais le
 * code brut. À défaut : les messages de validation de Laravel (nom trop long…), puis le libellé générique de l'API, puis
 * le repli de l'écran.
 */
export function useMessageRefusCible() {
  const t = useTranslations('superAdmin.pages.radar.targets');
  const messageErreur = useMessageErreurApi();

  return (erreur: unknown, repli: string = t('errors.generic')): string => {
    const code = codeDuRefus(erreur);
    if (code && ERREURS_CIBLES_RADAR[code]) {
      const params = parametresDuRefus(erreur);
      const critere = critereDuChamp(params.field);
      return t(`errors.${ERREURS_CIBLES_RADAR[code]}`, {
        field: critere ? t(`fields.${critere}`) : t('errors.someCriterion'),
        max: typeof params.max === 'number' ? params.max : '',
      });
    }
    const validation = erreur instanceof ApiError ? erreur.validationErrors : undefined;
    if (validation) {
      const messages = Object.values(validation).flat().filter(Boolean);
      if (messages.length > 0) return messages.join(' ');
    }
    return messageErreur(erreur, repli);
  };
}
