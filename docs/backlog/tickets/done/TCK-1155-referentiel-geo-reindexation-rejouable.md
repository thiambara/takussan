---
id: TCK-1155
title: "Référentiel géographique : une réindexation en échec se rejoue au déploiement suivant"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-89--commandes-de-releasesh-et-seedsh--code-de-sortie-et-conclusion-du-script"
tags: [back, geo, search, release, pistes]
---

## Contexte

Réf : **P89.01** du fichier de pistes (🔴), `validé`.

`GeoReferentialLoader::charger()` validait une transaction par région, et `GeoReferentialSync`
ne réindexait les biens renommés qu'après toutes les régions. Un moteur en panne à ce moment
laissait le nouveau nom écrit en base sans l'index ; au passage suivant, `isDirty('name')` était
faux, rien n'était réindexé, et l'index gardait l'ancien nom pour toujours. `release.sh` annonçait
pourtant « référentiel géographique inchangé jusqu'au prochain déploiement ».

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste propose deux voies sans en recommander une : persister les
biens à réindexer, ou réindexer région par région avant de valider, et faire forcer une
importation complète par `release.sh`. Retenue, la plus étroite : **réindexer chaque région dans
sa propre transaction, avant qu'elle soit validée**. Un échec du moteur annule la région, dont le
renommage reste donc à faire au passage suivant, qui le réindexe : aucune table de reprise
(pas de schéma), aucune importation forcée. Le rattachement des adresses (`GeoAddressAttacher`),
qui avait le même défaut, se joue de même dans une transaction avec sa réindexation.

## Delta à produire

- [x] `GeoReferentialLoader` reçoit `GeoReindexation` et réindexe les biens renommés de la région
      dans sa transaction.
- [x] `GeoReferentialSync::executer()` : rattachement et réindexation dans une même transaction.
- [x] `docker/release.sh` : le message d'échec dit ce qui reste (régions validées chargées et
      indexées, le reste rejoué au déploiement suivant).
- [x] Deux tests dans `tests/Feature/Geo/GeoReferentialRealignementTest.php`.

## Critères d'acceptation

- [x] AC1 — jeu v1 chargé, bien « Point E » indexé ; le jeu qui renomme le quartier en
      « Point E Amitié » joué avec un client Meilisearch injoignable échoue ; rejoué moteur
      rétabli, l'index rend le bien sur « Point E Amitié » et plus sur « Point E ».
- [x] AC2 — même scénario pour le jeu v2 qui ajoute « Liberté 5 » : après l'échec puis le second
      passage, l'index rend le bien sur le `geo_neighborhood_id` du nouveau quartier.

## Hors périmètre

- La commande n'attrape toujours que `RuntimeException` et `JsonException` (P89.05, même lot) : une
  `Meilisearch\Exceptions\CommunicationException` sort encore sur une trace, le code de sortie
  restant 1.
- Une région qui échoue garde son retard jusqu'au déploiement suivant ; aucune relance entre deux.

## Notes d'implémentation

- Ablation : réindexation retirée de la transaction du chargeur, et rattachement sorti de sa
  transaction → 4 rouges sur 7 (les deux tests neufs, et les deux renommages de TCK-787, qui ne
  sont plus réindexés du tout) ; correctif remis → 7/7.
- Le client se remplace par `app()->instance(Client::class, …)` puis
  `EngineManager::forgetDrivers()` : sans ce dernier, le moteur déjà construit garde l'ancien
  client.
- Sous `RefreshDatabase`, la transaction de région est un point de sauvegarde : son annulation
  s'observe quand même.
