---
id: TCK-2061
title: "Les villes du profil (`cities`) se lisent dans le résumé de l'alerte, son lien et la recherche publique"
status: done
phase: P2
family: recherche
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-1839]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-185--formulaires-dédition-du-front-hors-du-bien-du-client-et-du-profil--champ-vidé-omis-du-corps"
  tickets:
    - "docs/backlog/tickets/TCK-136-profile-customer-search-preferences.md"
    - "docs/backlog/tickets/TCK-599-alertes-de-recherche-et-favoris-qui-previennent.md"
tags: [recherche, alertes, front, api, pistes]
---

## Contexte

Réf : **P185.02** du fichier de pistes, `validé`.

Le formulaire de préférences du profil écrit les villes sous `criteria.cities`, une liste
(TCK-136). L'alerte l'applique (`PropertySearchService::buildFilter`, TCK-599), mais le reste ne
la connaissait pas : `SEARCH_FILTER_KEYS` n'avait que `city`, et `SearchPublicPropertyRequest` ne
validait pas `cities`, que `validated()` jetait. Une alerte réglée sur deux villes se résumait
sans ville, et son lien « voir les résultats » montrait le pays entier.

## Décision du porteur

« validation du porteur (2026-10-23) : garder `cities` ; `SearchPublicPropertyRequest` valide `cities[]`, et le front apprend la clé dans `SEARCH_FILTER_KEYS`, avec un test aller-retour »

## Objectif utilisateur

Une alerte réglée depuis le profil sur Dakar et Thiès se résume « Dakar · Thiès », et son lien
ouvre les biens de ces deux villes, sur la liste comme sur la carte.

## Contrat de données

- `GET /api/public/properties/search` et `/map` acceptent `cities`, en tableau (`cities[]=Dakar`)
  ou en liste à virgules (`cities=Dakar,Thiès`, la forme de l'URL du front, comme `type`). La
  chaîne devient un tableau avant validation, segments vides retirés.
- Bornes : 20 villes de 120 caractères au plus, celles de `criteria.cities` dans
  `SavedSearchCriteria`, pour que toute alerte enregistrée s'ouvre en résultats ; au-delà, ou un
  élément qui n'est pas une chaîne, 422 sur `cities`.
- OU entre les villes, sur la liste (`buildFilter`, inchangé) et sur la carte (`FiltresDeLaCarte`,
  égalité repliée comme pour `city`).
- Front : clé `cities` de `SEARCH_FILTER_KEYS` (liste à virgules dans l'URL, une puce par ville,
  retirable seule sur `/properties`).

## Hypothèses (mode sans humain)

- « valide `cities[]` » est lu comme : la règle juge un tableau de villes. La liste à virgules est
  acceptée en plus, parce que c'est la forme que l'URL du front transmet telle quelle à l'API
  (`parametresDeRecherche`) ; sans elle, le lien de l'alerte rendrait 422.
- La carte applique `cities` : `MapPublicPropertyRequest` hérite des règles de la liste, et
  `MapFiltersParityTest` exige qu'une clé acceptée par la carte y filtre comme en liste.
- Aucun contrôle du panneau de filtres n'écrit `cities` : seul le profil la pose, la page la lit
  et la montre en puces.

## Delta à produire

- [x] `SearchPublicPropertyRequest` : règle `cities` et normalisation de la liste à virgules.
- [x] `FiltresDeLaCarte` : `cities` en OU.
- [x] `takussan-web/src/types/search.ts` : clé `cities`.
- [x] `PropertiesDiscoveryPage` : retirer une puce de ville garde les autres.
- [x] Tests : `RechercheParVillesTest`, ligne `cities` de `MapFiltersParityTest`,
  `SavedSearchesList.villes.tck-2061.test.tsx`, cas de `PropertiesDiscoveryPage.etat-vide`,
  échantillons exhaustifs de `SearchToolbar` et `FilterSidebar.place-des-filtres` complétés.

## Critères d'acceptation

- [x] AC1 — `cities=Dakar,Thiès` et `cities[]=Dakar&cities[]=Thiès` rendent les biens de Dakar et de
  Thiès, pas ceux de Saint-Louis, en liste et en carte.
- [x] AC2 — 21 villes, une ville de 121 caractères ou un élément non textuel rendent 422 sur `cities`.
- [x] AC3 — aller-retour `criteria` → URL → filtres → URL → `criteria` sans perte ; le résumé de
  l'alerte dit « Dakar · Thiès » et son lien porte `cities`.
- [x] AC4 — sur `/properties?cities=Dakar,Thiès`, retirer la puce « Dakar » laisse `cities=Thiès`.

## Hors périmètre

- Un contrôle de saisie de plusieurs villes dans le panneau de filtres.
- `canonique.ts` range `cities` parmi les clés écartées (dérivé) : une page filtrée par villes a
  pour canonique la liste sans elles, comme pour les autres filtres non canoniques.

## Notes d'implémentation

- Ablation API : `SearchPublicPropertyRequest` d'origine → 3 rouges sur `RechercheParVillesTest` ;
  `FiltresDeLaCarte` d'origine → 2 rouges (carte), et la ligne `cities` de `MapFiltersParityTest`
  rouge. Rétabli → verts.
- Ablation front : `search.ts` d'origine → 6 rouges (trois tests neufs, deux de
  `search-filters.parity.test.ts`, le retrait de puce) ; branche `cities` de `retirerFiltre`
  retirée → 1 rouge. Rétabli → verts.
- Piège : la règle tient en **une seule clé** (fermeture sur les éléments, pas de `cities.*`) :
  `MapFiltersParityTest` et `search-filters.parity.test.ts` comparent les clés de `rules()`, et
  `cities.*` y serait lue comme une clé de filtre.
