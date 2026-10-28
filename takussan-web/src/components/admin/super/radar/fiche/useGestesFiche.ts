'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { ApiError } from '@/lib/api';
import {
  discardRadarListing,
  fetchNextRadarListingId,
  markRadarListingDuplicate,
  radarKeys,
  reviewRadarListing,
} from '@/lib/queries/radar';
import type { RadarDiscardReason, RadarDuplicateTarget, RadarListingDetail, RadarListingDetailResponse } from '@/types/radar';
import { champDeLaFiche, focaliserChamp, peutFermer, peutValider } from './gestes';
import type { CorrectionsFiche } from './useCorrectionsFiche';

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
 */
export function useGestesFiche(detail: RadarListingDetail, corrections: CorrectionsFiche) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [manquants, setManquants] = useState<string[]>([]);

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
  });

  const permis = (geste: Geste['type']): boolean =>
    geste === 'review' ? peutValider(detail.stage) : peutFermer(detail.stage);

  const lancer = async (geste: Geste): Promise<boolean> => {
    if (!permis(geste.type) || mutation.isPending || corrections.enCours) return false;
    mutation.reset();
    setManquants([]);

    if (!(await corrections.enregistrer())) return false;
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
  };

  return {
    lancer,
    valider: () => lancer({ type: 'review' }),
    peutValider: permis('review'),
    peutFermer: permis('duplicate'),
    enCours: mutation.isPending,
    erreur: mutation.error,
    manquants,
    effacerErreur: () => {
      mutation.reset();
      setManquants([]);
    },
  };
}

export type GestesFiche = ReturnType<typeof useGestesFiche>;
