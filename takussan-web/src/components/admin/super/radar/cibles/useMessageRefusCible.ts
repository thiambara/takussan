'use client';

import { useTranslations } from 'next-intl';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ERREURS_CIBLES_RADAR } from '../codes-radar';
import { critereDuChamp } from './criteres';

/**
 * TCK-2469 — le libellé d'un refus des cibles, lu par son CODE (`radar.targets.*`, {@link ERREURS_CIBLES_RADAR}) : le
 * critère fautif est nommé par son libellé (`params.field` → `targets.fields.*`), la borne par `params.max`. Jamais le
 * code brut. À défaut : les messages de validation de Laravel (nom trop long…), puis le libellé générique de l'API, puis
 * le repli de l'écran — la cascade de {@link useMessageErreurApi} (TCK-3008).
 */
export function useMessageRefusCible() {
  const t = useTranslations('superAdmin.pages.radar.targets');
  const tErreurs = useTranslations('superAdmin.pages.radar.targets.errors');
  const messageErreur = useMessageErreurApi({
    tables: [{
      t: tErreurs,
      codes: ERREURS_CIBLES_RADAR,
      parametres: (_code, erreur) => {
        const critere = critereDuChamp(erreur.params.field);
        return {
          field: critere ? t(`fields.${critere}`) : t('errors.someCriterion'),
          max: typeof erreur.params.max === 'number' ? erreur.params.max : '',
        };
      },
    }],
    validation: true,
  });

  return (erreur: unknown, repli: string = t('errors.generic')): string => messageErreur(erreur, repli);
}
