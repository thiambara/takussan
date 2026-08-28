import { cache } from 'react';

import { apiFetch } from '@/lib/api';
import { HOMEPAGE_DISCOVERY_PER_ROW } from '@/lib/rangees-de-l-accueil';
import type { HomepageDiscoveryData, HomepageDiscoveryResponse } from '@/types/property';

/**
 * Les quatre rangées de l'accueil, **récupérées par le serveur** — TCK-432.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI IL N'Y A PAS DE VILLE ICI
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La rangée « Près de toi » est personnalisée par une ville devinée côté CLIENT
 * (`UserLocationProvider`, qui interroge ipapi.co avec une échéance de 1200 ms). **Le rendu serveur
 * ne peut pas l'attendre** — ni la deviner : la seule chose qu'il pourrait lire est l'adresse IP
 * de la requête, ce qui est un autre mécanisme, un autre fournisseur, et une autre décision.
 *
 * D'où la forme retenue, et elle tient en une phrase : **le serveur demande SANS ville**. Le
 * back-end distingue déjà « on ne sait pas où est le visiteur » de « le visiteur est à Dakar » —
 * `requested_city: null` contre `requested_city: 'Dakar'` — et sert dans le premier cas son marché
 * de référence, avec `fallback: false`. Le HTML initial porte donc une rangée **honnête** : elle
 * dit « À découvrir à Dakar », ce qui est vrai des biens qu'elle contient, et elle ne prétend pas
 * être près d'un visiteur dont on ignore la position.
 *
 * La personnalisation arrive ensuite, si elle arrive : cf. `useHomepageDiscovery`, qui ne relance
 * l'appel que lorsqu'une ville a réellement été devinée, et qui ne repasse jamais par l'état de
 * squelette pour le faire.
 *
 * ⚠️ **`nearCity` reste un paramètre.** Il n'est pas passé par la page d'accueil aujourd'hui, mais
 * le supprimer figerait la signature sur l'unique usage du jour : le jour où la ville viendrait
 * d'un cookie posé par le client (donc lisible en RSC), c'est exactement ce paramètre qu'on
 * remplirait. Il entre aussi dans la clef de mémoïsation, ce qui est la seule façon correcte de
 * l'exposer.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ **La locale est un ARGUMENT, pas une déduction** — même raison que `getProperty` : `apiFetch`
 * la devine sinon depuis `document.cookie`, qui n'existe pas en rendu serveur, et rend `undefined`
 * **en silence**. Les libellés d'énumération (`type_label`, `contract_type_label`) sortiraient
 * alors dans `APP_LOCALE`, c'est-à-dire dans la langue du serveur.
 *
 * ⚠️ **Aucun `fields[properties]`** : `discovery()` n'est pas bâti sur
 * `spatie/laravel-query-builder` et n'accepte que `near_city` et `per_row`. Le passer est inerte —
 * mesuré, cf. le docblock de `lib/recherche-publique.ts`.
 *
 * **Rend `null` en cas de panne, et c'est un contrat, pas un repli paresseux.** L'appelant est une
 * page publique : elle doit rester servable si l'API tombe. `null` signifie « le serveur n'a rien
 * à semer », et le composant client reprend alors exactement le comportement d'avant TCK-432 —
 * squelette, puis appel réseau, puis message d'erreur traduit s'il échoue à son tour. Aucun chemin
 * de code n'est perdu ; c'est le chemin nominal qui en gagne un.
 */
export const decouverteDeLAccueil = cache(
  async (locale: string, nearCity?: string): Promise<HomepageDiscoveryData | null> => {
    const qs = new URLSearchParams({ per_row: String(HOMEPAGE_DISCOVERY_PER_ROW) });
    if (nearCity) qs.set('near_city', nearCity);

    try {
      const res = await apiFetch<HomepageDiscoveryResponse>(
        `/public/properties/discovery?${qs.toString()}`,
        undefined,
        { locale },
      );
      return res.data;
    } catch (err: unknown) {
      // Au journal SERVEUR : utile au développeur, jamais au visiteur (principe non négociable n°5).
      console.error('[accueil] découverte indisponible : ', err);
      return null;
    }
  },
);
