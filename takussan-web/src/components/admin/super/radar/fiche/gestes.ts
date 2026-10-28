import type { RadarListingStage } from '@/types/radar';

/** Valider : la seule étape où la fiche se relit (`RadarListingStage::allowsReview`). */
export const peutValider = (stage: RadarListingStage): boolean => stage === 'extracted';

/** Doublon et écart : avant tout démarchage, extraction réussie ou non (`allowsClosing`). */
export const peutFermer = (stage: RadarListingStage): boolean =>
  stage === 'captured' || stage === 'extracted' || stage === 'extraction_failed' || stage === 'reviewed';

/** Changer d'annonceur : une fiche lue, pas encore démarchée (`allowsAdvertiserChange`). */
export const peutChangerAnnonceur = (stage: RadarListingStage): boolean => stage === 'extracted' || stage === 'reviewed';

/** Le nom du champ de la fiche que désigne un champ manquant de l'API (`neighborhood_id` → le groupe quartier). */
export const champDeLaFiche = (champApi: string): string => (champApi === 'neighborhood_id' ? 'neighborhood' : champApi);

const FOCALISABLES = 'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="combobox"]:not([disabled])';

/** Met le focus sur le premier contrôle utilisable du champ de la fiche ; `false` s'il n'y en a pas. */
export function focaliserChamp(champ: string): boolean {
  const zone = document.querySelector<HTMLElement>(`[data-champ="${champ}"]`);
  const controle = zone?.querySelector<HTMLElement>(FOCALISABLES);
  if (!controle) return false;
  controle.focus();
  controle.scrollIntoView?.({ block: 'nearest' });
  return true;
}

/**
 * Le geste part-il d'une zone où l'on tape ? `D` et `E` n'y déclenchent rien : champs, zones de texte,
 * listes déroulantes et leurs options, contenu éditable.
 */
export function estZoneDeSaisie(cible: EventTarget | null): boolean {
  if (!(cible instanceof Element)) return false;
  return cible.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="textbox"], [role="listbox"], [role="option"], [role="searchbox"]',
  ) !== null;
}

/** Un dialogue est ouvert : les raccourcis lui appartiennent, pas à la fiche derrière. */
export const dialogueOuvert = (): boolean =>
  document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
