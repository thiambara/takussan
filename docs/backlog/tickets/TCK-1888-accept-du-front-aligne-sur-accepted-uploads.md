---
id: TCK-1888
title: "Les sélecteurs de fichiers des documents et du KYC proposent les types qu'`AcceptedUploads` accepte, gardés par un test de parité"
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
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-194--règles-mimes-et-mimetypes-face-au-type-que-finfo-lit-dans-un-fichier-réel"
tags: [web, uploads, kyc, documents, parite, pistes]
---

## Objectif

Le sélecteur de fichiers ne propose que ce que l'API accepte, et propose tout ce qu'elle accepte ;
un test casse si les deux listes divergent.

## Contexte

Réf : **P194.04** du fichier de pistes, `retenu · autonome` (A6 et A1).

- Le docblock de `DOCUMENT_MIME_ACCEPT` (`takussan-web/src/lib/queries/documents.ts`) la dit
  alignée sur `['required', 'file', 'max:10240']`, règle remplacée par
  `AcceptedUploads::document()` (TCK-601) ; la liste n'offre ni `image/heic` ni `image/heif`, que
  l'API accepte.
- `KycUploader` propose `image/*,application/pdf`, alors que les routes KYC n'acceptent que les
  types de `AcceptedUploads::KYC_MIMETYPES` : un GIF ou un AVIF choisi à l'écran rend 422.

## Hypothèses (mode sans humain)

- `application/csv` figure dans `DOCUMENT_MIMETYPES` parce que `finfo` peut le lire dans un CSV ;
  aucun navigateur ne l'annonce pour un `.csv` : il reste hors de l'attribut `accept`, et le test
  le nomme comme seule exception.
- Aucun texte d'écran ne change : seul l'attribut `accept` des `<input type="file">` bouge.

## Delta à produire

- [x] `documents.ts` : docblock renvoyant à `AcceptedUploads::DOCUMENT_MIMETYPES`,
  `image/heic` et `image/heif` ajoutés à `DOCUMENT_MIME_ACCEPT`.
- [x] `KycUploader.tsx` : `accept` réduit aux types de `AcceptedUploads::KYC_MIMETYPES`, exporté
  en `KYC_MIME_ACCEPT`.
- [x] Test Vitest de parité qui lit `AcceptedUploads.php` et compare ces deux listes à ses
  constantes.

## Critères d'acceptation

- [x] AC1 — `DOCUMENT_MIME_ACCEPT` contient exactement `DOCUMENT_MIMETYPES`, moins
  `application/csv`.
- [x] AC2 — `KYC_MIME_ACCEPT` contient exactement `KYC_MIMETYPES`, sans joker `image/*`.
- [x] AC3 — L'input du KYC rendu porte `accept` = `KYC_MIME_ACCEPT`.

## Hors périmètre

- Les autres sélecteurs de fichiers du front (devis, restitution, bail, statuts d'agence) : ils
  ne passent pas par `AcceptedUploads`.

## Notes d'implémentation

- Test : `takussan-web/src/lib/queries/__tests__/accept-des-televersements.parity.tck-1888.test.tsx`
  (3 cas). Avant correctif : documents rouges (`image/heic`, `image/heif` absents), KYC rouge
  (aucune liste exportée, `image/*` sur l'input).
- Ablation : HEIC/HEIF retirés de `DOCUMENT_MIME_ACCEPT` et `image/*,application/pdf` remis sur
  l'input du KYC → 2 rouges (documents, input KYC) ; remis → 3 verts.
- Le rendu de `KycUploader` exige un mock de `@/components/ui/toast` : sans provider, base-ui jette.
