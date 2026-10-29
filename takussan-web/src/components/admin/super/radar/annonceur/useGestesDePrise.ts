'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { ApiError } from '@/lib/api';
import { claimRadarAdvertiser, radarKeys, releaseRadarAdvertiser } from '@/lib/queries/radar';
import type { RadarAdvertiserResponse, RadarClaimResponse } from '@/types/radar';

export interface GestesDePrise {
  readonly prise: UseMutationResult<RadarClaimResponse, ApiError, void>;
  /** Le renouvellement périodique : une mutation À PART, pour ne rien fermer pendant son appel. */
  readonly renouvellement: UseMutationResult<RadarClaimResponse, ApiError, void>;
  readonly restitution: UseMutationResult<void, ApiError, void>;
}

/**
 * TCK-2388 / TCK-2389 — les trois gestes de la prise en charge d'un annonceur (prendre, renouveler, rendre), partagés
 * par la fiche et par l'écran « Publier pour lui » : chaque geste de l'un et de l'autre exige une prise TENUE par
 * l'utilisateur (409 `radar.advertiser.claim_required` sinon), et un seul code la tient.
 *
 * La prise rendue par l'API est posée dans la lecture de la fiche (`radarKeys.advertiser`), puis tout le Radar se relit.
 * `surEchec` reçoit chaque refus : l'écran le dit et relit ce qu'il doit.
 *
 * Le renouvellement périodique est une mutation À PART, absente des gestes « en cours » de l'écran : s'il fermait les
 * champs pendant son appel, l'opérateur qui écrit perdrait le focus et ses frappes, toutes les quelques minutes. Il
 * ferme pourtant « Rendre » : une restitution qui croise un renouvellement en vol laisserait la prise reprise après
 * avoir été rendue.
 */
export function useGestesDePrise(annonceurId: number, surEchec: (e: unknown) => void): GestesDePrise {
  const queryClient = useQueryClient();
  const relire = () => queryClient.invalidateQueries({ queryKey: radarKeys.all });

  const priseRendue = (reponse: RadarClaimResponse) => {
    queryClient.setQueryData<RadarAdvertiserResponse>(radarKeys.advertiser(annonceurId), (detail) =>
      detail ? { data: { ...detail.data, claim: reponse.data.claim } } : detail);
    return relire();
  };

  const prise = useMutation<RadarClaimResponse, ApiError, void>({
    mutationFn: () => claimRadarAdvertiser(annonceurId),
    onSuccess: priseRendue,
    onError: surEchec,
  });
  const renouvellement = useMutation<RadarClaimResponse, ApiError, void>({
    mutationFn: () => claimRadarAdvertiser(annonceurId),
    onSuccess: priseRendue,
    onError: surEchec,
  });
  const restitution = useMutation<void, ApiError, void>({
    mutationFn: () => releaseRadarAdvertiser(annonceurId),
    onSuccess: relire,
    onError: surEchec,
  });

  return { prise, renouvellement, restitution };
}
