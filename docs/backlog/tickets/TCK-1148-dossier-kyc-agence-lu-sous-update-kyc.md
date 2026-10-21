---
id: TCK-1148
title: "Dossier KYC de l'agence : la lecture du dossier et de ses pièces suit la capacité agency.update_kyc"
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
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#42-kycdossier-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-82--bailleur-et-membre-jugés-en-dur-hors-de-landlordwrites-et-des-capacités"
tags: [back, kyc, agency, authorization, capabilities, pistes]
---

## Contexte

Réf : **P82.05** du fichier de pistes, `validé` (V2 accordé : la lecture retirée à l'admin sans la
capacité).

`upload` et `submit` du dossier KYC d'agence autorisent par `AgencyPolicy::updateKyc`
(`agency.update_kyc` sous le profil actif de l'agence), mais `show` et la lecture d'une pièce
(`KycDocumentController`) exigeaient `isAgencyAdminAt` sans lire la capacité : le membre qui tient
la capacité soumettait un dossier qu'il ne pouvait pas lire, et l'admin dont le rôle la retire le
lisait.

## Décision du porteur

validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la piste recommande la même règle que `updateKyc` (l'autre voie, une capacité de
lecture neuve, ajoute une capacité au catalogue). `show` et la lecture d'une pièce d'agence
passent par `updateKyc` ; une pièce d'un autre sujet reste au super-admin. Le second volet —
retirer les deux helpers et leurs exemptions de `scripts/check-controller-authorization.mjs` —
passe par une garde existante (critère V9) : les helpers restent, réduits à une délégation.

## Reste à faire

retirer `authorizeAgencyAdmin()` (`Agency\KycController`) et `authorizeDocument()` (`KycDocumentController`) et leurs exemptions de `scripts/check-controller-authorization.mjs` (garde existante, fermée à l'implémenteur)

## Objectif utilisateur

Celui qui dépose et soumet le dossier KYC de l'agence le relit ; celui à qui le rôle retire ce
droit ne lit plus les pièces d'identité qu'il contient.

## Delta à produire

- [x] `Agency\KycController::authorizeAgencyAdmin()` délègue à `updateKyc`.
- [x] `KycDocumentController::authorizeDocument()` : super-admin, ou `updateKyc` sur l'agence sujet.
- [x] Tests dans `tests/Feature/Kyc/AgencyKycCapabilityTest.php`.

## Critères d'acceptation

- [x] AC1 — agent dont le rôle porte `agency.update_kyc` : `GET /api/agencies/{a}/kyc` → 200 et la
      pièce qu'il a déposée, par son URL signée → 200.
- [x] AC2 — admin dont le rôle retire la capacité : 403 sur les deux (l'assertion « la lecture reste
      à l'admin » du test existant passe de 200 à 403).

## Hors périmètre

- Le reste ci-dessus. Aucun changement du front.

## Notes d'implémentation

- Ablation : les deux helpers rendus à `isAgencyAdminAt` → 2 rouges (AC1 et AC2) ; remis → vert.
