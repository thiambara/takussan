---
id: TCK-1189
title: "Les écrans de chargement et d'erreur des fiches bail et document gardent un h1"
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
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-101--axe-au-navigateur-des-écrans-app-des-autres-profils-et-des-pages-de-détail"
tags: [front, a11y, leases, documents, pistes]
---

## Contexte

Réf : **P101.02** du fichier de pistes, `retenu · autonome` (A4, A1).

`BookingDetail` et `VisitDetail` gardent un `h1` `sr-only` dans leur écran d'erreur ;
`LeaseDetail` et `DocumentDetailClient` n'en rendent aucun, ni en chargement ni en erreur, et
leur `page.tsx` non plus : axe rendait `page-has-heading-one` sur `/app/documents/1`.

## Objectif utilisateur

Un lecteur d'écran trouve le titre de la page sur une fiche bail ou document qui charge ou qui
échoue.

## Delta à produire

- [x] `LeaseDetail` : `h1` `sr-only` « `lease.fallbackReference` » (« Bail #{id} ») dans les
      branches de chargement et d'erreur.
- [x] `DocumentDetailClient` : `h1` `sr-only` « `dashboard.pages.documentDetail.metaTitle` »
      (« Fiche document ») dans les mêmes branches.
- [x] Test `FichesSansTitre.h1.test.tsx` : les deux fiches, les deux états.

## Critères d'acceptation

- [x] AC1 — Bail en chargement et en erreur : un `h1` « Bail #42 ».
- [x] AC2 — Document en chargement et en erreur : un `h1` « Fiche document ».
- [x] AC3 — Aucune clé i18n neuve.
- [x] AC4 — Sans le correctif, le test rougit (ablation).

## Hors périmètre

- Pourquoi la fiche document restait en chargement dans le relevé de l'explorateur : non établi,
  non re-mesuré.
- L'état de chargement de `BookingDetail`, qui n'a pas de `h1` non plus : hors de la piste.

## Notes d'implémentation

- Ablation : les deux composants rendus à `pre-dev` → 4/4 rouges (« Unable to find an accessible
  element with the role "heading" ») ; correctif remis → 4/4 verts, et les tests existants de
  `LeaseDetail` (préavis, contrat) restent verts.
