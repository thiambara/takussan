---
id: TCK-743
title: "Widget de messagerie : son corps n'est chargé que pour un utilisateur connecté"
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
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-33--poids-js-des-routes-publiques"
tags: [front, performance, bundle, messaging, pistes]
---

## Contexte

Réf : **P33.02** du fichier de pistes, `retenu · autonome` (classement A2).

`ChatWidget`, monté par le layout racine, importe statiquement `ConversationList`, `ChatView` et
`PropertyDraftChatView`, et `ChatView` importe react-hook-form et zod. Le widget rend `null` au
visiteur anonyme, mais son code est dans le JS initial de toutes les routes. Mesuré par
l'explorateur : une page légale passe de 450 à 322 Kio gzip sans lui.

## Objectif

Le visiteur anonyme ne télécharge rien de la messagerie, et aucun rendu ne change.

## Contrat de données

Aucun.

## Contraintes strictes

- **Hypothèse** : la garde ne porte que sur `user`. Les règles de visibilité par route restent
  dans le corps, pour que l'état du panneau (ouvert, fil choisi) survive comme avant à un passage
  par `/app/messages` ou `/auth/*`.
- **Hypothèse** : `next/dynamic` sans `ssr: false` : pour un connecté, le lanceur reste rendu
  côté serveur. Le guide de Next 16 (`lazy-loading.md`) dit qu'un composant dynamique rendu sous
  condition n'est chargé « que si la condition est remplie ».

## Delta à produire

- [x] `ChatWidget.tsx` devient `CorpsDuWidget.tsx` (même code, export renommé).
- [x] Nouveau `ChatWidget.tsx` : garde `user`, puis `CorpsDuWidget` par `next/dynamic`.
- [x] `ChatWidget.test.tsx` porte sur le corps ; `ChatWidget.garde.test.tsx` sur la garde.
- [x] Garde `src/app/__tests__/js-initial-du-layout-racine.test.ts` : le graphe client statique
      du layout racine n'atteint ni `zod`, ni `react-hook-form`, ni `@hookform/resolvers`.

## Critères d'acceptation

- [x] AC1 — Visiteur anonyme : `ChatWidget` ne rend rien et n'importe pas le corps.
- [x] AC2 — Utilisateur connecté : le corps est chargé et rendu.
- [x] AC3 — Le graphe client statique de `src/app/layout.tsx` n'atteint aucun des trois paquets.
- [x] AC4 — Les 23 tests existants du widget restent verts sur le corps.

## Hors périmètre

- La garde de build sur les `entryJSFiles` (P33.05, à valider : V5 et V9).
- zod sur les pages publiques par les modules de schémas (P33.03).

## Notes d'implémentation

- Avant correctif, le traceur rend quatre chemins, tous par `ChatWidget → ChatView` (zod par
  `lib/schemas/message.ts`, react-hook-form et `@hookform/resolvers` par `hooks/useApiForm.ts`) :
  le widget est le seul chemin statique du layout racine vers ces paquets.
- Ablation : `CorpsDuWidget` réimporté statiquement par `ChatWidget` → AC3 rouge (les quatre
  chemins, par le corps) et AC1 rouge (le corps est chargé pour l'anonyme). Correctif remis : verts.
- Le traceur porte un témoin (`ChatView` doit lui montrer react-hook-form) : sans lui, un traceur
  qui ne suivrait plus rien rendrait AC3 vert.
