import { ApiError } from '@/lib/api';
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

/**
 * Un dialogue MODAL est ouvert, ou la touche part de l'intérieur d'un dialogue : les raccourcis lui
 * appartiennent, pas à la fiche derrière. Est modal : un `alertdialog`, un `aria-modal="true"`, et le
 * `DialogContent` de l'interface (`data-slot="dialog-content"` — Base UI ne pose pas `aria-modal`, et le focus
 * n'est pas encore dedans à l'instant de l'ouverture). Un `role="dialog"` non modal (un widget de discussion
 * posé sur la page) ne coupe rien tant que la touche ne part pas de lui.
 */
export const dialogueOuvert = (cible: EventTarget | null = null): boolean =>
  document.querySelector('[role="dialog"][aria-modal="true"], [role="dialog"][data-slot="dialog-content"], [role="alertdialog"]') !== null
  || (cible instanceof Element && cible.closest('[role="dialog"]') !== null);

/** 409 `radar.listing.stage_conflict` : la fiche a changé d'étape ailleurs, ce que l'écran montre est périmé. */
export const estConflitDEtape = (erreur: unknown): boolean =>
  erreur instanceof ApiError
  && erreur.status === 409
  && typeof erreur.data === 'object'
  && erreur.data !== null
  && (erreur.data as { code?: unknown }).code === 'radar.listing.stage_conflict';
