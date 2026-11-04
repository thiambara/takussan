---
id: TCK-1399
title: "Huit écritures du journal posent leur `event`, lisible et filtrable par l'export"
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
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-139--colonnes-des-exports-quaucun-chemin-nécrit-ou-qui-lisent-une-clé-nommée-autrement"
tags: [back, audit, export, pistes]
---

## Objectif utilisateur

Dans l'export du journal, la colonne `event` n'est plus vide pour l'absence déclarée, les étapes
d'accueil du locataire, l'expiration d'une réservation et la création ou la révocation d'une
délégation, et `filter[event]` les retient.

## Contexte

Réf : **P139.05** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé). `docs/models-spec.md` (journal d'activité) écrit qu'un acte hors modèle s'écrit par
`activity('…')->event(…)…->log(…)`.

Mesuré avant correctif (gardes ci-dessous, rouges sur `e72d2ad69`) : les huit écritures rendent
`event = null`.

## Décision du porteur (déléguée)

> poser `->event()` sur les neuf écritures, avec le code de leur `log()` (`absence.declared`, `tenant_checklist_created`, `tenant_checklist_item_completed`, `tenant_checklist_completed`, `tenant_welcomed`, `booking_expired`), sauf dans `RoleDelegationService`, où l'on suit les deux sœurs du fichier : `created` et `revoked` ; aucune réécriture des lignes déjà en base ; test : chaque écriture rend sa valeur d'`event` et `filter[event]` de l'export la retient ; reste : `GenerateReportExport` (bornes `starts_at`/`ends_at` et format), qui suit le reste de P78.04, au porteur

## Hypothèses (mode sans humain)

- Le constat dit « neuf écritures » mais en énumère huit (`AgentAbsenceService` 1,
  `TenantOnboardingService` 3, `SendTenantWelcomeNotification` 1, `BookingExpirationService` 1,
  `RoleDelegationService` 2) ; la décision nomme les mêmes huit. Ce sont elles qui sont traitées.

## Delta à produire

- [x] `->event('<code du log>')` sur les six écritures hors `RoleDelegationService` ;
  `->event('created')` et `->event('revoked')` dans `RoleDelegationService`.
- [x] Gardes dans `AgentAbsenceTest` (dont `filter[event]` de l'export),
  `RoleDelegationActivityWindowTest`, `TenantOnboardingChecklistTest`,
  `TenantWelcomeNotificationTest`, `ExpireBookingsTest`.

## Critères d'acceptation

- [x] AC1 — Chaque écriture rend sa valeur d'`event`.
- [x] AC2 — L'export d'agence filtré par `filter[event]=absence.declared` rend la ligne.
- [x] AC3 — Aucune ligne déjà en base n'est réécrite (pas de migration).

## Reste à faire

> `GenerateReportExport` (bornes `starts_at`/`ends_at` et format), qui suit le reste de P78.04, au porteur

## Notes d'implémentation

- Ablation : les cinq fichiers de `app/` rendus à leur état antérieur → `AgentAbsenceTest`
  rouge (`event` nul) ; remis → vert. Avant correctif, les cinq classes de garde étaient rouges.
