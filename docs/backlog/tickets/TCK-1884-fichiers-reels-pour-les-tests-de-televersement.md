---
id: TCK-1884
title: "Les tests de téléversement des documents, du KYC et de la note vocale déposent des fichiers réels, que `finfo` lit"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1882]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-194--règles-mimes-et-mimetypes-face-au-type-que-finfo-lit-dans-un-fichier-réel"
tags: [api, uploads, tests, kyc, documents, messagerie, pistes]
---

## Objectif

Un format qu'une route de téléversement annonce et que `finfo` lirait autrement que prévu fait
rougir un test, au lieu de passer parce que le faux fichier tire son type de son nom.

## Contexte

Réf : **P194.03** du fichier de pistes, `retenu · autonome` (A5).

- `UploadedFile::fake()->create()` et `createWithContent()` rendent le type passé ou déduit de
  l'extension ; leur contenu n'est pas lu. Les tests des documents, du KYC et de la note vocale
  n'en déposaient pas d'autres : c'est ainsi qu'ont passé P194.01, P194.02 et l'OFX 2 de P157.05.
- Le docblock d'`AudioMessageTest::voiceNote()` affirmait « `finfo` y lit `audio/ogg` » : mesuré,
  ce contenu, écrit en fichier réel, se lit `application/octet-stream` (`OpusHead` à l'octet 26
  au lieu de 28).

## Hypothèses (mode sans humain)

- Le support se limite à ce que le dépôt sait déjà écrire (dompdf, PhpSpreadsheet, GD,
  `ZipArchive`) et à des en-têtes écrits octet par octet ; aucune dépendance ajoutée. Le `.doc`
  (OLE de Word 97) n'a pas d'écrivain dans le dépôt et reste hors du jeu.
- `finfo` est celui que PHP embarque (`ext/fileinfo`) : mesuré sur le poste, à confirmer par la CI.

## Delta à produire

- [x] `tests/Support/FichiersReels.php` : PDF, PNG, JPEG, WebP, HEIC, `.txt`, CSV, `.xlsx`, `.xls`,
  `.docx`, Ogg Opus, MP4 `M4A `, en `UploadedFile` réel sans type client.
- [x] `DocumentUploadMimeTest` : chaque format annoncé, sur le dépôt et la version.
- [x] `KycUploadMimeTest` : chaque format KYC, sur les quatre routes.
- [x] `AudioMessageTest` : Ogg et M4A réels acceptés ; `voiceNote()` et le cas « fichier texte »
  passent aux fichiers réels, docblock corrigé.

## Critères d'acceptation

- [x] AC1 — Chaque fichier du support est lu par `finfo` sous le type que la route attend
  (mesuré par script hors dépôt : `application/pdf`, `image/png`, `image/jpeg`, `image/webp`,
  `image/heic`, `text/plain`, `text/csv`, types OOXML et `application/vnd.ms-excel`, `audio/ogg`,
  `audio/x-m4a`).
- [x] AC2 — Ces fichiers, déposés en `UploadedFile` réel, rendent 201 sur les routes documents,
  KYC et note vocale.

## Hors périmètre

- Le conteneur MP4 de marque `mp42` de la note vocale (P194.02, à valider).

## Reste à faire

- Les autres requêtes `mimes:` (devis, pièces de restitution, contrat de bail, statuts d'agence)
  déposent encore des faux fichiers, et le `.doc` n'a pas de fichier réel.

## Notes d'implémentation

- Ablation (a) : `min:1` remis dans `AcceptedUploads` → 8 rouges dans `DocumentUploadMimeTest`
  (les formats de moins de 1 Kio) et 8 dans `KycUploadMimeTest` : les faux fichiers de 100 et
  300 Ko ne le voyaient pas. (b) `audio/x-m4a` retiré des types de la note vocale →
  `test_a_real_voice_note_container_is_accepted` rouge sur `m4a`. Remis → verts.
- Une page Ogg : 27 octets d'en-tête, puis la table des segments ; `finfo` cherche `OpusHead` à
  l'octet 28.
