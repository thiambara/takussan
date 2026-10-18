---
id: TCK-909
title: "Facettes de ville : seuil de 3 biens, ville du fil avec son contrat, paires contrat × ville au sitemap"
status: done
phase: P2
family: applicatif
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-908]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-du-maillage-des-facettes"
tags: [back, front, seo, facettes, sitemap, fil-d-ariane, pistes]
---

## Contexte

Réf : **P35.05** du fichier de pistes, `validé` par le porteur (critère accordé : V7, choix des
seuils et cible visible du fil).

- La ville du fil d'Ariane d'une fiche (« Accueil › Louer › Dakar ») menait à `/properties?city=Dakar`,
  sans le contrat du maillon précédent.
- Le seuil de 3 biens ne valait que pour le quartier : une ville d'un seul bien public était
  canonique et entrait au sitemap.
- Les paires contrat × ville, canoniques, n'étaient ni au sitemap ni liées.

## Décision du porteur

ville du fil d'Ariane liée avec le contrat du maillon précédent ; page de ville indexable à partir de 3 biens, comme le quartier ; paires contrat × ville au sitemap à partir de 3 biens

## Objectif utilisateur

« Louer › Dakar » mène aux locations de Dakar ; seules les villes d'au moins 3 biens publics ont
une page indexable ; « à louer à Dakar » et « à vendre à Dakar » sont annoncées au moteur dès que
le contrat y compte 3 biens.

## Contrat de données

- `GET /api/public/properties/cities` : chaque entrée gagne `contracts`, le compte par contrat,
  les deux contrats toujours présents (`{"value":"Dakar","count":3,"contracts":{"sale":1,"rent":2}}`).
  Ajout seul : `value` et `count` ne changent pas.

## Delta à produire

- [x] `PublicPropertyController::cities()` : `count(*) FILTER (WHERE contract_type = …)` par
  valeur de `ContractType`, rendu sous `contracts`.
- [x] `facettes.ts` : `SEUIL_VILLE_INDEXABLE = 3` ; `villesDuCatalogue` n'admet au domaine que les
  villes qui l'atteignent ; type `contracts` sur `villesAvecComptes`.
- [x] `sitemap.ts` : villes sous le seuil écartées ; une page par paire contrat × ville dont le
  contrat atteint le seuil, par `cheminCanoniqueDeLaListe`.
- [x] `hrefDeLaVille` (`fil-d-ariane-quartier.ts`) : canonique de `{ contract_type, city }`, `null`
  si la ville n'y est pas retenue ; `maillonsDeFiche` et `PropertyBreadcrumb` la reçoivent, la
  page de la fiche la calcule avec le quartier.

## Critères d'acceptation

- [x] AC1 — Bien à vendre à « dakar », Dakar au domaine : maillon de ville vers
  `/properties?contract_type=sale&city=Dakar`, à l'écran et au `BreadcrumbList`, canonique
  d'elle-même.
- [x] AC2 — Ville hors du domaine (sous le seuil, ou domaine inconnaissable) : la ville reste un
  libellé des deux côtés.
- [x] AC3 — Domaine `[{Dakar,3},{Thiès,2}]` : seule Dakar est canonique.
- [x] AC4 — Sitemap : Thiès (2 biens) absente ; Dakar `{sale:9, rent:3}` → les deux paires ;
  Saly `{sale:2, rent:2}` → sa page de ville seule.
- [x] AC5 — API : les comptes par contrat, zéro compris.

## Hors périmètre

- Les liens « Quartiers de <ville> » et « Chercher par ville » (P35.02).
- Une page contrat × ville d'un contrat sous le seuil reste canonique (le domaine est celui de la
  ville) : elle n'est seulement pas annoncée au sitemap.

Hypothèses (mode sans humain) :
- « comme le quartier » : une ville sous le seuil se replie sur la page nue (canonique, titre), et
  son maillon du fil reste un libellé, comme celui d'un quartier trop mince. Sans cela le fil
  pointerait vers une page qui désavoue son URL.
- Le seuil de la paire se compte sur les biens du contrat dans la ville.
- Un maillon sans lien n'est plus marqué `aria-current="page"` s'il n'est pas le dernier : une
  ville en libellé n'est pas la page courante.

## Notes d'implémentation

- Ablation : `cities()` sans `contracts` → 1 rouge API ; `facettes.ts`, `sitemap.ts` et
  `fil-d-ariane.ts` remis à l'état de TCK-908 → 6 rouges front (seuil, Thiès au sitemap, paires,
  lien de ville sans contrat, deux cas de `hrefDeLaVille`) ; remis → 12 et 61 verts.
- La doublure de `rendu-serveur.test.tsx` servait les villes sans `count` : sous le seuil, Dakar
  sortait du `<h1>`. Elle sert désormais des comptes, comme l'API.
- `AgencySuspensionPublicPathsTest` compare `value` et `count` seuls : le compte par contrat y
  dépend du contrat tiré par la factory.
