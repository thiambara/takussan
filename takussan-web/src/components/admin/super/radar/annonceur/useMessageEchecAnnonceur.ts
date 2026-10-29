'use client';

import { useTranslations } from 'next-intl';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { ERREURS_ANNONCEUR_RADAR, ERREURS_SAISIE_RADAR, MOTIFS_RADAR, MOTIFS_VERIFICATION_RADAR } from '../codes-radar';
import { ERREURS_PUBLICATION_RADAR } from '../publication/codes-publication';
import { codeDeLErreur } from '../fiche/useMessageEchecFiche';

/** Le paramètre `claimed_until` d'un 409 `claimed_by_other` : l'instant jusqu'où l'autre opérateur tient la prise. */
function priseJusqua(erreur: unknown): string | null {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return null;
  const params = (erreur.data as { params?: unknown }).params;
  if (!params || typeof params !== 'object') return null;
  const until = (params as { claimed_until?: unknown }).claimed_until;
  return typeof until === 'string' ? until : null;
}

/**
 * TCK-2388 — le libellé d'un refus de la fiche annonceur, lu par son CODE et jamais par la prose du serveur.
 * `claimed_by_other` dit jusqu'à quand, formaté dans la langue de l'écran. À défaut de code connu : les
 * messages de validation (un 422 de champ), puis le libellé générique de l'API.
 */
export function useMessageEchecAnnonceur() {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const tSaisie = useTranslations('superAdmin.pages.radar.intake');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const libelleCode = useLibelleCodePublication();

  return (erreur: unknown, repli: string = t('errors.generic')): string => {
    const code = codeDeLErreur(erreur);
    // TCK-2389 — la publication et la réserve de photos : leurs codes ont leur libellé sous `publication.errors`.
    if (code && ERREURS_PUBLICATION_RADAR[code]) return libelleCode(code, erreur);
    if (code && ERREURS_ANNONCEUR_RADAR[code]) {
      const cle = ERREURS_ANNONCEUR_RADAR[code];
      if (code === 'radar.advertiser.claimed_by_other') {
        return t(`errors.${cle}`, { until: fmt.dateTime(priseJusqua(erreur)) });
      }
      return t(`errors.${cle}`);
    }
    // Le dépôt d'une réponse reçoit les refus de la saisie : une capture illisible ou trop grande (422).
    if (code && ERREURS_SAISIE_RADAR[code]) return tSaisie(`errors.${ERREURS_SAISIE_RADAR[code]}`);
    if (erreur instanceof ApiError && erreur.status === 413) return tSaisie('errors.payloadTooLarge');
    const validation = erreur instanceof ApiError ? erreur.validationErrors : undefined;
    if (validation) {
      const messages = Object.values(validation).flat().filter(Boolean);
      if (messages.length > 0) return messages.join(' ');
    }
    return messageErreur(erreur, repli);
  };
}

/** Le paramètre `max` d'un 422 `radar.photo.reserve_full` : la taille de la réserve. */
function maxDeLaReserve(erreur: unknown): number | null {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return null;
  const params = (erreur.data as { params?: unknown }).params;
  const max = params && typeof params === 'object' ? (params as { max?: unknown }).max : undefined;
  return typeof max === 'number' ? max : null;
}

/**
 * TCK-2389 — le libellé d'un CODE de la publication ou de la réserve de photos (refus de l'API ou `blocking` de l'aperçu),
 * ou `null` s'il n'en est pas un. Le code d'une annonce ou de l'annonceur déjà connu de la fiche passe par
 * {@link useMessageEchecAnnonceur}.
 */
export function useLibelleCodePublication() {
  const t = useTranslations('superAdmin.pages.radar.publication.errors');
  const tFiche = useTranslations('superAdmin.pages.radar.advertiser');

  return (code: string, erreur?: unknown): string => {
    const cle = ERREURS_PUBLICATION_RADAR[code];
    if (cle) return cle === 'reserveFull' ? t(cle, { max: maxDeLaReserve(erreur) ?? 20 }) : t(cle);
    const annonceur = ERREURS_ANNONCEUR_RADAR[code];
    return annonceur ? tFiche(`errors.${annonceur}`) : code;
  };
}

/**
 * TCK-2388 — un motif du Radar lu par son code : un refus de l'annonceur (`ai_error` d'une préparation :
 * `radar.message.generation_incomplete`), un code de la passerelle (`ai.*`, libellés de
 * `superAdmin.pages.radar.reasons`) ou un motif de vérification (`radar.verification.*`). Un code inconnu
 * s'affiche brut, jamais masqué.
 */
export function useMotifRadar() {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const tRadar = useTranslations('superAdmin.pages.radar');

  return (code: string): string => {
    if (ERREURS_ANNONCEUR_RADAR[code]) return t(`errors.${ERREURS_ANNONCEUR_RADAR[code]}`);
    if (MOTIFS_VERIFICATION_RADAR[code]) return t(`reply.reasons.${MOTIFS_VERIFICATION_RADAR[code]}`);
    if (MOTIFS_RADAR[code]) return tRadar(`reasons.${MOTIFS_RADAR[code]}`);
    return code;
  };
}
