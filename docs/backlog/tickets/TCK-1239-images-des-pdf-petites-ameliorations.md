---
id: TCK-1239
title: "Images des PDF : signatures de la fabrique en vrais PNG, logo d'un état des lieux signé non figé, commentaire et configuration alignés sur dompdf"
status: done
phase: P2
family: chore
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1233]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-109--images-des-pdf-rendus-par-dompdf"
tags: [api, pdf, dompdf, inventaire, docs, pistes]
---

## Contexte

Réf : **P109.04** du fichier de pistes, `validé (délégué)`.

Quatre écarts relevés autour des images des PDF :

- `InventoryFactory::signed()` signe d'un `base64_encode('tenant-sig')`, qui n'est pas une image :
  un PDF d'état des lieux signé par la fabrique imprimait le texte `alt`, sans rougir ;
- le commentaire d'`InventorySignRequest` dit que dompdf « résout encore les chemins locaux » avec
  `is_remote_enabled=false` ; mesuré, il refuse tout chemin hors de `Options::chroot` ;
- `docs/configuration.md` (l. 26, 68, 350) prescrit le pilote `cloudflare`, quand `.env.example`,
  `.env.docker` et `phpunit.xml` déclarent `dompdf` ;
- une fois le logo embarqué (TCK-1233), le PDF d'un état des lieux signé change avec le logo
  courant de l'agence : à décider s'il se fige.

## Décision du porteur (déléguée)

« validé (délégué) — ne pas figer le logo d'un état des lieux signé : il se recompose au téléchargement avec le logo courant de l'agence, comme le reste du document (TCK-596), et l'empreinte figée ne couvre pas le logo ; corriger le commentaire d'`InventorySignRequest` (dompdf refuse un chemin local hors de `chroot`), aligner `docs/configuration.md` (l. 26, 68, 350) sur le pilote `dompdf` déclaré, et donner à `InventoryFactory` un vrai PNG d'un pixel pour les deux signatures »

Critère accordé : V7.

## Objectif

Ce qui entoure les images des PDF dit ce que fait le code, et la fabrique produit un état des
lieux dont le PDF imprime ses signatures.

## Delta à produire

- [x] `InventoryFactory::TENANT_SIGNATURE` et `OWNER_SIGNATURE` : deux PNG d'un pixel, de couleurs
      différentes ; l'empreinte de chaque signature est le `sha256` de l'URI, comme dans
      `InventorySignatureService::sign()`.
- [x] Commentaire d'`InventorySignRequest` : dompdf ne lit un chemin local que sous `chroot` (son
      propre répertoire, faute de `LARAVEL_PDF_DOMPDF_CHROOT`) ; la règle stricte n'en dépend pas.
- [x] `docs/configuration.md` : `dompdf` comme pilote déclaré, aux trois endroits.
- [x] Logo non figé : aucun code, c'est le comportement en place ; un test le garde.

## Critères d'acceptation

- [x] AC1 — Le PDF d'un état des lieux `signed()` de la fabrique porte deux objets image.
- [x] AC2 — Un second téléchargement après changement du logo rend le logo courant, en URI
      `data:`, et `frozenTraceabilityHash()` est inchangée.

## Hors périmètre

- Figer le logo (stocker un instantané) : écarté par la décision, réversible plus tard.

## Notes d'implémentation

- Ablation : `InventoryFactory` remise à `HEAD` → 1 rouge (« 0 is identical to 2 ») ; correctif
  remis → 6/6 verts.
- Le test du logo non figé est vert sans code neuf : il garde un comportement en place
  (TCK-596), et rougit si l'empreinte se met à couvrir le logo ou si le logo cesse d'être
  recomposé. Retirer TCK-1233 le fait rougir sur le préfixe `data:`.
