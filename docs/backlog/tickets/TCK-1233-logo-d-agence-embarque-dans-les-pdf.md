---
id: TCK-1233
title: "Le logo d'agence s'imprime sur les PDF rendus par dompdf : embarqué en URI `data:`, plus jamais en URL publique"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-109--images-des-pdf-rendus-par-dompdf"
tags: [api, pdf, dompdf, media, pistes]
---

## Contexte

Réf : **P109.01** du fichier de pistes, `retenu · autonome` (A1).

`DocumentPdfService::prepareData()` passait au gabarit commun `$agency->getFirstMediaUrl('logo')`,
une URL `http(s)` du disque public. dompdf, `is_remote_enabled` à `false` (configuration du
paquet, aucune clé dans le dépôt), refuse toute URL distante et imprime le texte `alt` — le nom de
l'agence — à la place, sans erreur. Les sept gabarits étendent `pdf.layouts.base` : aucun PDF ne
portait le logo, et un contrat envoyé en signature le perd pour toujours (`signed_contract`).

## Objectif

Le logo d'une agence s'imprime en en-tête de tout PDF rendu par dompdf, sans ouvrir
`is_remote_enabled`.

## Delta à produire

- [x] `prepareData()` lit le média `logo` par son disque et le passe en URI `data:` par
      `PdfImageEmbedder::dataUri()` (TCK-538), réduit à `LOGO_MAX_WIDTH` (320 px).
- [x] `PdfImageEmbedder::dataUri()` accepte un format de réencodage (`jpg` par défaut, inchangé ;
      `png` pour le logo).
- [x] Test qui rend un vrai PDF sous dompdf pour une agence à logo.

## Critères d'acceptation

- [x] AC1 — Une agence à logo : le gabarit reçoit une URI `data:image/png;base64,…` d'au plus
      320 px de large, et le PDF porte un objet `/Subtype /Image`.
- [x] AC2 — Une agence sans logo : aucun objet image, le nom s'imprime comme avant.

## Hors périmètre

- `is_remote_enabled` reste fermé (le moteur irait chercher toute URL du HTML).
- La photo HEIC absente du PDF (P10.06).

## Notes d'implémentation

- **PNG et non JPEG pour le logo** : l'embarqueur réencodait l'original en JPEG, qui perd le canal
  alpha (fond noir sous GD pour un logo transparent). Le logo est réencodé en PNG ; dompdf écrit
  alors l'image et son masque `/SMask`, d'où « au moins un » objet image dans le test.
- `Agency` ne déclare aucune conversion sur `logo` : c'est toujours l'original réduit qui sort.
- Ablation : `getFirstMediaUrl('logo')` remis dans `prepareData()` → 1 rouge (« '/storage/1/logo.png?v=…'
  starts with "data:image/png;base64," ») ; correctif remis → 2/2 verts.
