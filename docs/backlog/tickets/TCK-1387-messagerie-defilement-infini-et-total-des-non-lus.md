---
id: TCK-1387
title: "La liste de la messagerie défile au-delà de 30 fils, et la pastille lit le total des non-lus de l'API"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-135--listes-écrites-à-la-main-et-lecteurs-qui-ne-lisent-que-la-première-page"
tags: [api, front, messagerie, pagination, pistes]
---

## Contexte

Réf : **P135.02** du fichier de pistes, `validé` par le porteur (V7 accordé).

`useConversations` demande `page=1&per_page=30`, et ni la liste de la messagerie
(`ConversationList`) ni la pastille (`useUnreadCount`) ne demandent de page suivante : au-delà de
30 fils, les plus anciens ne sont atteignables par aucun geste, et la pastille n'additionne que
les `unread_count` de ces 30.

## Décision du porteur

> défilement infini de la liste (`useInfiniteQuery`, comme `ChatView`) et total des non-lus calculé par l'API (`meta.unread_total`), avec P136.01

## Objectif utilisateur

Tout utilisateur atteint chacun de ses fils en faisant défiler la liste, et la pastille compte ses
non-lus de tous ses fils, pas seulement des 30 plus récents.

## Contrat de données

`GET /api/conversations` rend, dans `meta`, après les quatre clés canoniques :
`unread_total` (entier) — les messages non lus du lecteur sur **toute** la liste demandée
(même portée que les lignes : fils actifs ou `archived=1`, `ConversationAccess::constrainListing`),
selon la règle de `unread_count`, **hors fils en sourdine** (`conversation_participants.is_muted`),
la règle que `useUnreadCount` appliquait jusqu'ici à la page.

## Delta à produire

- [x] API : `ConversationController::index` rend `meta.unread_total`, compté par une requête
  d'agrégat sur les messages (constante, quel que soit le nombre de fils).
- [x] Front : `useConversationsInfinite` (`conversations.ts`), clé `['conversations', 'list',
  'infinite']` — les invalidations existantes sur `['conversations', 'list']` la visent —, pages
  de 30, cadence de 10 s gardée ; `ConversationList` charge la page suivante quand une sentinelle
  de bas de liste paraît (`useIntersectionObserver`, comme `ChatView`), et ne rend qu'une fois un
  fil vu dans deux pages.
- [x] Front : `useUnreadCount` lit `meta.unread_total` au lieu d'additionner la page.

## Critères d'acceptation

- [x] AC1 — 35 fils, le plus ancien seul non lu : la page 1 ne le contient pas, `meta.total` = 35,
  `meta.unread_total` = 1 sur les deux pages, et la page 2 le contient.
- [x] AC2 — un fil en sourdine et un avis système ne comptent pas dans `meta.unread_total`.
- [x] AC3 — la liste rend les fils de toutes ses pages chargées, et demande la suivante quand la
  sentinelle paraît, seulement s'il en reste une.
- [x] AC4 — la pastille rend `meta.unread_total`, même quand la page ne porte aucun non-lu.

## Hors périmètre

- **P136.01** (angle 136, autre instance) : la cadence et l'étroitesse de la lecture de la pastille
  hors de `/app/messages`. Ce ticket pose `meta.unread_total`, que P136.01 lira ; la pastille garde
  ici sa lecture et sa cadence actuelles.
- La recherche dans la liste.

## Hypothèses

- `unread_total` suit la portée de la liste demandée (avec `archived=1`, les non-lus des fils
  archivés) : la pastille ne demande que les fils actifs, comme avant.

## Notes d'implémentation

- Le test place les fils à leur date par `travelTo` : `MessageObserver` pose `last_message_at` à
  l'horloge, et un message créé « maintenant » faisait remonter le plus ancien fil en tête.
- Ablation API : `['unread_total' => …]` retiré → AC1 et AC2 rouges ; filtre `is_muted` retiré →
  AC2 seul rouge ; correctif remis → vert.
- Ablation front : `useUnreadCount.ts` rendu à `HEAD` → 2 rouges sur 5 (AC4) ;
  `ConversationList.tsx` rendu à `HEAD` → 7 rouges sur 7 (il appelle `useConversations`, que le
  test ne fournit plus) ; correctifs remis → verts.
- `ProListQueryBudgetTest` (même nombre de requêtes pour 2 et 12 fils) reste vert : le total est
  une requête de plus, fixe.
