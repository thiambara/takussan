---
id: TCK-1323
title: "Carnet des bailleurs : une société est nommée par sa raison sociale, son contact en dessous"
status: done
phase: P1
family: feature
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-117--clés-de-metadata-des-profils-écrites-par-les-assistants"
tags: [web, bailleur, carnet, pistes]
---

## Contexte

Réf : **P117.05** du fichier de pistes, `validé` (V7 accordé).

L'invitation d'un bailleur exige `owner_type` et, pour une société, `company_name`, rangés dans
`owner_profiles.metadata`. Aucun écran ne les relisait : le carnet nommait une société par son
contact.

## Décision du porteur

> porteur (2026-10-22) : garder l'exigence et afficher la raison sociale (`metadata.company_name`) dans le carnet des bailleurs, sans colonne neuve pour l'instant

## Objectif

Dans `OwnersList`, la cellule « Nom » d'un bailleur `owner_type: company` porte la raison sociale,
et le nom du contact en dessous.

## Delta à produire

- [x] `OwnersList` : `raisonSocialeDe()` ; la cellule du nom affiche la raison sociale puis le
      contact. `metadata` est déjà servie entière par `GET /api/owners` (`OWNER_PROFILE_FIELDS`).
- [x] Test du carnet : une société et un particulier.

## Critères d'acceptation

- [x] AC1 — Une société de raison sociale « SCI Teranga » est nommée ainsi, « Fatou Sarr » dans la
      même cellule.
- [x] AC2 — Un particulier reste nommé par ses prénom et nom.

## Hors périmètre

- La raison sociale ailleurs que dans le carnet (relevé, reversement, documents) : la Piste le
  propose, la décision du porteur ne vise que le carnet ; noté en reste de l'entrée.
- Toute colonne neuve (V4).

## Notes d'implémentation

- Ablation : cellule d'avant remise → `OwnersList.raison-sociale.test.tsx` rouge (« SCI Teranga »
  introuvable) ; correctif → vert. `OwnersList.identifiants` et `.double-facteur` verts.
