---
id: TCK-1122
title: "Le bouton du courriel d'alerte de seuil mène au tableau de bord du front, plus à l'hôte de l'API"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [back, notifications, dashboard, pistes]
---

## Contexte

Réf : **P97.01** du fichier de pistes, `retenu · autonome` (A1 : le libellé « Voir le tableau de
bord » et les autres `toMail()` écrivent déjà le contrat).

`ThresholdAlertTriggered::toMail()` construisait son bouton par `url('/app/overview')`. La
notification part de `dashboard:check-alerts`, hors requête : `url()` y prend `APP_URL`, l'hôte de
l'API, qui n'a aucune route `app/overview`. Le clic rendait le 404 de Laravel.

## Objectif utilisateur

L'admin d'agence qui clique le bouton du courriel d'alerte arrive sur le tableau de bord de la
console.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- Le chemin reste `/app/overview` ; seul l'hôte change, sur la forme des autres classes :
  `rtrim(config('app.frontend_url') ?: config('app.url'), '/')`.

## Delta à produire

- [x] `app/Notifications/ThresholdAlertTriggered.php` : base `app.frontend_url`.
- [x] `tests/Feature/Dashboard/ThresholdAlertTest.php::test_mail_action_targets_the_front_dashboard`.

## Critères d'acceptation

- [x] AC1 — avec `app.frontend_url` = `https://front.exemple.test/`, `actionUrl` vaut
      `https://front.exemple.test/app/overview`.

## Hors périmètre

- Viser `/app/overview/alerts` (option laissée ouverte par la piste, non tranchée).
- La fonction commune de construction des liens du front et la garde de tous les `toMail()` : P97.05.

## Notes d'implémentation

- Ablation : `ThresholdAlertTriggered.php` rendu à `HEAD` → 1 rouge (`http://localhost/app/overview`) ;
  correctif remis → 13/13.
