---
id: TCK-745
title: "Pied de page public en composant serveur"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-33--poids-js-des-routes-publiques"
tags: [front, performance, bundle, rsc, pistes]
---

## Contexte

Réf : **P33.06** du fichier de pistes, `retenu · autonome` (classement A2). Seule la partie
`Footer` tient comme correctif (dernière ligne `Mesure` de l'entrée) ; la mesure CSS est à refaire
après P33.01, le point `@base-ui/react` ne demande rien.

`src/components/home/Footer.tsx` est `'use client'` pour deux `useTranslations` et
`new Date().getFullYear()`, sans état, effet ni gestionnaire. Treize importeurs serveur (fiches
bien, agence, agent et leurs `not-found`, réservation, paiement, partage, alertes, pages légales,
index des profils) font entrer son code dans leur JS client.

## Objectif

Une page serveur qui monte le pied de page ne télécharge plus son code.

## Contrat de données

Aucun. Le rendu est le même.

## Contraintes strictes

- **Hypothèse** : `new Date().getFullYear()` passe côté serveur sans risque de date figée : le
  layout racine lit `cookies()`, toutes les pages sont rendues à la requête, et `next.config.ts`
  n'active pas `cacheComponents`.
- **Hypothèse** : `src/i18n/namespaces.json` ne bouge pas. `check-i18n-namespaces.mjs` reste
  conforme sans régénération : son dérivateur ne distingue pas client et serveur, et
  `HomepageDiscovery`, client, lit encore l'espace `footer`.

## Delta à produire

- [x] Retirer `'use client'` de `Footer.tsx`.
- [x] `src/test/graphe-client.ts` : `modulesDuGrapheClient()`.
- [x] Garde `src/components/home/__tests__/Footer.serveur.test.ts`.

## Critères d'acceptation

- [x] AC1 — Pour chaque importeur serveur de `Footer`, `Footer.tsx` est hors du graphe client.
- [x] AC2 — Témoin : il est dans celui de `HomepageDiscovery`, importeur client.
- [x] AC3 — Les tests existants du pied de page restent verts.

## Reste à faire

- Refaire la mesure du CSS initial des pages publiques après P33.01 (`entryCSSFiles` d'un build).

## Hors périmètre

- Les quatre importeurs client (`HomepageDiscovery`, `PropertiesDiscoveryPage`,
  `PublicFavoritesPage`, `CompareClient`), qui le gardent dans leur JS.
- La mesure du CSS initial, et `@base-ui/react` (autres points de P33.06).

## Notes d'implémentation

- Avant correctif : 13 rouges, un par importeur serveur. Ablation : `'use client'` remis →
  les 13 mêmes rouges ; retiré : 16/16 verts, et les 22 fichiers de `components/home/__tests__`
  (155 tests) verts.
- Aucun importeur client n'y ramène le pied de page sur ces 13 entrées : il suffisait de la
  directive.
