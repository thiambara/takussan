---
id: TCK-806
title: "Baux, réservations, conversations : la photo du bien imbriqué est préchargée, plus relue ligne par ligne"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-20--nombre-réel-de-requêtes-sql-par-écran"
tags: [back, performance, n+1, pistes]
---

## Contexte

Réf : **P20.04** du fichier de pistes, `retenu · autonome` (A2).

`PropertyResource` rend `main_photo_url` par `getFirstMedia('photos')`, qui interroge `media`
pour chaque bien dont la relation n'est pas chargée. `LeaseController::index()`,
`BookingController::index()` et `ConversationController::index()` chargent le bien sans ses
médias : une requête `media` par ligne. La liste pro des biens les précharge déjà (TCK-595).

## Objectif utilisateur

Aucun changement visible : les trois listes rendent la même photo en un nombre de requêtes qui ne
croît plus avec la page.

## Contraintes strictes

- Réponse inchangée : `property.media` préchargé en entier, sans filtre de collection, pour que
  toute autre lecture de médias du bien reste juste.
- Aucun changement de périmètre ni de tri des trois listes.

## Delta à produire

- [x] `property.media` ajouté aux `with()` des trois `index()`.
- [x] `tests/Feature/Api/NestedPropertyPhotoQueryBudgetTest.php` : une liste par test.

## Critères d'acceptation

- [x] AC1 — `GET /api/leases?include=property,tenant` : autant de requêtes `media` pour 2 baux
      que pour 12, chaque bien ayant sa photo, et `main_photo_url` rendu.
- [x] AC2 — Même chose pour `GET /api/bookings?include=property,customer`.
- [x] AC3 — Même chose pour `GET /api/conversations`.

## Hors périmètre

- `isSuperAdmin()` relu par ligne dans les mêmes listes : P20.03.
- La garde générale contre la requête par ligne : P20.06.

## Notes d'implémentation

- **Mesure avant** : 2 → 12 requêtes `media` pour 2 → 12 lignes sur les baux et les réservations,
  3 → 13 sur les conversations (l'écart constant vient de `participants.media`).
- **Ablation** : les trois `with()` rendus à leur forme d'avant (`git apply -R`), les trois tests
  rougissent ; remis, verts.
- Le budget compte les seules requêtes sur `media`, pas le total : les autres lectures par ligne
  de ces listes relèvent d'autres pistes (P20.03), et un budget total rougirait pour elles.
