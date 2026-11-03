---
id: TCK-2071
title: "L'abandon d'une notification par code vers un contact sans compte écrit l'activité alertable"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  adr:
    - "docs/adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-207--rappels-planifiés-par-code-marqués-à-la-mise-en-file-face-à-un-envoi-perdu"
tags: [api, notifications, exploitation, pistes]
---

## Objectif

L'échec final d'une copie de `CodedNotification` vers un contact sans compte écrit, en plus du
journal, l'activité alertable `ops_critical_job_failed`.

## Contexte

Réf : **P207.03** du fichier de pistes, `validé (délégué)`.

### Décision du porteur (déléguée)

> validé (délégué) — `CodedNotification::failed()` écrit en plus l'activité alertable `ops_critical_job_failed` (code, canal, classe de l'exception, jamais les paramètres ni le message, ADR-0044 § 2) quand la copie abandonnée vise un contact sans compte (`AnonymousNotifiable`), comme `AlertsWhenMarkedDeliveryFails` (TCK-1794) le fait pour les envois marqués hors code ; sans toucher à la marque de l'appelant ni renvoyer ; garde : `failed()` d'une copie sérialisée vers un `AnonymousNotifiable` → une activité, vers un compte → aucune activité de plus

- `CodedNotification::failed()` ne faisait que `Log::error` (TCK-800) ; les envois marqués hors
  code écrivent l'activité depuis TCK-1794 (`AlertsWhenMarkedDeliveryFails`).

## Hypothèses (mode sans humain)

- `failed()` ne reçoit pas le destinataire : la copie le retient à la mise en file, dans
  `middleware()`, comme elle retient déjà son canal (TCK-800).
- L'activité n'a pas de sujet : la notification ne connaît pas l'objet de l'envoi (échéance,
  visite). Ses propriétés : `job`, `code`, `channel`, `exception`, `at`.

## Delta à produire

- [x] `CodedNotification::$queuedForContact`, posé dans `middleware()`.
- [x] `failed()` écrit l'activité quand la copie vise un contact sans compte.
- [x] `NotificationFailureLoggingTest` : copie sérialisée vers un contact → une activité, sans
  paramètre ni message ; vers un compte → aucune.

## Critères d'acceptation

- [x] AC1 — `failed()` d'une copie sérialisée vers un `AnonymousNotifiable` → une activité
  `ops_critical_job_failed`, avec le code, le canal et la classe de l'exception, sans les
  paramètres ni le message.
- [x] AC2 — `failed()` d'une copie vers un compte → aucune activité de plus.

## Hors périmètre

- Rattacher l'activité à l'échéance ou à la visite (la notification ne les connaît pas).
- P207.01 (SMS refusé par tous les fournisseurs, qui ne lève pas et n'atteint pas `failed()`).

## Notes d'implémentation

- Avant correctif : 0 activité pour la copie vers le contact.
- Ablation : la condition passée à `false` → 1 rouge ; remise → 4 verts.
- Le test sérialise la copie (`unserialize(serialize($job))`), chiffrée : c'est la forme que le
  worker relit, et la propriété posée dans `middleware()` doit y survivre.
