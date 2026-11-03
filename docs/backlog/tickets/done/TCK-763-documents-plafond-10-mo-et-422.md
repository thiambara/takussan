---
id: TCK-763
title: "Documents : validation ramenée à 10 Mo, refus de la médiathèque en 422"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage"
tags: [back, media, validation, pistes]
---

## Contexte

Réf : **P10.07** du fichier de pistes, `validé` (critère accordé : V9). `MediaUploadRequest` et
`GenericMediaUploadRequest` validaient la collection `documents` jusqu'à 25 Mo, quand
`media-library.max_file_size` refuse au-delà de 10 Mo. Un PDF de 10 à 25 Mo passait la validation,
puis Spatie levait `FileIsTooBig`, qu'aucun gestionnaire ne traduisait : 500.

## Décision du porteur

validation des documents ramenée à 10 Mo, FileCannotBeAdded traduit en 422

## Objectif

Un document trop lourd est refusé par la validation, et tout refus de la médiathèque rend 422.

## Contrat de données

`POST /api/media` et `POST /api/media/upload`, collection `documents` : au-delà de 10 Mo, 422 sur
`file` (au lieu de 500 entre 10 et 25 Mo). Toute route `api/*` dont l'ajout lève une
`FileCannotBeAdded` rend 422 `{code: "media.file_rejected", message}`, au lieu de 500.

## Contraintes strictes

- Le message de Spatie ne sort pas : il porte le chemin temporaire du fichier.
- `media-library.max_file_size` ne bouge pas : il vaut pour toutes les collections.

## Delta à produire

- [x] `MAX_DOCUMENT_KB` = 10 × 1024 dans les deux FormRequests.
- [x] `bootstrap/app.php` : `FileCannotBeAdded` → `ApiError(422, 'media.file_rejected')`.
- [x] `errors.media.file_rejected` en fr, en, et en wo le texte français tel quel (wolof en pause).
- [x] Tests : deux cas dans `MediaUploadTest`.

## Critères d'acceptation

- [x] AC1 — Un PDF de 15 Mo dans `documents` rend 422 sur `file`, aucun média.
- [x] AC2 — Un fichier que la médiathèque refuse rend 422, code `media.file_rejected`, aucun média.

## Hors périmètre

- Les libellés côté front du code `media.file_rejected` : aucun écran n'envoie de document par ces
  routes (le seul appelant, `agencies.ts`, envoie un logo).

## Notes d'implémentation

- `UploadedFile::fake()->create('x.pdf', 15 * 1024)` annonce une taille sur un fichier vide :
  Spatie mesure le fichier et l'accepte. D'où `createWithContent()` avec de vrais octets.
- Avant correctif : 2 rouges, 500 (`FileIsTooBig`). Ablation : `MediaUploadRequest` d'avant → AC1
  rougit seul ; `bootstrap/app.php` d'avant → AC2 rougit seul ; remis → 12/12 verts, 44 avec
  `MediaGenericUploadTest`, `AgencyLogoUploadTest`, `tests/Unit/Lang` et `TranslationUsageTest`.
