---
id: TCK-1882
title: "Les documents et pièces KYC de moins de 1 Kio passent : seul le fichier vide est refusé"
status: done
phase: P2
family: technique
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
tags: [api, uploads, kyc, documents, pistes]
---

## Objectif

Une note `.txt`, un petit CSV ou une photo de quelques centaines d'octets se déposent comme
document ou pièce KYC ; le fichier vide reste refusé.

## Contexte

Réf : **P194.01** du fichier de pistes, `retenu · autonome` (A1).

- `AcceptedUploads::rules()` posait `min:1` pour « refuser le fichier vide » (docblock, TCK-601
  AC5). Pour un fichier, Laravel juge la taille en kilo-octets (`getSize() / 1024`) : `min:1`
  exige 1 024 octets, et refusait en 422 tout fichier réel plus petit, sur les sept requêtes qui
  lisent `AcceptedUploads` (documents, versions, KYC des profils et de l'agence, preuve RGPD).
- Les tests ne déposaient que des faux fichiers de 0 et de 100 ou 300 Ko : la plage
  1-1 023 octets n'était pas vue.

## Hypothèses (mode sans humain)

- Le fichier vide garde un 422 sur le même champ ; son message devient celui d'un téléversement
  échoué (`validation.uploaded`, texte existant du cadriciel), au lieu de « au moins 1 kilo-octet »,
  qui n'est plus la règle. Aucun texte neuf.

## Delta à produire

- [x] `App\Rules\FichierNonVide` : refuse 0 octet, et rien d'autre.
- [x] `AcceptedUploads::rules()` : `min:1` remplacé par cette règle ; docblock corrigé.
- [x] Tests par fichiers réels : un `.txt` et un CSV de moins de 1 Kio sur le dépôt et la
  version de document, un PNG 2×2 sur les quatre routes KYC.

## Critères d'acceptation

- [x] AC1 — `POST /api/documents` et `POST /api/documents/{id}/versions` avec un `.txt` réel de
  28 octets et un CSV réel de 66 octets → 201.
- [x] AC2 — Les quatre routes d'upload KYC avec un PNG réel de moins de 1 Kio → 201.
- [x] AC3 — Un fichier vide reste refusé (422) sur ces routes (tests `vide` existants).

## Hors périmètre

- La garde générale par fichiers réels de chaque format (P194.03) et le conteneur MP4 de la note
  vocale (P194.02).

## Notes d'implémentation

- Ablation (a) : `min:1` remis à la place de la règle → le test des petits fichiers de
  `DocumentUploadMimeTest` et les quatre cas de `test_une_petite_photo_reelle_passe` rouges (422) ;
  (b) règle retirée sans `min:1` → les cas `vide` de `DocumentUploadMimeTest` (2) et de
  `KycUploadMimeTest` (4) rouges : la règle est seule à refuser le vide ; remise → verts.
- Un fichier vide réel serait déjà refusé par `mimetypes:` (`finfo` → `application/x-empty`) :
  seul un faux fichier vide, dont le type vient du nom, juge la règle de taille.
