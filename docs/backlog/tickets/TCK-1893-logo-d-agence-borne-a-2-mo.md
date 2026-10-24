---
id: TCK-1893
title: "Le logo d'agence est borné à 2 Mo à l'API, comme au front et dans TCK-064"
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
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [back, media, agency, pistes]
---

## Objectif utilisateur

Le logo d'une agence, décodé dans GD à chaque PDF, ne peut plus dépasser les 2 Mo que l'écran de
configuration et TCK-064 annoncent, même par appel direct.

## Contexte

Réf : **P195.06** du fichier de pistes, `validé (délégué)`. `MediaUploadRequest` jugeait `logo`
avec les photos (`MAX_PHOTO_KB`, 10 Mo).

## Décision du porteur (déléguée)

> borne propre à la collection `logo` dans `MediaUploadRequest`, 2 Mo (`max:2048`), celle de TCK-064 et d'`AGENCY_LOGO_MAX_BYTES`, mêmes types et même `PixelsAuPlus` que les photos ; test : logo de 3 Mo → 422 sur `file`, photo de 3 Mo toujours acceptée

## Hypothèses (mode sans humain)

- La borne est une constante `MAX_LOGO_KB` de `MediaUploadRequest`, à côté de `MAX_PHOTO_KB`.
- Le test vérifie aussi qu'un logo de 2 Mo exactement passe.

## Delta à produire

- [x] `MediaUploadRequest` : `MAX_LOGO_KB = 2048`, appliqué à la seule collection `logo`.
- [x] `AgencyLogoUploadTest::test_a_logo_above_two_megabytes_is_refused_while_a_photo_of_that_size_is_not`.

## Critères d'acceptation

- [x] AC1 — Logo de 3 Mo → 422 sur `file`, aucun média écrit.
- [x] AC2 — Logo de 2 Mo → 201.
- [x] AC3 — Photo de 3 Mo → 201.

## Hors périmètre

- Les autres collections de `POST /api/media`.

## Notes d'implémentation

- Ablation : borne retirée → rouge (201 au lieu de 422 pour le logo de 3 Mo) ; remise → vert.
