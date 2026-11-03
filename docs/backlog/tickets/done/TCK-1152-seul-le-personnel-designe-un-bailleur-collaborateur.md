---
id: TCK-1152
title: "Collaborateurs d'un bien : seul le personnel de l'agence désigne un bailleur en co_owner ou viewer"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#8-propertycollaborator"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-86--collaborateurs-co_owner-et-viewer-dun-bien"
tags: [back, property, collaborators, authorization, privacy, adr-0031, pistes]
---

## Contexte

Réf : **P86.01** du fichier de pistes, `validé` (V2 et V3 accordés : retirer au bailleur l'ajout
d'un co-indivisaire, ou réduire ce qu'il en apprend).

Le bailleur auteur d'un bien, à qui `/api/owners` est refusé (403, 404), ajoutait tout autre
bailleur de son agence en `co_owner` ou `viewer` (201), et la réponse rendait le nom, le courriel et
le téléphone de l'autre bailleur ; le 201 ou le 422 disaient aussi qui est bailleur de l'agence.

## Décision du porteur

validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la première voie de la piste, « borner l'ajout d'un `co_owner` ou d'un `viewer`
bailleur à qui peut déjà lire les bailleurs de l'agence (le personnel) ». `docs/features.md` § 1.1
range l'ajout de collaborateurs parmi les gestes du personnel (🧑‍💼). La règle
`CollaboratorEligibleForProperty` reçoit l'auteur du geste : un bailleur n'est éligible que si
l'auteur est du personnel de l'agence ou super-admin. Le refus est le 422 d'un compte hors de
l'agence (`collaborators.not_in_agency`), mot pour mot, pour fermer l'oracle. Le changement de rôle
(`PUT …/collaborators/{id}`) suit la même règle.

## Objectif utilisateur

Un bailleur n'apprend rien d'un autre bailleur de son agence en le désignant sur son bien.

## Delta à produire

- [x] `CollaboratorEligibleForProperty` : paramètre `$actor`, branche « bailleur » réservée au
      personnel et au super-admin.
- [x] Les deux FormRequest de collaborateurs passent `$this->user()`.
- [x] Tests dans `tests/Feature/Api/PropertyCollaboratorTest.php`.

## Critères d'acceptation

- [x] AC1 — le bailleur du bien : `POST …/collaborators` d'un autre bailleur de l'agence en
      `co_owner` et en `viewer` → 422, erreur `user_id` identique à celle d'un compte hors agence,
      sans le courriel de l'autre bailleur ; aucune ligne créée.
- [x] AC2 — il ajoute toujours un agent de l'agence en `viewer` (201), mais ne le passe pas en
      `co_owner` (422).
- [x] AC3 — l'admin de l'agence ajoute un bailleur en `co_owner` (201) : le test TCK-586 qui le
      faisait faire par le bailleur est réécrit avec l'admin.

## Hors périmètre

- La projection du compte rendu au personnel (`email`, `phone`), inchangée.

## Notes d'implémentation

- Ablation : la règle d'avant remise → AC1 rouge (201) ; remise → vert.
