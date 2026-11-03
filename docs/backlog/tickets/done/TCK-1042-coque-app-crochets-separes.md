---
id: TCK-1042
title: "La coque de /app importe ses deux crochets de requêtes par leur propre fichier"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-70--poids-js-initial-des-écrans-de-app"
tags: [front, performance, bundle, pistes]
---

## Contexte

Réf : **P70.07** du fichier de pistes, `retenu · autonome` (A2 pour la scission des deux modules :
le crochet de la coque dans son propre fichier, réexporté par l'ancien, sans changement de
résultat).

La coque de `/app` monte `useTenantWelcomeOnce` (`useActiveLeaseSummaries`) et `useUnreadCount`
(`useConversations`). Elle importe donc `lib/queries/leases.ts` et `lib/queries/conversations.ts`,
deux modules `'use client'` de 42 et 37 exports, et le mesureur a établi que le bundler n'élague
pas leurs exports inutilisés (chaînes `generate-schedule`, `signature/otp`… dans le JS de
`/app/overview`).

## Objectif

Le graphe client de la coque de `/app` n'atteint plus `leases.ts` ni `conversations.ts`.

## Contrat de données

Aucun. Clés de requête, champs et options des deux crochets inchangés.

## Contraintes strictes

- Les anciens modules **réexportent** ce qui en sort : aucun autre importeur ne change.
- **Hypothèse** : les nouveaux fichiers suivent le nommage anglais du dossier
  (`leases-active-summaries.ts`, `conversations-list.ts`).
- **Hypothèse** : `TenantOnboardingChecklistWidget` (accueil du locataire) est repointé avec les
  deux importeurs de la coque, puisqu'il lit le même crochet.

## Delta à produire

- [x] `src/lib/queries/leases-active-summaries.ts` : `ActiveLeaseSummary`, `useActiveLeaseSummaries`.
- [x] `src/lib/queries/conversations-list.ts` : `CONVERSATION_LIST_FIELDS`,
      `CONVERSATION_PROPERTY_FIELDS`, `UseConversationsParams`, `useConversations`.
- [x] `useTenantWelcomeOnce`, `TenantOnboardingChecklistWidget`, `useUnreadCount` importent les
      nouveaux fichiers ; le mock de `useUnreadCount.test.tsx` suit.
- [x] Garde `src/app/(dashboard)/__tests__/coque-sans-modules-de-requetes-entiers.test.ts`.

## Critères d'acceptation

- [x] AC1 — Le graphe client de `(dashboard)/layout.tsx` et `(dashboard)/app/layout.tsx` n'atteint
      ni `lib/queries/leases.ts` ni `lib/queries/conversations.ts`.
- [x] AC2 — Les tests des lecteurs des deux modules restent verts.

## Hors périmètre

- Les dictionnaires imbriqués de `/app` (seconde moitié de la piste) : la piste demande d'abord une
  mesure de la charge RSC d'un document servi, sous ADR-0022.
- Le poids mesuré après build (le gain attendu est de l'ordre de 5 Kio gzip, parts du mesureur).

## Notes d'implémentation

- Avant correctif : `app/layout.tsx` atteint les deux modules (1 rouge sur 2) ; `(dashboard)/layout.tsx`
  ne les atteint déjà pas, son cas garde la régression.
- Ablation : les trois importeurs rendus à `HEAD` → le même rouge ; correctif remis → vert.
- 50 fichiers de test des lecteurs (coque, messagerie, baux, accueil locataire) : 432/432.
