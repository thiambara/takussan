'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { CIBLE_DE_LA_RANGEE, SOURCES_MAX, fusionnerSimilaires } from '@/lib/similaires-des-vus';
import type { PropertyListItem } from '@/types/property';

const AUCUN: readonly PropertyListItem[] = [];

/**
 * Les similaires qui complètent « Récemment consultés » jusqu'à `CIBLE_DE_LA_RANGEE` cartes (cf.
 * `similaires-des-vus.ts`). `actif` à faux, ou une rangée déjà pleine : aucune requête.
 *
 * Une source en panne est ignorée seule : les similaires sont un complément, jamais une raison
 * de faire disparaître les biens consultés.
 */
export function useSimilairesDesVus(
  vus: readonly PropertyListItem[],
  actif: boolean,
): readonly PropertyListItem[] {
  const [similaires, setSimilaires] = useState<{ cle: string; biens: readonly PropertyListItem[] }>({
    cle: '',
    biens: AUCUN,
  });

  const manque = CIBLE_DE_LA_RANGEE - vus.length;
  const sources = actif && manque > 0 ? vus.slice(0, SOURCES_MAX).filter((b) => b.slug) : AUCUN;
  // La clé porte TOUS les biens consultés, pas les seules sources : un bien consulté plus ancien
  // doit aussi sortir des similaires.
  const cle = sources.length > 0 ? `${manque}:${vus.map((b) => b.id).join(',')}` : '';

  useEffect(() => {
    if (cle === '') return;
    let annule = false;
    const limite = Math.min(CIBLE_DE_LA_RANGEE, manque);
    Promise.all(
      sources.map((bien) =>
        // Dans une promesse : `cheminApi` LÈVE sur un slug invalide, et la source doit alors
        // tomber seule, comme une réponse en erreur.
        Promise.resolve()
          .then(() =>
            apiFetch<{ data: PropertyListItem[] }>(
              cheminApi`/public/properties/${bien.slug}/similar${requete(`limit=${limite}`)}`,
            ),
          )
          .then((r) => (Array.isArray(r.data) ? r.data : []))
          .catch(() => [] as PropertyListItem[]),
      ),
    ).then((listes) => {
      if (!annule) setSimilaires({ cle, biens: fusionnerSimilaires(vus, listes, manque) });
    });
    return () => {
      annule = true;
    };
    // `cle` résume `vus`, `sources` et `manque` : une requête par ensemble de biens consultés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  // Une réponse d'un ensemble précédent n'est jamais rendue.
  return similaires.cle === cle && cle !== '' ? similaires.biens : AUCUN;
}
