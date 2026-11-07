---
id: TCK-2492
title: /app/messages s'hydrate sans écart — « Nouveau groupe » attend la fin de l'hydratation
status: done
phase: P2
family: front
estimate: S
wave: 83
created: 2026-11-07
updated: 2026-11-07
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, hydratation, bug]
---

## Objectif utilisateur

Ouvrir la messagerie ne fait plus jeter et reconstruire la page par React : la console reste
propre, et une vraie erreur d'hydratation ailleurs ne se noie plus dans celle-ci.

## Constat (mesuré)

Relevé en passant par la revue adverse de la coque « Atelier » (TCK-2490/2491), hors de son diff,
puis reproduit le 2026-11-07 sur `dev` (7288b3871), au navigateur par CDP : compte agent
(agence standard), `/app/messages`, 1280 px, sombre — **3 chargements sur 3** lèvent
`Hydration failed because the server rendered HTML didn't match the client`. L'arbre que React
rend en écart ne porte qu'un élément : le `<button data-testid="new-group-button-compact">` de
`MessagesPage`, présent au client, absent du HTML serveur.

**Cause.** `usePeutProposerUnGroupe()` lit `useMyProfiles()`, que le serveur ne charge jamais :
le HTML serveur est donc toujours sans bouton (décision fail-closed de TCK-645). La page est sous
la limite de chargement du segment `messages/` (`<Suspense name="messages/">` dans l'arbre de
l'écart) : elle s'hydrate après que la coque a mis `GET /api/me/profiles` en cache, et son
premier rendu client montrait déjà le bouton.

## Delta à produire

- `usePeutProposerUnGroupe()` (`src/components/messages/espaceActif.ts`) rend `false` tant que
  l'hydratation n'est pas finie — `useSyncExternalStore`, instantané serveur `false`, même patron
  que `useSurApple` (TCK-2482/2491). Une navigation douce, qui n'hydrate rien, montre le bouton
  dès le premier rendu.
- La règle de TCK-645 ne change pas : pas de bouton en agence `individual`, ni tant que l'espace
  est inconnu.

## Critères d'acceptation

- [x] **AC1** — Test d'hydratation (`MessagesPage.test.tsx`) : HTML serveur rendu sans profils,
  hydraté avec un profil d'agence standard en cache → aucune erreur récupérable, aucune trace
  « hydrat » en console, et les deux boutons « Nouveau groupe » présents après l'hydratation.
  **Rouge sans le correctif** (1 erreur récupérée), vert avec.
- [x] **AC2** — Mesure au navigateur sur le même cas : agent, 1280 sombre, 3 chargements sur 3,
  plus 390 clair : **0 erreur**, bouton compact et bouton de la liste présents.
- [x] **AC3** — Les tests TCK-645 du masquage (agence individuelle, profils non chargés, kind
  illisible, compte sans profil) restent verts : 112 tests de `src/components/messages/` verts.

## Hors périmètre

- Les autres lecteurs de `useMyProfiles()` au rendu : aucun écart n'y a été mesuré (`/app` sous
  trois personas, `/app/visits`, revue de la coque).

## Notes d'implémentation

- Banc de mesure : jetons du banc de la revue « Atelier » réémis puis nettoyés (`banc.php
  nettoyer` : 5 jetons, 38 `welcome_views`, différences restantes `[]`).
- La suite front entière est jouée par la CI de la PR.
