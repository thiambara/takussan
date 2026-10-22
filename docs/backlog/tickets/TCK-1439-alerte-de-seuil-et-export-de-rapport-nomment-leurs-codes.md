---
id: TCK-1439
title: "L'alerte de seuil et l'export de rapport nomment la métrique, la sévérité et le rapport"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-155--courriels-que-la-suite-ne-rend-jamais"
tags: [back, notifications, i18n, courriels, pistes]
---

## Contexte

Réf : **P155.04** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`ThresholdAlertTriggered::toMail()` passait `metric` et `severity` tels qu'ils sont rangés
(« [Takussan] Alerte KPI — occupancy_rate_percent », « (sévérité : critical) »), et
`ReportExportReadyNotification` le code du rapport (« Export du rapport « revenue » »).

## Décision du porteur (déléguée)

validé (délégué) — libellés de métrique, de sévérité et de rapport dans `lang/` (`fr`, `en` ; `wo` en français tel quel), repris des écrans d'origine : métriques de `dashboard.kpis.metrics`, sévérités de `dashboard.alerts.severities` (« Info », « Attention », « Critique »), rapports de `reporting.tabs` (« Croissance », « Revenu », « Cohortes », « Funnel »), lus par les `toMail()` de `ThresholdAlertTriggered` et `ReportExportReadyNotification` ; reste : le titre in-app `threshold_alert.title` de `toAppNotification`, avec l'angle 164

## Reste à faire

le titre in-app `threshold_alert.title` de `toAppNotification`, avec l'angle 164

## Contrat de données

- `notifications.threshold_alert_mail.metrics.<code>`, `.severities.<code>` et
  `notifications.report_export.reports.<code>`, en `fr` et `en` (libellés des écrans
  d'origine), en `wo` le texte français tel quel.
- Hypothèse : un code sans libellé (valeur rangée avant la liste actuelle) se rend tel quel.
- `toArray()` et `toAppNotification()` inchangés (codes conservés dans les données).

## Delta à produire

- [x] Clés dans `lang/{fr,en,wo}/notifications.php`.
- [x] `ThresholdAlertTriggered::toMail()` et `ReportExportReadyNotification::toMail()` les lisent.
- [x] `tests/Feature/Notifications/AlerteEtExportLibellesTest.php`.

## Critères d'acceptation

- [x] AC1 — six métriques × trois sévérités × trois langues : ni le code de métrique ni
  `: <sévérité>)` dans le sujet et le corps, et la clé existe dans la langue.
- [x] AC2 — quatre rapports × trois langues : le code n'apparaît pas, la clé existe.

## Notes d'implémentation

- Ablation : les deux notifications remises à l'origine → 2 rouges (code brut), remises → vert.
