---
id: TCK-1349
title: "Intervention d'un bien d'agence : l'assigné qui n'est plus assignable ne reçoit plus les avis « prestataire »"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-153--ce-que-le-retrait-en-leave_unassigned-laisse-au-nom-du-retiré-et-ce-qui-le-lit-encore"
tags: [api, maintenance, notifications, pistes]
---

## Contexte

Réf : **P153.08** du fichier de pistes, `validé (délégué)` (V7 accordé).

`NotifyMaintenanceParticipants::plan()` adressait les avis « prestataire » (`quote_requested`,
`quote_approved`, `quote_rejected`, `confirmed`, `contested`, `auto_closed`, `cancelled`,
`assigned`) à `$mr->assignee` sans le juger : un assigné dont la collaboration a pris fin, ou un
membre retiré en `leave_unassigned`, les recevait alors que la policy lui refuse l'intervention.

## Décision du porteur (déléguée)

> dans `NotifyMaintenanceParticipants`, sur un bien d'agence, retirer l'assigné des avis « prestataire » quand `ProviderEligibility::isAssignable` le refuse, comme `MaintenanceRequestPolicy::isAssignedProvider` ; un bien sans agence garde ses avis tels quels ; test : intervention d'un bien d'agence assignée à un membre retiré → aucun avis prestataire ; reste : marquer ou ranger à part, dans `GET …/customers/{id}/relationships`, le référent qui n'est plus de l'agence

## Reste à faire

> marquer ou ranger à part, dans `GET …/customers/{id}/relationships`, le référent qui n'est plus de l'agence

## Delta à produire

- [x] `providerRecipient()` : sur un bien d'agence, l'assigné refusé par
      `ProviderEligibility::isAssignable` n'est plus destinataire ; un bien sans agence garde son
      assigné.

## Critères d'acceptation

- [x] AC1 — Collaboration finie, `quote_requested` puis `confirmed` → aucun avis au prestataire,
      le bailleur reçoit le sien.
- [x] AC1 bis — Membre de l'équipe assigné puis retiré en `leave_unassigned` → aucun avis.
- [x] AC2 — Témoin : prestataire assignable → un avis.
- [x] AC3 — Bien sans agence → l'assigné reçoit l'avis.

## Hors périmètre

- Le reste ci-dessus (affichage des référents de `…/relationships`), laissé au porteur.

## Notes d'implémentation

- Ablation : `$provider = [$mr->assignee]` remis → AC1 et AC1 bis rouges (AC2 et AC3 restent
  verts, ce sont les témoins) ; remis → 11 verts.
