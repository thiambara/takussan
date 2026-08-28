/**
 * Ce que l'accueil demande à `GET /api/public/properties/discovery` — **neutre, donc lisible des
 * deux côtés de la frontière** (TCK-432).
 *
 * ⚠️ Ce module minuscule existe pour une raison précise : `useHomepageDiscovery.ts` porte
 * `'use client'`, et **tout** ce qu'un module client exporte devient une *référence client* — une
 * constante y comprise. Un composant serveur qui en importerait `HOMEPAGE_DISCOVERY_PER_ROW`
 * n'obtiendrait pas le nombre 12 mais un proxy qui lève à la lecture. Recopier la valeur dans le
 * module serveur serait la réponse facile, et ce dépôt paie ailleurs, régulièrement, le prix des
 * valeurs recopiées : elles sont justes le jour où on les écrit.
 */

/**
 * Une valeur pour les quatre rangées — l'endpoint la plafonne à 20 (422 au-delà).
 *
 * Le rendu serveur et la relance client demandent le MÊME nombre. Deux valeurs différentes ne
 * casseraient rien de visible : elles feraient simplement que la relance, quand elle a lieu,
 * remplace douze cartes par huit sous les yeux du visiteur, sur les trois rangées qui n'ont
 * pourtant aucune raison de changer.
 */
export const HOMEPAGE_DISCOVERY_PER_ROW = 12;
