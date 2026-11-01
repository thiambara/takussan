'use client';

import { useEffect, useEffectEvent } from 'react';

import type { RadarClaim } from '@/types/radar';

/** Le plus court délai avant un renouvellement : une prise presque échue ne déclenche pas une rafale d'appels. */
const DELAI_MIN_MS = 1_000;

/**
 * TCK-2388 — dans combien de millisecondes renouveler une prise qui expire à `until` : la moitié de ce qui
 * reste, jamais moins de {@link DELAI_MIN_MS}. `null` : la prise est échue, il n'y a plus rien à renouveler
 * (elle n'est plus à personne ; la fiche relue le dira).
 */
export function delaiDeRenouvellement(until: string, maintenant: number = Date.now()): number | null {
  const reste = new Date(until).getTime() - maintenant;
  if (!Number.isFinite(reste) || reste <= 0) return null;
  return Math.max(Math.floor(reste / 2), DELAI_MIN_MS);
}

interface PriseEnChargeOptions {
  readonly claim: RadarClaim | null;
  /** Renouvelle la prise (un `POST claim`) ; la fiche relue porte alors un nouveau `until`, qui replanifie. */
  readonly renouveler: () => void;
}

/**
 * TCK-2388 — garder la prise en charge tant qu'on travaille dessus. Elle se renouvelle à mi-durée de ce qui
 * reste, SEULEMENT si elle est à moi et que la page est visible : un onglet masqué ne tient rien, et une prise
 * à un autre ne se touche pas. Un renouvellement qui échoue ne se rejoue pas de lui-même (`until` n'a pas
 * bougé, le minuteur ne se réarme pas) : la fiche relue dit où en est la prise.
 */
export function usePriseEnCharge({ claim, renouveler }: PriseEnChargeOptions): void {
  const surRenouvellement = useEffectEvent(renouveler);
  const echeance = claim?.mine === true ? claim.until : null;

  useEffect(() => {
    if (echeance === null) return undefined;

    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const armer = () => {
      clearTimeout(minuteur);
      minuteur = undefined;
      if (document.visibilityState !== 'visible') return;
      const delai = delaiDeRenouvellement(echeance);
      if (delai === null) return;
      minuteur = setTimeout(() => surRenouvellement(), delai);
    };

    armer();
    document.addEventListener('visibilitychange', armer);
    return () => {
      clearTimeout(minuteur);
      document.removeEventListener('visibilitychange', armer);
    };
  }, [echeance]);
}
