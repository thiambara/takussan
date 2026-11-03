---
id: TCK-1272
title: "La bibliothèque de documents nomme les pièces RIB et NINEA et les range à leur place"
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
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-134--tris-sur-une-colonne-denum-rangée-en-chaîne"
tags: [front, documents, i18n, pistes]
---

## Contexte

Réf : **P134.02** du fichier de pistes, `retenu · autonome` (A4, A1). Entrée dans le lot de
l'angle 146 par complément du même côté (front), et de même cause : une union du front sans des
cas de l'enum de l'API.

La bibliothèque groupe les documents par `type` et ordonne les groupes par
`DOCUMENT_TYPE_ORDER.indexOf`. `rib` et `ninea`, que l'API émet et que l'accueil du bailleur crée,
n'y sont pas : `indexOf` rend -1 et leur groupe passe en tête, sous un titre `documents.types.rib`
sans libellé (`MISSING_MESSAGE`).

## Objectif utilisateur

Le bailleur retrouve son RIB et son NINEA dans sa bibliothèque, nommés et à leur rang.

## Contrat de données

Aucun changement d'API.

## Delta à produire

- [x] `DocumentType` du front : `rib`, `ninea`.
- [x] `DOCUMENT_TYPE_ORDER` : les onze cas de l'enum (`rib`, `ninea` après `passport`) ; un type
  absent de l'ordre se range en dernier.
- [x] `documents.types.{rib,ninea}` dans les trois langues (libellés existants de
  `owners.onboarding.kyc.labels` ; `wo` = texte français).
- [x] Le téléversement de la bibliothèque garde ses catégories d'avant
  (`DOCUMENT_TYPE_UPLOAD_ORDER`).
- [x] `DocumentsLibrary.test.tsx` : groupe RIB nommé et rangé, type inconnu en dernier, parité de
  l'ordre avec `DocumentType.php`.

## Critères d'acceptation

- [x] AC1 — Un document `rib` s'affiche sous « RIB », après « Contrat de bail ».
- [x] AC2 — Un type inconnu de l'ordre se range en dernier.
- [x] AC3 — `DOCUMENT_TYPE_ORDER` couvre exactement les cas de l'enum de l'API.

## Reste à faire

- Proposer `rib` et `ninea` au téléversement de la bibliothèque : `DOCUMENT_TYPE_ORDER` alimente
  aussi le sélecteur de catégorie, et l'y ajouter offrirait un geste neuf (V7), que ni la Piste ni
  la mesure ne tranchent.

## Hors périmètre

- Le titre d'un type inconnu de l'API (il rend le chemin de la clé, comme avant).

## Notes d'implémentation

- Hypothèse : la Piste vise l'affichage et le filtre ; le dialogue de téléversement garde ses neuf
  catégories, comme `documentTypeSchema` qui le valide.
- Ablation : `constants.ts`, `DocumentsLibrary.tsx`, `DocumentUploadDialog.tsx` et
  `types/document.ts` rendus à `HEAD`, traductions gardées → 3 rouges (le groupe RIB reste en
  tête) ; correctif remis → 7/7 verts, `constants.test.ts` et
  `DocumentUploadDialog.onUploaded.test.tsx` verts.
