'use client';

import { useEffect, useRef } from 'react';

/**
 * TCK-566 — autosave d'un brouillon de parcours qui n'écrit QUE ce que la
 * personne a saisi.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Retour testeur du 2026-09-23 : « J'ai seulement cliqué sur la notification
 * (passer en pro) ; je n'ai pas renseigné une seule ligne et on me dit
 * "reprendre là où j'en étais". »
 *
 * Les deux consommateurs de `useWizardDraft` — `WizardReprenable` (les quatre
 * assistants d'onboarding) et `UpgradeRequestForm` (le passage en pro) —
 * appelaient `save(step, data)` dans un effet dès l'hydratation, sans condition.
 * L'état VIERGE partait donc au serveur ~800 ms après l'ouverture, et
 * `GET /api/me/wizard-drafts` le rendait au bandeau du tableau de bord
 * (`WizardDraftsBanner`) comme « 1 démarche en cours ». Le serveur n'y est pour
 * rien : il enregistre ce qu'on lui envoie, et ne peut pas savoir à quoi
 * ressemble un formulaire vide.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * **Un brouillon existe si, et seulement si, l'état diffère de l'état vierge.**
 *
 * - différent de l'état vierge → `save()` (débouncé, inchangé), sauf s'il est
 *   identique à ce que le serveur tient déjà (un brouillon relu n'est pas
 *   réécrit à l'ouverture) ;
 * - égal à l'état vierge, rien d'écrit → rien du tout ;
 * - égal à l'état vierge alors qu'un brouillon existe (la personne a tout
 *   effacé, ou un brouillon vide hérité de l'ancien comportement vient d'être
 *   relu) → `clear()` : il n'y a plus rien à reprendre.
 *
 * « Égal » se juge sur une sérialisation à clés triées : l'ordre des clés d'un
 * objet recomposé par `{ ...data, x }` n'est pas une différence de saisie.
 *
 * Le hook rend `brouillonAttendu()`, qui dit si un brouillon est ATTENDU côté
 * serveur — ce que le toast « Progression sauvegardée » doit lire avant de
 * s'annoncer. Une fonction et non le ref lui-même : elle se lit au moment de
 * l'appel, y compris depuis la fermeture de nettoyage d'un effet monté bien
 * avant.
 */

function trier(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(trier);
  if (valeur !== null && typeof valeur === 'object') {
    const objet = valeur as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(objet)
        .sort()
        .map((cle) => [cle, trier(objet[cle])]),
    );
  }
  return valeur;
}

/** Sérialisation stable d'un état de parcours (étape + données). */
export function serialiserEtatBrouillon(step: number, data: unknown): string {
  return JSON.stringify({ step, data: trier(data) });
}

export interface OptionsAutosaveBrouillon<TData> {
  /** Faux tant que le brouillon serveur n'a pas été relu : rien ne s'écrit avant. */
  readonly hydrated: boolean;
  readonly step: number;
  readonly data: TData;
  /**
   * L'état VIERGE sérialisé par {@link serialiserEtatBrouillon} — ce que le
   * parcours affiche à l'ouverture, avant toute saisie. `null` tant qu'il n'est
   * pas connu : le hook n'agit pas.
   */
  readonly etatVierge: string | null;
  /** Un brouillon existait-il côté serveur au moment de l'hydratation ? */
  readonly brouillonServeurExiste: boolean;
  readonly save: (step: number, data: TData) => void;
  readonly clear: () => Promise<void>;
}

export function useAutosaveBrouillon<TData>({
  hydrated,
  step,
  data,
  etatVierge,
  brouillonServeurExiste,
  save,
  clear,
}: OptionsAutosaveBrouillon<TData>): { readonly brouillonAttendu: () => boolean } {
  // Ce que le serveur tient (ou tiendra, une fois l'écriture débouncée partie),
  // sérialisé ; `null` quand aucun brouillon n'existe ni n'est attendu.
  // Amorcé UNE fois, à la première exécution après l'hydratation : l'état affiché
  // à cet instant EST le brouillon relu (l'hydratation se fait pendant le rendu,
  // avant l'effet). Les rendus suivants du parent voient `draft` changer au gré
  // des PUT, ce n'est plus une information d'ouverture.
  //
  // Le comparer à l'état courant évite de RÉÉCRIRE à l'identique un brouillon
  // qu'on vient de relire : ouvrir un parcours n'est pas une saisie, et ce PUT
  // ne faisait que rajeunir son `updated_at` — donc le remonter en tête du
  // bandeau et repousser sa purge — sans que personne ait rien tapé.
  //
  // ⚠ Il suit la dernière écriture DEMANDÉE, pas la dernière réussie : taper
  // « a » puis revenir à l'état relu doit envoyer l'état relu, sinon le « a »
  // encore en attente dans le débounce partirait seul.
  const referenceServeurRef = useRef<string | null>(null);
  const amorceRef = useRef(false);

  useEffect(() => {
    if (!hydrated || etatVierge === null) return;
    const courant = serialiserEtatBrouillon(step, data);
    if (!amorceRef.current) {
      amorceRef.current = true;
      referenceServeurRef.current = brouillonServeurExiste ? courant : null;
    }

    if (courant !== etatVierge) {
      if (courant === referenceServeurRef.current) return;
      referenceServeurRef.current = courant;
      save(step, data);
      return;
    }

    if (referenceServeurRef.current !== null) {
      referenceServeurRef.current = null;
      // `clear()` annule aussi une écriture débouncée encore en attente.
      void clear();
    }
  }, [hydrated, etatVierge, brouillonServeurExiste, step, data, save, clear]);

  return { brouillonAttendu: () => referenceServeurRef.current !== null };
}
