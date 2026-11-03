---
id: TCK-916
title: "Page de ville : liens « Quartiers de <ville> » vers les pages de quartier du sitemap"
status: done
phase: P2
family: applicatif
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-35--pages-de-facettes--texte-propre-et-maillage-interne"
tags: [front, seo, facettes, maillage, pistes]
---

## Contexte

Réf : **P35.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7, emplacement
et libellés neufs).

- La liste publique ne rend aucun lien vers une autre facette de lieu : les filtres de ville et de
  quartier naviguent par `router.push`, qu'un robot ne suit pas.
- Les pages de quartier annoncées au sitemap ne sont atteintes, depuis une page de ville, par aucun
  lien du HTML.

## Décision du porteur

liens « Quartiers de <ville> » sur la page de ville et « Chercher par ville » dans le pied de page, chacun vers une canonique présente au sitemap ; en `wo`, le texte français tel quel

## Objectif

Une page de ville rend, dans son HTML, un lien vers chacune de ses pages de quartier indexables.

## Delta à produire

- [x] `lib/liens-de-lieu.ts` : `liensDesQuartiers(ville, villes)` — les quartiers indexables de la
  ville (`quartiersDeLaVille`, en cache), chacun avec son chemin `cheminCanoniqueDeLaListe({ city,
  location })` ; vide si le domaine est indisponible.
- [x] `components/property/QuartiersDeLaVille.tsx` : composant serveur, `<nav>` titrée
  « Quartiers de <ville> », liens par `LienLocalise` ; rien quand la liste est vide.
- [x] `(liste)/page.tsx` : quand la canonique retient une ville sans quartier, la page passe ce
  bloc à `PropertiesDiscoveryPage` (prop `liensDeLieu`), rendu à la fin de `<main>`.
- [x] Clé `property.discovery.neighbourhoodsOf` en `fr`, `en`, et en `wo` le texte français tel quel.

## Critères d'acceptation

- [x] AC1 — Dakar avec Mermoz et Ngor indexables : deux liens, `/properties?city=Dakar&location=Mermoz`
  et `…&location=Ngor`, chacun présent au sitemap rendu avec les mêmes doublures.
- [x] AC2 — Domaine des quartiers indisponible (`null`) ou vide : aucun bloc.
- [x] AC3 — La page d'un quartier, ou la page nue, ne rend pas le bloc.

## Reste à faire

« Chercher par ville » dans le pied de page : `Footer` est synchrone et monté par une vingtaine
d'appelants, dont six composants client (`PropertiesDiscoveryPage`, `HomepageDiscovery`,
`IndexDeProfils`, `PublicFavoritesPage`, `CompareClient`, `PageLegale`). Lui donner la liste des
villes demande de la faire passer par chaque page, ou de monter le pied de page dans le layout
public : un choix de structure, à trancher à part.

## Hors périmètre

- La rangée de villes de l'accueil (la piste la proposait en alternative au pied de page).

Hypothèses (mode sans humain) :
- « page de ville » : toute liste dont la canonique retient une ville et pas de quartier (ville
  seule, ou ville avec contrat ou type). Les liens visent la page ville × quartier, sans le
  contrat ni le type, qui est celle du sitemap.
- Le bloc se rend à la fin de `<main>`, après les résultats et la pagination.

## Notes d'implémentation

- Ablation : la page sans ville retenue et `liensDesQuartiers` vidée → 4 rouges (les deux pages de
  ville du câblage, les deux AC1 de la fonction) ; remis → 10 verts, et 475 verts sur
  `(public)`, `components/property` et la route du sitemap.
- Les URL que rend `app/sitemap.ts` sont déjà échappées pour le XML (`&amp;`) : le test les
  déséchappe avant de comparer.
