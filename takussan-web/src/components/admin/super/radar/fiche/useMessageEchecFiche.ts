'use client';

import { useTranslations } from 'next-intl';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ERREURS_FICHE_RADAR } from '../codes-radar';
import { champDeLaFiche } from './gestes';
import { champsManquants } from './useGestesFiche';

/**
 * TCK-2387 — le libellé d'un refus de la fiche, lu par son CODE (409 d'étape, 422 d'un geste) et jamais par
 * la prose du serveur ; un 422 « incomplet » nomme les champs manquants. À défaut de code connu : les
 * messages de validation, puis le libellé générique de l'API, puis le repli de l'appelant — la cascade de
 * {@link useMessageErreurApi} (TCK-3008).
 */
export function useMessageEchecFiche() {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const tErreurs = useTranslations('superAdmin.pages.radar.listing.errors');
  const messageErreur = useMessageErreurApi({ tables: [{ t: tErreurs, codes: ERREURS_FICHE_RADAR }], validation: true });

  return (erreur: unknown, repli: string = t('errors.generic')): string => {
    // Le seul cas qui n'est pas une clé de table : la liste des champs, quand l'API la donne.
    const champs = champsManquants(erreur).map((champ) => t(`fields.${champDeLaFiche(champ)}`));
    if (champs.length > 0) return t('errors.reviewIncompleteFields', { fields: champs.join(', ') });
    return messageErreur(erreur, repli);
  };
}
