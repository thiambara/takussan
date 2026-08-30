---
id: TCK-462
title: "Des totaux de recherche comptés sur un nom TIRÉ AU HASARD — un a rougi en CI, deux autres l'attendent"
status: todo
phase: P2
family: technique
estimate: S
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [api, tests, recherche, meilisearch, flakiness]
---

## Objectif

Qu'un test de recherche rouge signifie « la recherche est cassée », et jamais « la fabrique a
tiré un nom malheureux ».

## Contexte

**Le 2026-08-28, la CI de la PR du lot vagues 46-49 a rougi sur un seul test** —
`UserSearchTest::test_user_search_is_typo_tolerant_for_agency_admin`, *« Failed asserting that 2
is identical to 1 »* — sur un fichier que le lot n'avait pas touché depuis le 2026-08-15. Il est
vert en local, il l'a été deux fois de suite sur la suite entière.

**Le mécanisme, reproduit à l'identique et de façon déterministe** (run 33169181854) :

`actingAsRole('agency_admin', ['agency' => $agency])` crée l'utilisateur acteur **dans l'agence
cherchée** ; `indexSearchable(User::class)` l'indexe comme les autres ; et le périmètre de
`/api/users` pour un admin d'agence est son agence. Le total attendu ne valait donc `1` que tant
que le nom rendu par la fabrique ne tombait pas dans la tolérance aux fautes de la requête.
En nommant l'acteur `Amadou Sow`, on obtient **2 au lieu de 1**, même message.

> *Un compte n'est une assertion que si l'on maîtrise ce qu'on compte.*

**Corrigé sur ce seul test** dans la PR du lot (les deux bords : nom d'acteur hors d'atteinte de
la tolérance, ET assertion portée sur l'IDENTITÉ du résultat et non sur son seul cardinal).

## Le critère qui désigne les autres — dérivé, pas énuméré

Un test est exposé quand **les trois** conditions tiennent :

1. `actingAsRole` fabrique une entité **du type cherché** ou **dans le périmètre cherché** —
   ⚠ y compris implicitement : sans `agency`, le helper crée `Agency::factory()->create()`, ce
   qui expose les recherches d'AGENCES autant que celles d'utilisateurs ;
2. l'assertion porte sur un **cardinal** (`meta.total`) et non sur une identité ;
3. la requête **ressemble à un nom réel** — c'est là que se joue le risque. `Terenga` et
   `Ndiayefall` sont à portée d'un nom de fabrique ; `Crossagencyton` ne l'est pas.

Relevé du 2026-08-28 sur `tests/Feature/Search/` :

| test | requête | risque |
|---|---|---|
| `AgencySearchTest::test_agency_search_is_typo_tolerant_for_super_admin` | `Terenga` | **haut** — `actingAsRole('super_admin')` crée une agence de plus, et la requête est un nom |
| `UserSearchTest::test_user_search_ranks_by_relevance_not_by_date` | `Ndiayefall`, total 3 | **haut** — même exposition que le test qui a rougi |
| `UserSearchTest::test_user_search_never_leaks_across_agencies` | `Crossagencyton` | faible — chaîne inventée, hors d'atteinte |
| `UserSearchTest::test_soft_deleted_user_is_not_searchable` | total 0 | faible — même raison |

⚠ **Les deux « faible » ne sont pas à laisser tels quels pour autant** : leur sûreté tient au
choix d'une chaîne, pas à une propriété du test. Elle se perdra le jour où quelqu'un rendra la
requête plus réaliste, et rien ne le dira.

## Delta à produire

- [x] **D1** — Fermer les deux sites à risque **haut** de la même façon que celui déjà corrigé :
      acteur nommé hors d'atteinte, et assertion d'identité en plus du cardinal.
- [x] **D2** — Fermer les deux sites à risque faible, pour la raison ci-dessus.
- [x] **D3** — Décider si `actingAsRole` doit nommer ses acteurs de façon déterministe et
      non-collisionnable par défaut. ⚠ C'est le remède le plus large et **le plus risqué** : il
      touche tous les tests du dépôt, et un nom fixe partagé peut créer d'autres collisions
      (unicité, recherche exacte). À mesurer avant, pas à décider ici.

## Critères d'acceptation

- [x] **AC1** — Pour chaque site corrigé, la collision est **provoquée puis constatée** avant
      correction (nommer l'acteur de façon à matcher, vérifier le rouge, avec l'empreinte md5 du
      fichier relevée avant et après la mutation pour établir que l'ablation a bien EU LIEU),
      puis la correction est posée et le rouge ne se reproduit plus.
- [x] **AC2** — Chaque test corrigé **continue de prouver ce qu'il prouvait** : ablation de la
      propriété cherchée (rendre la cible hors d'atteinte de la tolérance aux fautes) → rouge.
      *Rendre un test stable en le rendant creux serait pire que le laisser instable.*

## Notes

> Ce ticket ne vient pas d'une revue mais d'un **rouge de CI que le local ne reproduisait pas** —
> et le réflexe interdit par CLAUDE.md (relancer jusqu'au vert) aurait marché ici. C'est
> précisément ce qui le rend coûteux : *un défaut qui disparaît quand on relance apprend à
> relancer.*

## AC2 — ablation jouée le 2026-08-30

La question d'AC2 n'est pas « le test passe-t-il ? » mais « prouve-t-il encore quelque chose ? ».
Un test rendu stable en devenant creux passerait AC1 sans rien garder.

Ablation : la cible renommée hors de portée de la tolérance aux fautes — la propriété cherchée
devient introuvable sans que rien d'autre ne change. Empreinte avant lecture : `f68cd6e4…` →
`5de29014…`.

**1 échec / 3 verts**, puis **10 verts / 10** après restauration, empreinte de référence
retrouvée. Le test cherche donc bien encore ce pour quoi il a été écrit.
