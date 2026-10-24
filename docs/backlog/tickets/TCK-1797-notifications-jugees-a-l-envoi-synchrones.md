---
id: TCK-1797
title: "Garde : les notifications dont l'appelant juge l'envoi restent synchrones"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-179--trycatch-autour-dun-envoi-en-file-qui-promettent-un-repli"
tags: [api, notifications, file, garde, tests, pistes]
---

## Contexte

Réf : **P179.03** du fichier de pistes, `retenu · autonome` (A5).

Trois appelants entourent `notify()` d'un `try` et rendent quelque chose sur un échec :
`SendSavedSearchAlerts` et `SendFavoriteChangeAlerts` (la réservation), `LeaseSignatureService::sendCode()`
(la fenêtre de renvoi, plus `smsLeft()`). Ils ne tiennent que si leur notification est
synchrone. Rien ne le fige : `NotificationsEnFileTest` ne regarde que les classes `ShouldQueue`,
et les tests de repli tournent sous `QUEUE_CONNECTION=sync`, où une notification en file lève au
même endroit.

## Choix de l'implémenteur

La `Piste` propose une garde d'architecture qui liste les trois notifications, ou une assertion
dans chaque test de repli. **Retenue : la garde d'architecture**, un seul fichier qui porte le
motif de chaque entrée, et qui ne dépend ni de la base ni de la connexion de file.

## Objectif

Une de ces trois notifications passée en file rougit un test, qui dit ce que son appelant perd.

## Delta à produire

- [x] Test `tests/Unit/Architecture/NotificationsJugeesALEnvoiTest.php` : chaque classe existe, est
      une notification, et n'implémente pas `ShouldQueue` ; le message nomme ce que l'appelant rend.

## Critères d'acceptation

- [x] AC1 — Vert sur l'arbre courant.
- [x] AC2 — `ShouldQueue` ajouté à l'une quelconque des trois → rouge, avec son motif.

## Hors périmètre

- Les `catch` qui ne font que `report()` (P111.03, P123.04, P179.04) : ils ne perdent que la trace.
- `phpunit.xml` et sa connexion de file (P156.01).

## Notes d'implémentation

- Ablation : `ShouldQueue` ajouté tour à tour à `SavedSearchMatchesNotification`,
  `FavoriteChangesNotification` et `LeaseSignatureCodeNotification` → rouge chaque fois, sur la
  classe touchée ; fichiers remis → vert (9 assertions).
