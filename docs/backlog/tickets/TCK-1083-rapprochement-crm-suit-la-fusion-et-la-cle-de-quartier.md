---
id: TCK-1083
title: "Le rapprochement CRM juge les quartiers comme la recherche publique : référentiel, fusion suivie, clé sans accent"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-récapitulatif-crm-ne-rapproche-plus-un-prospect-dun-bien-dont-le-quartier-a-été-fusionné-ou-renommé"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-rapprochement-crm-ne-reconnaît-pas-liberte-4-pour-liberté-4-que-la-recherche-publique-confond"
tags: [back, crm, referentiel, pistes]
---

## Objectif utilisateur

L'agent voit toujours les biens qui correspondent à son prospect, et le récapitulatif quotidien
les lui cite, quand la console a fusionné le quartier du bien ou quand le prospect l'a écrit sans
accent ni tiret (« Liberte 4 » pour « Liberté 4 »).

## Contexte

Réfs : **P67.04** et **P67.05** du fichier de pistes, `validé` : même cause (le rapprochement
compare le texte `addresses.neighborhood`, replié par casse seule) et même correctif, un ticket
pour les deux. Critère accordé : V7 (choix entre deux voies, et extension de la clé
`CleDeQuartier` au CRM).

`ProspectMatcher::propertiesFor()` et `customersFor()` comparaient `customers.seeking_neighborhoods`
au texte de l'adresse. La fusion réécrit ce texte vers la cible ; la saisie du prospect est libre.
Mesuré avant correctif (tests de garde ci-dessous, sur `pre-dev` 3eff8de82) :
- prospect `["Liberte Quatre"]`, bien rattaché à ce quartier : 1 et 1 ; fusion dans « Liberté 4 »,
  puis `propertiesFor` ne rend plus le bien (rouge l. 105 du test) ;
- prospect `["Liberte 4", "grand yoff"]`, un bien rattaché à « Liberté 4 » et un bien libre
  « Grand-Yoff » : `propertiesFor` → `[]`.

## Décision du porteur

P67.04 :

> (a) comparer par la clé `CleDeQuartier` et les identifiants du référentiel, comme `QuartierDuFiltre`, fusion suivie ; test : fusion, puis `customersFor` (porteur, 2026-10-20)

P67.05 :

> couvert par P67.04 : la clé `CleDeQuartier` au rapprochement CRM, en PHP sans `unaccent`, et le docblock de `ProspectMatcher` corrigé ; test : graphie sans accent ni tiret (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- « Comme `QuartierDuFiltre` » se lit au sens strict : une adresse **rattachée** se juge par son
  `geo_neighborhood_id` (les quartiers que la saisie désigne, `idsDuReferentiel()`), une adresse
  **non rattachée** par la clé de son texte (`textesLibres()`). Le matcher appelle ces deux
  méthodes au lieu d'en recopier la règle : ce que P67.02 (TCK-1080, PR #851) y ajoute, les
  anciens noms d'un renommage, s'appliquera au CRM sans autre changement.
- `customersFor()` ne peut pas calculer la clé en SQL (pas d'`unaccent`) : les prospects de
  l'agence qui demandent des quartiers sont jugés en PHP, et retenus par identifiant. Une
  agence a peu de prospects à critère de quartier ; la résolution d'une saisie est retenue par
  instance du matcher, que le récapitulatif quotidien réutilise pour tous les biens.
- Les villes gardent leur comparaison repliée par casse (ADR-0025) : la décision ne porte que sur
  les quartiers.

## Delta à produire

- [x] `ProspectMatcher::propertiesFor()` : le critère de quartier passe par `QuartierDuFiltre`.
- [x] `ProspectMatcher::customersFor()` : le sens inverse de la même règle.
- [x] Docblock de `ProspectMatcher` corrigé.
- [x] Tests `ProspectMatcherTest::test_a_merged_neighborhood_still_matches_both_ways` et
  `test_a_neighborhood_written_without_accent_or_hyphen_matches`.

## Critères d'acceptation

- [x] AC1 — après la fusion de « Liberte Quatre » dans « Liberté 4 », le prospect qui demande
  l'ancien nom et le bien se rapprochent dans les deux sens, route `matching-customers` comprise.
- [x] AC2 — « Liberte 4 » trouve un bien rattaché à « Liberté 4 », « grand yoff » un bien libre
  « Grand-Yoff », et « Grand Dakar » ne sort pas.
- [x] AC3 — les tests existants du rapprochement et du récapitulatif restent verts.

## Hors périmètre

- Un quartier **renommé** : couvert par P67.02 (TCK-1080), qui fait lire les anciens noms à
  `idsDuReferentiel()`. Sans lui, un prospect qui garde l'ancien nom d'un quartier renommé ne le
  retrouve pas plus que la recherche publique.
- La réécriture de `seeking_neighborhoods` (voie non retenue).

## Notes d'implémentation

- Ablation : l'appel à `whereNeighborhoodAccepts()` de `customersFor()` remplacé par l'ancien
  `whereListAccepts(…, 'seeking_neighborhoods', …)` → 2 rouges (les deux tests, sur
  `customersFor`) ; remis → 6 verts. Le fichier d'origine entier remis → 2 rouges (l. 105 après
  fusion, l. 94 sur la graphie).
- La fabrique d'adresses tire un quartier au hasard : l'aide `property()` du test ne surcharge
  `neighborhood` que s'il est donné.
