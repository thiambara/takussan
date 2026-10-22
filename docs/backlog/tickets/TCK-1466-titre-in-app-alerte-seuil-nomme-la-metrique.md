---
id: TCK-1466
title: "Le titre in-app de l'alerte de seuil nomme la métrique, plus son code"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1439]
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-164--paramètres-text-des-notifications-codées-qui-portent-un-code"
tags: [back, notifications, i18n, pistes]
---

## Contexte

Réf : **P164.03** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`ThresholdAlertTriggered::toAppNotification()` rangeait le titre « Alerte KPI — occupancy_rate_percent » :
la classe n'a pas de code, le titre est stocké tel quel dans `app_notifications` et la cloche le lit
tel quel. P155.04 (TCK-1439) a posé les libellés de métrique pour le seul courriel.

## Décision du porteur (déléguée)

validé (délégué) — le titre in-app de `toAppNotification` lit pour `:metric` le libellé `notifications.threshold_alert_mail.metrics.<code>` que pose P155.04, une fois P155.04 fusionnée sur `pre-dev` (repli sur le code quand la clé manque, comme `toMail()`) ; reste : le passage de l'alerte de seuil à un code du catalogue, avec le reste de P75.05, au porteur

## Reste à faire

le passage de l'alerte de seuil à un code du catalogue, avec le reste de P75.05, au porteur

## Contrat de données

- Aucune clé neuve : le titre lit `notifications.threshold_alert_mail.metrics.<code>` (TCK-1439).
- `toArray()` inchangé : `data.metric` garde le code.
- Les lignes déjà écrites gardent leur titre (rangé, pas rendu à la lecture).

## Delta à produire

- [x] `ThresholdAlertTriggered::toAppNotification()` passe la métrique par `libelle()`.
- [x] `AlerteEtExportLibellesTest::test_le_titre_in_app_de_l_alerte_nomme_la_metrique`.

## Critères d'acceptation

- [x] AC1 — six métriques × trois langues : le titre ne contient pas le code et contient le libellé.
- [x] AC2 — une métrique sans libellé se rend telle quelle (« Alerte KPI — ancienne_metrique »).

## Hors périmètre

- Le portage de l'alerte de seuil au catalogue des codes (reste ci-dessus).

## Notes d'implémentation

- Ablation : `ThresholdAlertTriggered.php` remis à `pre-dev` → 1 rouge (code brut dans le titre), remis → vert.
