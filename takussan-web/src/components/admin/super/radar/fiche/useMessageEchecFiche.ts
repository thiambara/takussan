'use client';

import { useTranslations } from 'next-intl';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { ERREURS_FICHE_RADAR } from '../codes-radar';
import { champDeLaFiche } from './gestes';
import { champsManquants } from './useGestesFiche';

/** Le code d'une erreur de l'API (`{code}`), s'il y en a un. */
export function codeDeLErreur(erreur: unknown): string | undefined {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return undefined;
  const code = (erreur.data as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * TCK-2387 — le libellé d'un refus de la fiche, lu par son CODE (409 d'étape, 422 d'un geste) et jamais par
 * la prose du serveur ; un 422 « incomplet » nomme les champs manquants. À défaut de code connu : les
 * messages de validation, puis le libellé générique de l'API, puis le repli de l'appelant.
 */
export function useMessageEchecFiche() {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const messageErreur = useMessageErreurApi();

  return (erreur: unknown, repli: string = t('errors.generic')): string => {
    const code = codeDeLErreur(erreur);
    if (code === 'radar.review.incomplete') {
      const champs = champsManquants(erreur).map((champ) => t(`fields.${champDeLaFiche(champ)}`));
      if (champs.length > 0) return t('errors.reviewIncompleteFields', { fields: champs.join(', ') });
    }
    if (code && ERREURS_FICHE_RADAR[code]) return t(`errors.${ERREURS_FICHE_RADAR[code]}`);
    const validation = erreur instanceof ApiError ? erreur.validationErrors : undefined;
    if (validation) {
      const messages = Object.values(validation).flat().filter(Boolean);
      if (messages.length > 0) return messages.join(' ');
    }
    return messageErreur(erreur, repli);
  };
}
