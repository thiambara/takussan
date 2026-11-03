---
id: TCK-1389
title: "La liste des conversations est départagée par id, et le fetcher sans appelant de l'historique des prix est retiré"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1387]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-135--listes-écrites-à-la-main-et-lecteurs-qui-ne-lisent-que-la-première-page"
tags: [api, front, messagerie, code-mort, pistes]
---

## Contexte

Réf : **P135.06** du fichier de pistes, `retenu · autonome` (A3).

Trois petits défauts des listes écrites à la main :

1. `useConversations` envoyait `filter[status]` et `filter[property_id]`, que l'API ne lit pas ;
2. `ConversationController::index` trie `last_message_at DESC` sans départage : deux fils de même
   horodatage peuvent changer de page d'une requête à l'autre, ce que le défilement infini de
   TCK-1387 rend visible (un fil répété, un autre jamais vu) ;
3. `fetchPropertyPriceHistory` n'a aucun appelant hors de sa réexportation.

## Objectif utilisateur

La liste paginée des conversations rend chaque fil une fois et une seule, quel que soit
l'horodatage des fils ; le front ne porte plus de fetcher mort.

## Delta à produire

- [x] (1) Déjà fait par TCK-1286 (P150.05) : `UseConversationsParams` ne porte plus que `page`
  et `per_page`. Rien à faire.
- [x] (2) `orderByDesc('conversations.id')` après `orderByDesc('last_message_at')`.
- [x] (3) `fetchPropertyPriceHistory` retiré de `properties-server.ts` et de la réexportation de
  `properties.ts`.

## Critères d'acceptation

- [x] AC1 — trois fils de même `last_message_at`, lus par pages d'un : chacun paraît une fois, du
  plus récent `id` au plus ancien.
- [x] AC2 — `grep -rn fetchPropertyPriceHistory takussan-web/src` ne rend rien ; `tsc --noEmit`
  propre.

## Hors périmètre

- La route `GET /api/properties/{p}/price-history`, qui reste à P13.08.
- Un `last_message_at` nul (groupe sans message de `GroupConversationService::create`) passe en tête
  sous `DESC` : la piste ne le confie pas.

## Notes d'implémentation

- Ablation : départage retiré → AC1 rouge (ordre rendu 39, 40, 41 au lieu de 41, 40, 39) ;
  remis → vert.
