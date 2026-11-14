'use client';

import { useEffect, useRef } from 'react';

/**
 * TCK-2682 — L'ARMEMENT d'un geste de la file guidée. Quand la file avance, le geste de l'échéance
 * suivante arrive SOUS LE POINTEUR, à la même place que celui qu'on vient d'activer : un double-clic
 * de souris, ou un double toucher au téléphone, l'activerait aussitôt. Mesuré le 2026-11-12 (vérif.
 * de TCK-2682, d1) : deux clics à 140 ms sur « Ouvrir WhatsApp », liens en cache, et le second ouvre
 * WhatsApp chez le locataire SUIVANT et note sa relance — un message que l'admin n'a pas lu.
 *
 * Un geste n'est donc pris qu'une fois ARMÉ : `DELAI_D_ARMEMENT` après que sa clé est apparue (un
 * nouveau locataire présenté, une ancre devenue prête). `event.detail > 1` ne suffirait pas : un
 * double toucher rend `detail` 1.
 */
export const DELAI_D_ARMEMENT = 500;

/** Vrai quand un clic arrive avant que le geste soit armé (`pretDepuis` nul : pas encore armé). */
export function clicPremature(pretDepuis: number | null, maintenant: number, delai: number = DELAI_D_ARMEMENT): boolean {
  return pretDepuis === null || maintenant - pretDepuis < delai;
}

/**
 * Rend une fonction qui dit si un clic, MAINTENANT, est prématuré. `cle` nulle : le geste n'est pas
 * prêt. L'instant est relevé après le rendu qui montre la clé : un clic qui précède ce relevé, ou qui
 * vise une clé que le relevé ne porte pas encore, est prématuré.
 */
export function useArmement(cle: string | number | null, delai: number = DELAI_D_ARMEMENT): () => boolean {
  const arme = useRef<{ readonly cle: string | number; readonly depuis: number } | null>(null);
  useEffect(() => {
    arme.current = cle === null ? null : { cle, depuis: Date.now() };
  }, [cle]);
  return () => {
    const a = arme.current;
    return clicPremature(a !== null && a.cle === cle ? a.depuis : null, Date.now(), delai);
  };
}
