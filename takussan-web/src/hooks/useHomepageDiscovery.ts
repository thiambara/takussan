'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { HOMEPAGE_DISCOVERY_PER_ROW } from '@/lib/rangees-de-l-accueil';
import type { HomepageDiscoveryData, HomepageDiscoveryResponse } from '@/types/property';

/**
 * TCK-247 — the four homepage rows in one request.
 *
 * Replaces four `useProperties` calls plus a client-side dedup pass. Dropping
 * crossover ids client-side is not the same as refilling: a row that lost half
 * its cards to the row above simply rendered short. The server picks from a
 * wider candidate pool instead, so every row comes back full.
 *
 * `apiFetch` (not `apiRequest`) because this is a public endpoint — it prepends
 * `/api` itself, so the path here must NOT carry it. Same primitive as the
 * homepage's previous calls.
 *
 * The endpoint takes no sparse fieldsets: it is not built on
 * `spatie/laravel-query-builder`, and `HomepageDiscoveryRequest` accepts
 * exactly two params, `near_city` and `per_row`. Items already come back in the
 * light (list) shape of `PropertyResource`.
 */

/**
 * Ré-export — la constante vit dans `lib/rangees-de-l-accueil.ts` depuis TCK-432.
 *
 * Ce fichier porte `'use client'`, donc tout ce qu'il exporte est une *référence client* : le
 * module serveur qui prépare les rangées ne peut pas lire la valeur ici. Elle a déménagé dans un
 * module neutre plutôt que d'être recopiée des deux côtés.
 */
export { HOMEPAGE_DISCOVERY_PER_ROW };

export interface UseHomepageDiscoveryParams {
  /**
   * The city guessed for the visitor. **Leave undefined when unknown** rather
   * than defaulting to Dakar here: the backend tells "unknown" and "a city we
   * have nothing for" apart, and only the second one retitles the row.
   */
  readonly nearCity?: string;
  readonly perRow?: number;
  /** Hold the request until the caller knows whether it has a city to send. */
  readonly enabled?: boolean;
  /**
   * Les rangées que le SERVEUR a déjà rendues, sans ville — TCK-432.
   *
   * Elles sont l'état INITIAL, pas un repli : le hook démarre `loading: false` avec elles, si bien
   * que le premier commit d'hydratation rend exactement ce que le HTML portait déjà. Les rendre
   * dans un effet ferait rendre un premier commit en squelette par-dessus des biens visibles —
   * le clignotement que TCK-432 interdit.
   *
   * `null` (panne serveur, ou appelant qui n'en fournit pas) rétablit à l'identique le
   * comportement d'avant TCK-432 : squelette, appel, résultat ou erreur.
   */
  readonly donneesInitiales?: HomepageDiscoveryData | null;
}

export interface UseHomepageDiscoveryResult {
  readonly rows: HomepageDiscoveryData | null;
  readonly loading: boolean;
  /**
   * A flag, not a sentence: the label belongs to the front, through next-intl
   * (principe non négociable n°5).
   */
  readonly failed: boolean;
}

export function useHomepageDiscovery({
  nearCity,
  perRow = HOMEPAGE_DISCOVERY_PER_ROW,
  enabled = true,
  donneesInitiales = null,
}: UseHomepageDiscoveryParams = {}): UseHomepageDiscoveryResult {
  const [state, setState] = useState<UseHomepageDiscoveryResult>({
    rows: donneesInitiales,
    // ⚠ `loading` suit la GRAINE, pas `enabled`. Avec des rangées semées, il n'y a rien à
    // attendre : la page est complète dès le premier commit. Sans elles, tout est à faire.
    loading: donneesInitiales === null,
    failed: false,
  });

  /**
   * TCK-432 — ce que le serveur a déjà demandé : les rangées SANS ville.
   *
   * Le rendu serveur ne peut pas attendre ipapi.co ; il demande donc sans `near_city`, et le
   * back-end sert son marché de référence. Relancer le même appel après hydratation
   * redemanderait à l'identique ce qui est déjà à l'écran — un aller-retour pour rien, sur un
   * marché où la bande passante mobile est la contrainte dimensionnante.
   *
   * La relance n'a lieu que lorsqu'il y a **quelque chose de neuf à demander**, c'est-à-dire une
   * ville réellement devinée. C'est aussi ce qui préserve l'invariant d'un seul appel de
   * TCK-247 : le total reste UN appel (serveur), ou DEUX quand la personnalisation a lieu — et
   * le second, lui, rapporte une réponse différente.
   *
   * `useRef` : la consommation ne doit pas provoquer de rendu, et elle doit être visible du
   * prochain passage de l'effet.
   */
  const rangeesSansVilleDejaServies = useRef(donneesInitiales !== null);

  useEffect(() => {
    if (!enabled) return;

    if (rangeesSansVilleDejaServies.current) {
      // Consommée dans tous les cas : elle ne vaut que pour le premier passage. Sans ça, un
      // visiteur qui perdrait sa ville (`nearCity` repassant à `undefined`) resterait bloqué
      // sur les rangées semées alors que l'écran, lui, aurait changé de titre.
      rangeesSansVilleDejaServies.current = false;
      if (!nearCity) return;
    }

    let cancelled = false;

    // No `setState({ loading: true })` here, and that is deliberate twice over:
    // it would be a synchronous state update in an effect body (which
    // `react-hooks/set-state-in-effect` rejects), and on a refetch it would
    // blank rows that are already on screen — the flicker AC2 exists to
    // prevent. Stale rows stay up until the new payload lands.
    const qs = new URLSearchParams({ per_row: String(perRow) });
    if (nearCity) qs.set('near_city', nearCity);

    apiFetch<HomepageDiscoveryResponse>(`/public/properties/discovery?${qs.toString()}`)
      .then((res) => {
        if (!cancelled) setState({ rows: res.data, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ rows: null, loading: false, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [nearCity, perRow, enabled]);

  return state;
}
