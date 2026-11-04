---
id: TCK-759
title: "Site public : un aperçu de partage par défaut, image générée depuis le logo"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-9--pages-publiques--seo-et-partage"
tags: [front, seo, open-graph, pistes]
---

## Contexte

Réf : **P09.03** du fichier de pistes, `validé` (critère accordé : V7). Hors des fiches de bien,
d'agence et d'agent, aucune page publique n'émet de `og:*` ni de `twitter:*` : l'accueil, une
liste par ville ou un annuaire partagés sur WhatsApp ou Facebook n'ont ni image ni nom de site.
Aucun fichier `opengraph-image` n'existe.

## Décision du porteur

openGraph par défaut dans le layout public ; image générée depuis le logo ; pas d'image par ville

## Objectif utilisateur

Un lien vers n'importe quelle page publique, partagé sur WhatsApp ou Facebook, s'affiche avec une
image Takussan, le nom du site et le titre et la description de la page.

## Contrat de données

Aucun endpoint.

## Contraintes strictes

- Aucune dépendance : `ImageResponse` vient de `next/og`, livré avec Next.
- Aucun texte de produit neuf : l'image porte le symbole et le nom de la marque, rien d'autre.
- Les fiches qui déclarent leur propre `openGraph` le gardent.

## Delta à produire

- [x] `src/app/[locale]/(public)/opengraph-image.tsx` : 1200 × 630, PNG, le symbole du logo
  (`SymboleTakussan`, mêmes tracés) et le nom sur la tuile d'encre d'`icon.svg`.
- [x] `generateMetadata` du layout public : `openGraph` par défaut (`type: website`,
  `siteName: Takussan`, `locale` selon la langue servie) et `twitter.card: summary_large_image`.
  Titre et description n'y sont pas posés : Next les reprend de la page (`inheritFromMetadata`).

## Critères d'acceptation

- [x] AC1 — Le layout public rend un `openGraph` avec `siteName`, `type` et la `locale` de la
  langue servie (`fr_SN`, `en_US`, `wo_SN`), sans titre figé.
- [x] AC2 — L'image par défaut est un PNG de 1200 × 630.
- [x] AC3 — Aucune image par ville ni par quartier.

## Hypothèses

- `og:locale` : `fr_SN` et `wo_SN` (le site sert le Sénégal), `en_US` pour l'anglais. La décision
  ne tranche pas ce point, et il ne se voit pas dans l'aperçu.
- `og:url` n'est pas posé par le layout : il ne connaît pas le chemin de la page, et une URL
  fausse vaut moins qu'aucune.

## Hors périmètre

- Sur la fiche, `og:url`, `og:locale`, `og:site_name` et les dimensions de l'image (constat de la
  piste, non repris par la `Piste`). Une fiche sans photo déclare `openGraph.images: undefined`,
  ce qui retire aussi l'image par défaut : à reprendre avec elle.
- Une image par ville ou par quartier (refusée par la décision).

## Notes d'implémentation

- Avant correctif : 5 rouges sur 5 dans `apercu-de-partage.test.ts` (aucun `openGraph` au layout,
  aucun `opengraph-image`). Ablation : `openGraph`/`twitter` retirés du layout et image retirée →
  5 rouges ; remis → 5 verts. Le test rend réellement le PNG (environnement `node`, Satori et
  resvg de `next/og`) et lit ses dimensions dans l'en-tête IHDR.
- Le nom de l'image est `alt.toUpperCase()` et non un littéral : c'est le nom de marque, en
  capitales comme le `Logo`, et le scan du texte en dur n'a pas à l'excuser.
- `RAYONS` est exporté de `Logo.tsx` pour que l'image reprenne les tracés du symbole sans les
  recopier. Satori ne lit pas les classes : les couleurs y sont celles de `globals.css`, en clair.
