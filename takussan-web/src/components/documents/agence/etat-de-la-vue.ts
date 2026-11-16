'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import type { FiltreDeLAgence } from '@/lib/queries/coffre-de-l-agence';

/**
 * TCK-2896 — l'état de la vue de l'agence, gardé dans l'URL : `?dossier=` (un dossier de l'arbre,
 * {@link cleDuDossier}), `?filtre=` (une puce), `?q=` (la recherche, écrite par `ChampDeRecherche`) et
 * `?page=`. Écrit par l'historique du navigateur, que Next relie à `useSearchParams` sans requête au
 * serveur (comme la recherche du coffre) : ouvrir un dossier empile une entrée (le retour du téléphone
 * y revient), changer de puce ou de page la remplace.
 */
export function useEtatDeLaVue() {
  const chemin = usePathname();
  const params = useSearchParams();
  const brut = params.get('filtre');
  const filtre: FiltreDeLAgence = brut === 'expire' || brut === 'nonVerifies' || brut === 'generes' ? brut : 'tous';
  const page = Number.parseInt(params.get('page') ?? '', 10);

  const ecrire = (changements: Readonly<Record<string, string | null>>, empiler: boolean) => {
    const suivants = new URLSearchParams(params.toString());
    for (const [cle, valeur] of Object.entries(changements)) {
      if (valeur === null) suivants.delete(cle);
      else suivants.set(cle, valeur);
    }
    const qs = suivants.toString();
    const url = qs ? `${chemin}?${qs}` : chemin;
    if (empiler) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  };

  return {
    q: (params.get('q') ?? '').trim(),
    page: Number.isFinite(page) && page > 1 ? page : 1,
    filtre,
    dossier: params.get('dossier'),
    choisirFiltre: (f: FiltreDeLAgence) => ecrire({ filtre: f === 'tous' ? null : f, page: null }, false),
    choisirDossier: (cle: string | null) => ecrire({ dossier: cle, filtre: null, page: null }, true),
    choisirPage: (p: number) => ecrire({ page: p > 1 ? String(p) : null }, false),
  };
}

export type EtatDeLaVue = ReturnType<typeof useEtatDeLaVue>;
