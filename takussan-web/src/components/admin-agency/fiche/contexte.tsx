'use client';

import { createContext, useContext } from 'react';

import type { Completude, ElementDeLaCompletude, NumerosDuDossier } from '@/lib/agence/fiche';
import { OU_SE_REMPLIT } from '@/lib/agence/fiche';
import type { Agency } from '@/types/agency';

/**
 * TCK-2670 — ce que les sections de la fiche lisent de la page : l'agence ENREGISTRÉE (la seule
 * référence), les champs modifiés (liseré « modifié ») et les éléments manquants (« à remplir »).
 */
export interface ContexteDeLaFiche {
  readonly agence: Agency;
  readonly individuelle: boolean;
  readonly vitrine: boolean;
  readonly filigranes: boolean;
  /** L'adresse publique de la fiche, sans protocole (`takussan.com/agencies/dakar-immo`). */
  readonly adressePublique: string;
  /** Le chemin de la fiche publique, pour « Voir ma fiche publique ». */
  readonly cheminPublic: string;
  readonly modifies: ReadonlySet<string>;
  readonly manquants: readonly ElementDeLaCompletude[];
  /** La complétude de la fiche enregistrée ; `null` tant qu'elle ne se calcule pas (dossier en lecture). */
  readonly completude: Completude | null;
  /** Les numéros que portent les pièces du dossier de vérification (TCK-2669) ; vides tant qu'il n'est pas lu. */
  readonly numerosDuDossier: NumerosDuDossier;
  /** Une agence relue hors de l'enregistrement (le logo déposé). */
  readonly surAgenceRelue: (agence: Agency) => void;
  /** Le retour d'un geste immédiat (logo, filigranes, seuil confirmé). */
  readonly annoncer: (message: string) => void;
}

const Contexte = createContext<ContexteDeLaFiche | null>(null);

export const FournisseurDeLaFiche = Contexte.Provider;

export function useFiche(): ContexteDeLaFiche {
  const valeur = useContext(Contexte);
  if (valeur === null) throw new Error('FournisseurDeLaFiche'); // useFiche hors de la fiche : une erreur de développement, jamais affichée.
  return valeur;
}

/** Le champ est-il modifié, ou vide et compté par la jauge ? */
export function useEtatDuChamp(champ: string): { readonly modifie: boolean; readonly manque: boolean } {
  const { modifies, manquants } = useFiche();
  const modifie = modifies.has(champ.split('.')[0] ?? champ);
  const manque = manquants.some((e) => OU_SE_REMPLIT[e].champ === champ);
  return { modifie, manque };
}
