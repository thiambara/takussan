---
id: TCK-1165
title: "Une région renommée par le jeu réécrit le texte region des adresses et réindexe"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1155]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-99--critères-de-ville-et-de-région-rangés-par-nom-face-au-chargeur-du-référentiel"
tags: [back, geo, search, pistes]
---

## Contexte

Réf : **P99.03** du fichier de pistes (🔴), `validé`.

`GeoReferentialLoader::chargerRegion()` mettait la région à jour par `updateOrCreate`, sans
toucher le texte `addresses.region`. Une adresse existante gardait l'ancien nom, une adresse
neuve recevait le nouveau (règle 5 de `GeoAddressCanonicalizer`), et `region=<nouveau nom>` ne
trouvait plus les biens existants. ADR-0062 §4 veut que `region`, `city` et `neighborhood`
reçoivent les noms canoniques du référentiel ; TCK-787 l'a fait pour la ville et le quartier.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste n'offre qu'une voie : mise à jour SQL des adresses
rattachées aux villes de la région, comme `reecrireVille()`, et leurs biens ajoutés à
`biensRenommes` (réindexés dans la transaction de la région depuis TCK-1155).

## Delta à produire

- [x] `chargerRegion()` : `firstOrNew` + `fill`, pour savoir si le nom change ; `reecrireRegion()`
      sinon rien.
- [x] Test `test_une_region_renommee_par_le_jeu_reecrit_l_adresse_et_reindexe`.

## Critères d'acceptation

- [x] AC1 — jeu v1, bien à Dakar (`region` = « Dakar ») ; jeu rejoué deux fois avec la région
      nommée « Dakar Région » : l'adresse porte « Dakar Région », sa ville et son quartier
      inchangés ; l'index rend le bien sur `region = Dakar Région` et plus sur « Dakar ».

## Hors périmètre

- Une adresse rattachée dont le texte `region` est nul n'est pas réécrite (même condition que
  `reecrireVille()` sur `city`).
- L'ancien nom de la région ne répond plus (aucun `former_names` pour les régions) ; P99.01 traite
  la question pour les villes.

## Notes d'implémentation

- Ablation : appel de `reecrireRegion()` retiré → le test rougit sur le texte de l'adresse ;
  remis → 8/8 dans la classe, 11/11 dans `GeoReferentialSeederTest`.
