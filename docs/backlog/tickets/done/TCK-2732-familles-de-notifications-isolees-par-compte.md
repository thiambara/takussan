---
id: TCK-2732
title: "Les familles de notifications ne mêlent jamais les notifications d'un autre compte : un test qui le dit"
status: done
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

- [x] Un test dans `NotificationFiltersTest` (ou une classe sœur) : A et B, mêmes familles.

## Critères d'acceptation

- [x] AC1 — `GET /api/notifications?filter[famille]=visite` par A ne rend que les notifications de A ;
      `meta.counts.par_famille` de A ne compte que les siennes et n'a pas la famille que seul B porte ;
      `meta.counts.a_traiter_non_lues` et `meta.unread` de A ignorent celles de B.
- [x] AC2 — Ablation (une, au premier plan, md5 restauré) : `where('user_id', …)` retiré de la liste de `index` → le test
      rougit.
- [x] AC3 — Ablation : `where('user_id', $userId)` retiré de `unreadCounts()` → le test rougit.

## Hors périmètre

- `markAsRead` / `markAsUnread` d'une notification d'un autre compte (déjà 403).

## Notes d'implémentation

**2026-11-11 — implémenté (back-3).**

- Test `NotificationFiltersTest::test_la_liste_et_les_compteurs_par_famille_ne_lisent_que_le_compte_appelant`.
  Décor : A porte une visite demandée (« à traiter », non lue) et deux mises en avant terminées (`bien`) ; B porte,
  non lues, trois visites demandées, quatre mises en avant terminées et une notification de type `payment` (famille
  `paiement`, que A n'a pas). Le test vérifie d'abord, **sous B**, que son décor rend bien
  `{bien:4, paiement:1, visite:3}` — sans ce contrôle, un décor qui n'aurait rien créé chez B passerait vert.
- AC1, sous A : `filter[famille]=visite` ne rend que la visite de A (`meta.total` 1) ; toutes les lignes de la liste
  appartiennent à A ; `par_famille` = `{bien:2, visite:1}`, sans `paiement` ; `a_traiter_non_lues` 1, `meta.unread`
  3, `meta.total` 3 ; `filter[a_traiter]=1` ne rend que la visite de A.
- Classe entière : 14 verts (83 assertions).
- AC2 — ablation, `AppNotification::where('user_id', $request->user()->id)` remplacé par `AppNotification::query()`
  dans `index` → **rouge**. md5 restauré (`56349937…`).
- AC3 — ablation, `->where('user_id', $userId)` retiré de `unreadCounts()` → **rouge**. md5 restauré.
- Aucun changement de code applicatif ni de spec.
