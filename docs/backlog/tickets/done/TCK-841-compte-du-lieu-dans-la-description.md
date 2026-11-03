---
id: TCK-841
title: "Pages de ville et de quartier : le nombre de biens du lieu dans la description"
status: done
phase: P2
family: front
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#aucune-page-de-ville-ou-de-quartier-ne-porte-de-texte-propre--title-h1-et-description-sortent-dun-seul-gabarit"
tags: [front, seo, facettes, i18n, pistes]
---

## Contexte

Réf : **P35.03** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

Ce qui distingue une page de ville d'une autre se réduisait au nom du lieu dans trois gabarits
(`titleCity`, `titleQuarter`, `description`). `cities()` et `neighborhoods()` servent pourtant
déjà le compte de biens publics de chaque lieu, en cache côté front.

## Décision du porteur

palier 1 : le nombre de biens du lieu dans la description ; reste : le palier 2 (colonne de présentation), plus tard

## Reste à faire

le palier 2 (colonne de présentation), plus tard

## Objectif utilisateur

La description d'une page de ville ou de quartier dit combien de biens publiés le lieu compte.

## Contrat de données

- `GET /api/public/properties/cities` et `…/neighborhoods?city=` (existants), par les mêmes URL et
  options que `villesAvecComptes` et `quartiersDeLaVille` : mêmes entrées du cache de données.

## Delta à produire

- [x] `compteDuLieu(ville, quartier?)` (`lib/queries/facettes.ts`) : le compte du lieu, `undefined`
  s'il est absent ou si le domaine est indisponible.
- [x] `titreEtDescription(params, domaines, compteDuLieu?)` : avec une ville retenue et un compte,
  la description passe par `meta.propertiesFiltered.descriptionWithCount`.
- [x] `generateMetadata` de la liste calcule le compte du lieu retenu par la canonique.
- [x] Clé `descriptionWithCount` en `fr` et `en` ; en `wo`, le texte français tel quel (wolof en
  pause depuis le 2026-10-16).

## Critères d'acceptation

- [x] AC1 — `?type=villa&contract_type=rent&city=Dakar`, 198 biens : « Villa à louer à Dakar sur
  Takussan, parmi 198 biens publiés à Dakar : … ».
- [x] AC2 — `?city=Dakar&location=Ngor`, 4 biens : « … parmi 4 biens publiés à Ngor, Dakar … » ;
  singulier pour 1 ; « 198 listings in Dakar » en anglais.
- [x] AC3 — Sans compte, ou sans lieu retenu : la description d'avant.

## Hors périmètre

- Le palier 2 (colonne de présentation par lieu, migration et texte rédigé) : reste du porteur.
- Le `<title>` et le `<h1>` ne changent pas.

Hypothèse (mode sans humain) : le compte est celui de tout le lieu, pas de la sélection du titre
(une page « Villa à louer à Dakar » dit « parmi 198 biens publiés à Dakar ») — c'est le chiffre que
le domaine sert, et « parmi » évite de le faire passer pour le nombre de villas.

## Notes d'implémentation

- Ablation : `generateMetadata` sans le compte → le test de `metadata.test.ts` rougit (1) ;
  `titreEtDescription` sans la branche du compte → 4 rouges ; remis → 52 verts.
- En `wo`, une page de ville porte désormais la description française (clé neuve, texte français
  tel quel) au lieu de la description wolof sans compte.
