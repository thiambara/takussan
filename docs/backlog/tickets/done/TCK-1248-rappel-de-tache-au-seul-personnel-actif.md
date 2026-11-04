---
id: TCK-1248
title: "Rappel d'échéance d'une tâche : au seul assigné personnel actif de l'agence du dossier"
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
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-126--destinataires-déquipe-choisis-sans-juger-le-profil-actif"
tags: [api, crm, taches, notifications, profils, pistes]
---

## Contexte

Réf : **P126.01** du fichier de pistes, `validé (délégué)`.

`SendTaskDueReminders` envoie `TaskDueReminderNotification` à l'assigné de la tâche dès que la
relation existe, sans juger son profil dans l'agence du dossier. Un agent suspendu (profil
`suspended`, `isStaffAt` faux) reçoit le rappel d'une tâche qu'il ne peut plus ouvrir.

## Décision du porteur (déléguée)

« validé (délégué) — ne rappeler l'échéance qu'à un assigné personnel actif de l'agence du dossier (`MembershipCapabilityResolver::isStaffAt`, agence lue par `Task::parentRecord()`) ; sinon, aucun rappel ; reste : un repli du rappel vers les admins actifs de l'agence »

Critère accordé : V7.

## Reste à faire

un repli du rappel vers les admins actifs de l'agence

## Objectif

Le rappel d'échéance ne part qu'à un assigné qui est encore personnel actif de l'agence du
dossier.

## Delta à produire

- [x] `SendTaskDueReminders::notifyFor` : agence lue par `Task::parentAgencyId()` (qui passe par
      `parentRecord()`, supprimés compris) ; si elle existe et que l'assigné n'y est pas
      `isStaffAt`, aucun envoi et aucun marqueur.
- [x] Tests dans `TaskReminderTest`.

## Critères d'acceptation

- [x] AC1 — Assigné au profil d'agent `suspended` dans l'agence du client → aucun rappel.
- [x] AC2 — Assigné agent actif de l'agence → un rappel, marqueur posé.
- [x] AC3 — Assigné agent actif d'une autre agence → aucun rappel.

## Hors périmètre

- Le repli vers les admins actifs (reste du porteur).
- Les autres rappels de l'angle 126 (visite, reversement, `properties.user_id`), à valider.

## Notes d'implémentation

- Hypothèse : un dossier hors de toute agence (client ou bien sans `agency_id`, parent introuvable)
  garde le rappel tel qu'avant : il n'y a pas d'agence où juger l'assigné, et les tests existants
  de ce cas restent verts.
- Le marqueur n'est pas posé quand le rappel est écarté : si le profil est réactivé dans la
  fenêtre de 2 h, le tick suivant rappelle.
- Ablation : `SendTaskDueReminders.php` remis à `HEAD` → 2 rouges (AC1, AC3) sur 9 ; correctif
  remis → 9/9 verts.
