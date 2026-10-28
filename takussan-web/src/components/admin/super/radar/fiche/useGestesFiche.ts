'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { ApiError } from '@/lib/api';
import {
  discardRadarListing,
  fetchNextRadarListingId,
  fetchRadarMatches,
  markRadarListingDuplicate,
  radarKeys,
  reviewRadarListing,
} from '@/lib/queries/radar';
import type {
  RadarDiscardReason,
  RadarDuplicateTarget,
  RadarListingDetail,
  RadarListingDetailResponse,
  RadarMatch,
  RadarMatchesResponse,
} from '@/types/radar';
import { champDeLaFiche, estConflitDEtape, focaliserChamp, peutFermer, peutValider } from './gestes';
import { estRapprochementFort } from './RadarMatchesPanel';
import type { CorrectionsFiche } from './useCorrectionsFiche';

const cleDeRapprochement = (match: RadarMatch) => `${match.kind}:${match.id}`;

export type Geste =
  | { readonly type: 'review' }
  | { readonly type: 'duplicate'; readonly cible: RadarDuplicateTarget }
  | { readonly type: 'discard'; readonly motif: RadarDiscardReason };

/** Les champs que l'API dit manquer à la validation (`params.fields` du 422 `radar.review.incomplete`). */
export function champsManquants(erreur: unknown): string[] {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return [];
  const donnees = erreur.data as { code?: unknown; params?: { fields?: unknown } };
  if (donnees.code !== 'radar.review.incomplete' || !Array.isArray(donnees.params?.fields)) return [];
  return donnees.params.fields.filter((champ): champ is string => typeof champ === 'string');
}

/**
 * TCK-2387 — les trois gestes de la fiche : valider, doublon, écarter.
 *
 * Chacun envoie d'abord les corrections en attente ({@link CorrectionsFiche.enregistrer}) : un geste ne
 * part jamais sur une fiche que l'opérateur a corrigée sans l'enregistrer, et un refus de l'enregistrement
 * arrête le geste. Après un geste réussi, la fiche suivante à relire s'ouvre (la plus ancienne `extracted`,
 * hors celle-ci) ; à défaut, retour à la liste. Un 422 « incomplet » focalise le premier champ manquant.
 *
 * **Valider relit les rapprochements avant d'écrire** : ce qu'on vient de corriger (quartier, prix, chambres)
 * ou de rattacher (annonceur) peut en faire apparaître un que l'opérateur n'a pas vu. S'il en paraît un de
 * force moyenne ou plus qu'il n'avait pas sous les yeux, la validation s'arrête — l'alerte est à l'écran —
 * et un second geste valide. Un GET de plus par validation vaut mieux qu'un doublon validé en aveugle.
 */
export function useGestesFiche(detail: RadarListingDetail, corrections: CorrectionsFiche) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [manquants, setManquants] = useState<string[]>([]);
  const [nouveauxRapprochements, setNouveauxRapprochements] = useState(false);
  // Un geste à la fois, même entre deux rendus : `mutation.isPending` ne se met à jour qu'au suivant.
  const enVol = useRef(false);

  const mutation = useMutation<RadarListingDetailResponse, ApiError, Geste>({
    mutationFn: (geste) => {
      switch (geste.type) {
        case 'review': return reviewRadarListing(detail.id);
        case 'duplicate': return markRadarListingDuplicate(detail.id, geste.cible);
        case 'discard': return discardRadarListing(detail.id, geste.motif);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: radarKeys.all });
    },
    onError: (erreur) => {
      if (estConflitDEtape(erreur)) void queryClient.invalidateQueries({ queryKey: radarKeys.detail(detail.id) });
    },
  });

  const permis = (geste: Geste['type']): boolean =>
    geste === 'review' ? peutValider(detail.stage) : peutFermer(detail.stage);

  /** Un rapprochement fort que l'opérateur n'avait pas sous les yeux, relu juste avant d'écrire. */
  const apparaitUnRapprochement = async (vus: ReadonlySet<string>): Promise<boolean> => {
    const frais = await queryClient
      .fetchQuery<RadarMatchesResponse>({
        queryKey: radarKeys.matches(detail.id),
        queryFn: () => fetchRadarMatches(detail.id),
        staleTime: 0,
      })
      // Impossible à relire : le panneau le dit déjà, et la validation n'attend pas un service qui boite.
      .catch(() => null);
    return (frais?.data.matches ?? []).some((m) => estRapprochementFort(m) && !vus.has(cleDeRapprochement(m)));
  };

  const lancer = async (geste: Geste): Promise<boolean> => {
    if (enVol.current || !permis(geste.type) || mutation.isPending || corrections.enCours) return false;
    enVol.current = true;
    try {
      mutation.reset();
      corrections.effacerErreur();
      setManquants([]);
      setNouveauxRapprochements(false);

      const vus = new Set(
        (queryClient.getQueryData<RadarMatchesResponse>(radarKeys.matches(detail.id))?.data.matches ?? [])
          .filter(estRapprochementFort)
          .map(cleDeRapprochement),
      );
      if (!(await corrections.enregistrer())) return false;
      if (geste.type === 'review' && await apparaitUnRapprochement(vus)) {
        setNouveauxRapprochements(true);
        return false;
      }
      try {
        await mutation.mutateAsync(geste);
      } catch (erreur) {
        const champs = champsManquants(erreur);
        if (champs.length > 0) {
          setManquants(champs);
          for (const champ of champs) if (focaliserChamp(champDeLaFiche(champ))) break;
        }
        return false;
      }

      const suivante = await fetchNextRadarListingId(detail.id).catch(() => null);
      router.push(suivante === null ? '/super-admin/radar' : `/super-admin/radar/${suivante}`);
      return true;
    } finally {
      enVol.current = false;
    }
  };

  return {
    lancer,
    valider: () => lancer({ type: 'review' }),
    peutValider: permis('review'),
    peutFermer: permis('duplicate'),
    enCours: mutation.isPending,
    erreur: mutation.error,
    manquants,
    nouveauxRapprochements,
    effacerErreur: () => {
      mutation.reset();
      setManquants([]);
      setNouveauxRapprochements(false);
    },
  };
}

export type GestesFiche = ReturnType<typeof useGestesFiche>;
