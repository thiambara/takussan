---
id: TCK-1991
title: "Une intervention passée en urgente après coup reçoit l'alerte d'urgence, et son escalade attend 30 minutes"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-intervention-passée-en-urgente-après-coup-déclenche-aussitôt-lescalade-qui-dit--non-traitée-depuis-plus-de-30-minutes--sans-lalerte-durgence-qui-la-précède"
tags: [api, maintenance, notifications, scheduler, pistes]
---

## Contexte

Réf : **P169.03** du fichier de pistes, `validé` (V7 accordé).

`EscalateUrgentMaintenanceJob` comptait ses 30 minutes depuis `created_at`. Une demande ancienne
passée en `urgent` par le `PATCH` était escaladée au passage suivant du job (« non traitée depuis
plus de 30 minutes »), sans que l'alerte d'urgence, envoyée par `store` seulement, soit partie.
`metadata.escalated_at` n'était jamais retiré : une demande ramenée à `high` puis remise à `urgent`
ne s'escaladait plus. Le comportement attendu s'appuie sur TCK-096 (AC7 : escalade d'une demande
« restée » non traitée plus de 30 minutes).

## Décision du porteur

> validé — validation du porteur (2026-10-23) : la recommandation du délégué entière : `metadata.urgent_since` posé dans `store` et `update`, les 30 minutes courent depuis lui, `urgent_since` et `escalated_at` retirés quand la priorité quitte `urgent`, alerte au passage en urgent ; wo recopie le français

La recommandation du délégué (fichier de pistes, Mesure du 2026-10-22) : repli sur `created_at` pour
les demandes déjà urgentes ; alerte `UrgentMaintenanceCreatedNotification` à l'assigné et à l'admin
principal au passage en urgent par `update`, avec une phrase d'introduction propre (« Une demande de
maintenance est passée en URGENTE pour le bien. », `fr` et `en`, `wo` = le français).

## Objectif utilisateur

Une intervention devenue urgente prévient aussitôt l'assigné et l'admin principal, et n'est
escaladée que si elle reste non traitée 30 minutes après son passage en urgent.

## Delta à produire

- [x] `MaintenanceRequest::URGENT_SINCE` et `::ESCALATED_AT` (clés de `metadata`, sans migration).
- [x] `MaintenanceRequestController::store` pose `urgent_since` sur une demande créée urgente.
- [x] `MaintenanceRequestController::update` : au passage en urgent, pose `urgent_since` et envoie
  l'alerte (après l'assignation éventuelle du même `PATCH`) ; en quittant `urgent`, retire
  `urgent_since` et `escalated_at`.
- [x] `EscalateUrgentMaintenanceJob` : 30 minutes depuis `urgent_since`, repli sur `created_at`.
- [x] `UrgentMaintenanceCreatedNotification::$becameUrgent` et la clé
  `notifications.urgent_maintenance.intro_became_urgent` (`fr`, `en`, `wo` = français).
- [x] `tests/Feature/Maintenance/UrgenceTardiveDInterventionTest.php`.

## Critères d'acceptation

- [x] AC1 — passée en urgent par `PATCH`, job à +2 min → aucune escalade ; à +31 min → une.
- [x] AC2 — le passage en urgent envoie l'alerte d'urgence (non escalade) à l'admin principal, avec
  l'introduction propre à ce cas.
- [x] AC3 — un `PATCH` qui garde `urgent` n'envoie rien et ne déplace pas `urgent_since`.
- [x] AC4 — ramenée à `high` : `urgent_since` et `escalated_at` retirés ; remise en urgent puis
  restée non traitée 31 min → escaladée de nouveau.
- [x] AC5 — une demande créée urgente porte `urgent_since`, et son alerte garde l'introduction
  d'origine.

## Hors périmètre

- Le titre in-app (`title`) et le sujet du courriel restent ceux de l'alerte d'urgence d'origine
  (« Urgent : … ») : la décision ne demande qu'une phrase d'introduction propre.

## Notes d'implémentation

- Hypothèse : comme à la création, l'auteur du `PATCH` n'est pas retiré des destinataires.
- `created_at <= now-30 min` reste en préfiltre SQL (le passage en urgent ne précède jamais la
  création) ; le seuil exact se juge en PHP sur `urgent_since`, pour ne pas comparer des dates ISO
  comme du texte en JSON.
- Avant correctif : les 5 cas rouges (escalade à +2 min, aucune alerte, `urgent_since` absent,
  `escalated_at` gardé). Ablation (modifications de `app/` retirées, test et textes gardés) : 5
  rouges ; correctif remis → 5/5.
