---
id: TCK-2136
title: "Bailleurs et prestataires liés à un compte sans nom gardent le nom saisi à l'invitation"
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
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-220--noms-de-comptes-rendus-par-le-front-sans-repli-face-aux-comptes-créés-par-téléphone"
tags: [front, bailleurs, prestataires, pistes]
---

## Contexte

Réf : **P220.06** du fichier de pistes, `retenu · autonome` (A1 : `nomDe`, `ownerName` et
`providerName` lisent déjà `metadata` comme source du nom). Dès qu'un compte est lié, `nomDe`
(`OwnersList`, `ServiceProvidersList`) prenait ses noms, même vides ; `ownerName`
(`CreatePayoutDialog`) et `providerName` (`MaintenanceAssignmentBlock`) repliaient champ par champ
par `??`, que `''` ne déclenche pas. Un compte créé par téléphone effaçait donc le nom que l'agence
avait saisi à l'invitation.

## Objectif utilisateur

L'agence retrouve sous leur nom les bailleurs et prestataires qu'elle a invités, même quand leur
compte ne porte pas de nom.

## Contrat de données

Aucun changement d'API : `user.first_name`/`last_name` et `metadata.first_name`/`last_name` déjà lus.

## Delta à produire

- [x] `nomDe` des deux listes : le nom composé du compte, sinon celui de `metadata`.
- [x] `ownerName` et `providerName` : nom du compte, puis nom de l'invitation, puis les replis existants.
- [x] Tests : `OwnersList.nom-invitation`, `ServiceProvidersList.nom-invitation`, un cas de
  `CreatePayoutDialog.test` et de `MaintenanceAssignmentBlock.test`.

## Critères d'acceptation

- [x] AC1 — un bailleur lié à un compte à noms `''` et `metadata` « Moussa Ndiaye » s'affiche
  « Moussa Ndiaye » au carnet et au dialogue de reversement.
- [x] AC2 — un prestataire dans le même cas s'affiche sous le nom de l'invitation au carnet et à
  l'assignation d'une intervention.
- [x] AC3 — un compte nommé garde son nom, pas celui de l'invitation.

## Hors périmètre

- Recopier le nom de l'invitation sur le compte à l'acceptation (P220.07, à valider, V3).
- La colonne e-mail à `—` pour une invitation par numéro (constat de P220.06, non demandé par sa `Piste`).

## Notes d'implémentation

- Le repli se fait sur le nom composé, non champ par champ : un prénom de compte et un nom
  d'invitation ne se mélangent plus.
- Ablation : les quatre fichiers remis à leur version d'avant → les quatre cas neufs rougissent.
- Le sélecteur d'assignation (base-ui) ne rend ses options qu'ouvert : le test lit le libellé du
  déclencheur, la demande étant assignée à ce prestataire.
