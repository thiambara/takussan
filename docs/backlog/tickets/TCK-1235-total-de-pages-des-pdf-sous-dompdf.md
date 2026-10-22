---
id: TCK-1235
title: "Le pied des PDF rendus par dompdf imprime « Page X sur N » : un pilote du dépôt écrit le total"
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
tags: [api, pdf, dompdf, pistes]
---

## Contexte

Réf : **P109.02** du fichier de pistes, `validé (délégué)`.

Le pied commun (`pdf.layouts.base`) écrit « Page <counter(page)> sur <counter(pages)> ». dompdf
évalue `counter(pages)` pendant la mise en page, avant de connaître le total : tout PDF imprimait
« Page 1 sur 0 », « Page 2 sur 0 »… TCK-077 (AC6) demande « page X sur N ».

## Décision du porteur (déléguée)

« validé (délégué) — garder « Page X sur N » (TCK-077, AC6) et écrire le total sous dompdf par un pilote du dépôt qui étend `DomPdfDriver` et remplace la liaison `laravel-pdf.driver.dompdf` : le total se lit sur le canevas après rendu (`page_text` avec `{PAGE_COUNT}`, ou second rendu qui écrit le compte dans `.page-total`), sans ouvrir `isPhpEnabled` ni `is_remote_enabled`, et sans changer le rendu des autres pilotes ; garde : un document de deux pages rendu sous dompdf, flux non compressé, lit « sur 2 » »

Critère accordé : V7.

### Choix de l'implémenteur

**Le second rendu**, des deux voies que la décision ouvre. `page_text` demande les coordonnées du
total sur chaque page, que seul l'arbre des cadres de dompdf connaît ; le second rendu laisse la
mise en page au gabarit. Le pilote compte les pages au premier rendu
(`getCanvas()->get_page_count()`), puis ajoute avant `</head>` la règle
`.page-total:before { content: "N"; }`, qui l'emporte sur `counter(pages)` à spécificité égale.

## Objectif

Tout PDF rendu sous dompdf imprime le vrai total de pages.

## Delta à produire

- [x] `App\Services\Pdf\DomPdfPageTotalDriver` étend `DomPdfDriver` : second rendu seulement pour un
      HTML qui porte `.page-total`.
- [x] `AppServiceProvider::register()` remplace la liaison `laravel-pdf.driver.dompdf`, et elle
      seule.
- [x] Test : une facture de deux pages, texte lu dans le flux décompressé.

## Critères d'acceptation

- [x] AC1 — Une facture de deux pages sous dompdf imprime « Page 1 sur 2 » puis « Page 2 sur 2 ».
- [x] AC2 — `isPhpEnabled` et `is_remote_enabled` restent fermés ; les autres pilotes du paquet
      sont inchangés.

## Hors périmètre

- La mise en page du pied (P109.03, TCK-1237).

## Notes d'implémentation

- Coût : un HTML à `.page-total` (tous les gabarits de `resources/views/pdf/`) se rend deux fois.
- Le flux de contenu de dompdf se lit par `gzuncompress` ; le texte d'une police Unicode (DejaVu)
  y est en UTF-16BE, en morceaux `BT x y Td … [(…)] TJ ET` (aide `textRuns()` du test).
- Ablation : liaison retirée d'`AppServiceProvider` → 1 rouge (« sur 0 » aux deux pages) ;
  remise → 3/3 verts.
