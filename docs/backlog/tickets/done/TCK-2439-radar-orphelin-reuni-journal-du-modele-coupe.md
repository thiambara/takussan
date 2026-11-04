---
id: TCK-2439
title: "Radar : la réunion d'un compte orphelin déplace ses biens journal du modèle coupé, et la réparation des réattributions ne les liste plus"
status: done
phase: P3
family: bug
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, journal, adr-0059]
---

## Objectif utilisateur

L'équipe qui joue `properties:repair-reassigned-owners` ne voit que de vraies réattributions : un bien
qu'un titulaire a retrouvé par la réclamation du Radar n'apparaît pas dans sa liste à revoir.

## Contexte

Relevé par la vérification adverse de TCK-2421 (point 5). `RadarClaims::absorbOrphan()` (TCK-2390,
`cc0e8f0af`) réunit au titulaire vérifié du numéro le compte du Radar qui n'a jamais servi (A) : ses
biens passent dans l'espace du titulaire, puis A se supprime (suppression douce). Le déplacement
écrivait `properties.user_id` **journal du modèle ouvert** : chaque bien laissait une entrée
`activity_log` `Property` / `updated` dont `old.user_id` ≠ `attributes.user_id`.

C'est exactement la signature que lit `properties:repair-reassigned-owners` (TCK-603, ADR-0059 § 5) pour
retrouver les biens « réattribués » par l'ancien `assignAgent`. Mesuré avant le correctif : le bien
déplacé y sort en `review property=… reason=original_missing` (A est supprimé), et la commande ne le
rend jamais. La trace est polluée, et une personne doit écarter la ligne à la main.

ADR-0059 § 4 pose déjà la règle : toute autre écriture de `user_id` se fait journal du modèle coupé,
sous son propre évènement — c'est ce que font la passation (`AgentHandoverService`), le transfert de
titulaire (`PropertyOwnerTransfer`), la réparation elle-même et la reprise sous mandat (TCK-2421).
`absorbOrphan()` était le seul écart. Son évènement propre existe déjà : `radar_orphan_absorbed`, qui
porte `moved_property_ids`.

## Delta à produire

- `RadarClaims::absorbOrphan()` : `$property->disableLogging()` avant l'écriture de `agency_id` et
  `user_id`. Rien d'autre ne change ; le journal `radar_orphan_absorbed` reste la trace du déplacement.

## Critères d'acceptation

1. Après la réunion d'un orphelin, aucune entrée `Property` / `updated` n'existe pour le bien déplacé ;
   `radar_orphan_absorbed` porte toujours son id dans `moved_property_ids`.
2. `properties:repair-reassigned-owners --dry-run` ne liste pas le bien (`owners_to_review=0`).

Prouvés par `RadarClaimTest::test_le_deplacement_des_biens_de_l_orphelin_n_est_pas_lu_comme_une_reattribution`,
rouge sans le correctif sur chacun des deux critères (le second mesuré seul, le premier retiré).

## Hors périmètre

- Les entrées `updated` déjà écrites sur un environnement : aucune production API n'existe, et la
  préproduction n'a pas encore le code du Radar (dernier déploiement c9dcc3335, 2026-10-26). Rien à
  nettoyer à ce jour.
- Les autres écritures de `absorbOrphan()` (demandes, prospects, visites, réservations, conversations)
  passent par le constructeur de requêtes et ne journalisent rien : inchangées.

## Notes d'implémentation

Livré dans la branche de TCK-2421 (`feat/radar-reprise-sous-mandat`), en commit séparé, parce que le
correctif tient en une ligne et suit le patron des quatre autres écritures de `user_id`.
