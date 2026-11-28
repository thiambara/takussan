'use client';

import { useTranslations } from 'next-intl';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { ERREURS_ANNONCEUR_RADAR, ERREURS_SAISIE_RADAR, MOTIFS_RADAR, MOTIFS_VERIFICATION_RADAR } from '../codes-radar';
import { ERREURS_PUBLICATION_RADAR } from '../publication/codes-publication';

/**
 * TCK-2388 — le libellé d'un refus de la fiche annonceur, lu par son CODE et jamais par la prose du serveur.
 * `claimed_by_other` dit jusqu'à quand, formaté dans la langue de l'écran. TCK-2389 : la publication et la réserve
 * de photos ont leurs libellés sous `publication.errors` ; le dépôt d'une réponse reçoit les refus de la saisie (une
 * capture illisible ou trop grande). À défaut de code connu : les messages de validation (un 422 de champ), puis le
 * libellé générique de l'API — la cascade de {@link useMessageErreurApi} (TCK-3008).
 */
export function useMessageEchecAnnonceur() {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const tPublication = useTranslations('superAdmin.pages.radar.publication.errors');
  const tErreurs = useTranslations('superAdmin.pages.radar.advertiser.errors');
  const tErreursSaisie = useTranslations('superAdmin.pages.radar.intake.errors');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi({
    tables: [
      {
        t: tPublication,
        codes: ERREURS_PUBLICATION_RADAR,
        parametres: (code, erreur) => valeursDePublication(ERREURS_PUBLICATION_RADAR[code], erreur.params),
      },
      {
        t: tErreurs,
        codes: ERREURS_ANNONCEUR_RADAR,
        parametres: (code, erreur): Record<string, string> => (code === 'radar.advertiser.claimed_by_other'
          ? { until: fmt.dateTime(typeof erreur.params.claimed_until === 'string' ? erreur.params.claimed_until : null) }
          : {}),
      },
      { t: tErreursSaisie, codes: ERREURS_SAISIE_RADAR },
    ],
    validation: true,
  });

  return (erreur: unknown, repli: string = t('errors.generic')): string => {
    // Le 413 de l'image de l'API (`post_max_size`) ne porte aucun code du Radar : il passe avant les tables sans en
    // masquer aucune.
    if (erreur instanceof ApiError && erreur.status === 413) return tErreursSaisie('payloadTooLarge');
    return messageErreur(erreur, repli);
  };
}

/**
 * Les valeurs du libellé de publication `cle`, lues sur les `params` d'un refus — avec la borne connue de l'écran
 * quand l'API ne la donne pas (un `blocking` d'aperçu n'a pas de params).
 */
function valeursDePublication(cle: string | undefined, params: Readonly<Record<string, unknown>>): Record<string, number> {
  const nombre = (nom: string): number | null => (typeof params[nom] === 'number' ? (params[nom] as number) : null);
  if (cle === 'reserveFull') return { max: nombre('max') ?? 20 };
  if (cle === 'tooManyPhotos') return { max: nombre('max') ?? 30, count: nombre('count') ?? 0 };
  return {};
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
    if (cle) return t(cle, valeursDePublication(cle, erreur instanceof ApiError ? erreur.params : {}));
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
