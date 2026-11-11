---
id: TCK-2732
title: "Les familles de notifications ne mêlent jamais les notifications d'un autre compte : un test qui le dit"
status: todo
phase: P3
family: technique
estimate: S
wave: 87
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2633]
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
tags: [technique, notifications, tests, isolation, ablation, suivi-lot-1]
---

## Objectif utilisateur

Personne ne lit dans sa liste ni dans ses compteurs par famille une notification destinée à un autre compte, et un
changement qui le permettrait rougit la suite.

## Contexte

Suivi de TCK-2633. `NotificationController::index` borne la liste par `where('user_id', <appelant>)` et
`unreadCounts()` borne les compteurs (`meta.unread`, `meta.counts.par_famille`, `a_traiter_non_lues`) par
`where('user_id', $userId)`. `tests/Feature/Notifications/NotificationFiltersTest.php` éprouve `filter[famille]`,
`filter[a_traiter]` et les compteurs sur les notifications **d'un seul compte** : l'isolation n'est gardée
qu'indirectement.

## Décision

**Aucune décision du porteur requise** : test d'une propriété existante.

## Contrat de données

Aucun changement.

## Contraintes strictes (métier)

- Le décor met, pour un compte B, des notifications **de la même famille** et non lues que celles de A (une visite
  demandée, une « à traiter »), plus une famille que A n'a pas.

## Delta à produire

- [ ] Un test dans `NotificationFiltersTest` (ou une classe sœur) : A et B, mêmes familles.

## Critères d'acceptation

- [ ] AC1 — `GET /api/notifications?filter[famille]=visite` par A ne rend que les notifications de A ;
      `meta.counts.par_famille` de A ne compte que les siennes et n'a pas la famille que seul B porte ;
      `meta.counts.a_traiter_non_lues` et `meta.unread` de A ignorent celles de B.
- [ ] AC2 — Ablation (une, au premier plan, md5 restauré) : `where('user_id', …)` retiré de la liste de `index` → le test
      rougit.
- [ ] AC3 — Ablation : `where('user_id', $userId)` retiré de `unreadCounts()` → le test rougit.

## Hors périmètre

- `markAsRead` / `markAsUnread` d'une notification d'un autre compte (déjà 403).

## Notes d'implémentation

_(à remplir par implementing-specs)_
