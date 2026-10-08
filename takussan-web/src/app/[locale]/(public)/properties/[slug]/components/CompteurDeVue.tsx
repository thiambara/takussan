'use client';

import { useEffect, useRef } from 'react';

import { urlApiPublique } from '@/lib/api';

interface CompteurDeVueProps {
  readonly slug: string;
}

/**
 * TCK-598 (ADR-0052 §1) — compte UNE vue de la fiche, depuis le navigateur, directement vers l'API.
 *
 * La lecture de la fiche est en cache de données côté serveur : elle ne peut plus compter. Le
 * navigateur appelle `POST /api/public/properties/{slug}/view`, et l'API y voit l'IP du visiteur par
 * sa propre chaîne de mandataires — aucun transit par le serveur Next, aucun en-tête à transmettre.
 *
 * - **Sans bloquer la page** : après l'hydratation, `keepalive`, réponse ignorée (204 toujours).
 * - **Une fois par affichage** : la garde par `ref` résiste au double montage du mode strict et à
 *   tout nouveau rendu du composant ; une nouvelle navigation vers la fiche est une nouvelle vue
 *   (l'API déduplique par bien et par IP, trois par heure).
 * - **Sans identifiants** (`credentials: 'omit'`) et sans corps : une requête simple, sans
 *   pré-vérification CORS, que rien ne rattache au compte du visiteur.
 */
export function CompteurDeVue({ slug }: CompteurDeVueProps) {
  const compte = useRef<string | null>(null);

  useEffect(() => {
    if (compte.current === slug) return;
    compte.current = slug;

    fetch(urlApiPublique(`/public/properties/${encodeURIComponent(slug)}/view`), {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
      // Un compteur n'a rien à dire au visiteur : une vue perdue n'est pas une panne.
    });
  }, [slug]);

  return null;
}
