---
id: TCK-1086
title: "Les liens vers les listes publiques dynamiques ne se préchargent plus"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-69--fiche-bien-recherche-et-accueil-sous-3g-simulé-servis-par-next-start"
tags: [web, public, performance, pistes]
---

## Contexte

Réf : **P69.02** du fichier de pistes, `validé` (V7). Aucun lien du front ne portait `prefetch=` :
`next/link` précharge tout lien visible, et chaque visite de fiche faisait rendre au serveur les
listes de son fil d'Ariane (une recherche `per_page=40` chacune, 2 Kio reçus par lien).

## Décision du porteur

> `prefetch={false}` sur les liens vers les listes dynamiques (fil d'Ariane de la fiche, raccourcis de ville et de quartier), avec un test du fil d'Ariane ; le compte des impressions au préchargement reste une décision à part (porteur, 2026-10-20)

## Reste à faire

> le compte des impressions au préchargement (ne pas compter un rendu `Next-Router-Prefetch`), décision à part du porteur

## Objectif

Afficher une fiche ou l'accueil ne fait plus rendre au serveur des listes que le visiteur n'ouvre pas.

## Delta à produire

- [x] `PropertyBreadcrumb` : `prefetch={false}` sur chaque maillon cliquable.
- [x] `QuartiersDeLaVille` : `prefetch={false}` sur les liens de quartier d'une page de ville.
- [x] `PropertyRow` : `prefetch={false}` sur « Voir tout » (rangées de l'accueil, dont celle de
      la ville proche).
- [x] Test `liens-de-liste-sans-prechargement.test.tsx`.

## Critères d'acceptation

- [x] AC1 : les quatre maillons du fil d'Ariane d'une fiche (accueil, contrat, ville, quartier)
      portent `prefetch={false}`.
- [x] AC2 : les liens de quartier d'une page de ville et le « Voir tout » d'une rangée aussi.

## Hypothèses (mode sans humain)

- « Raccourcis de ville et de quartier » est lu comme les liens qui mènent à une liste filtrée par
  lieu hors du fil : les liens de `QuartiersDeLaVille` et les « Voir tout » de `PropertyRow`, dont
  celui de la rangée « près de vous » (`?city=`). Les autres « Voir tout » de l'accueil passent par
  le même composant et mènent aussi à des listes dynamiques : ils sont couverts du même geste.
- Le maillon « Accueil » du fil est pris aussi : l'accueil est rendu à la demande (`discovery`
  sans cache, P69.03).

## Hors périmètre

- Le reste ci-dessus. Les liens vers une fiche (`/properties/<slug>`) gardent le préchargement.
- Le relevé sous `next start` n'a pas été rejoué.

## Notes d'implémentation

- `prefetch` n'arrive pas dans le DOM : le test remplace `next/link` par une ancre qui l'expose.
- Ablation : les trois composants d'origine remis → 3 rouges (`prefetch` à `undefined`), remis →
  3 verts.
