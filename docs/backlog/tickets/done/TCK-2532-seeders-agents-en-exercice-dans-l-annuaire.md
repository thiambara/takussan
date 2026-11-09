---
id: TCK-2532
title: "Seeders : des biens publics rattachés à des agents en exercice, pour que la démo montre un annuaire d'agents"
status: done
phase: P1
family: back
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2506]
blocks: [TCK-2521]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
tags: [back, seeders, directory, demo, audit-ux]
---

## Objectif utilisateur

Quiconque ouvre la démo (préproduction, poste de développement après `migrate:fresh --seed`) voit sur
`/fr/agents` un annuaire **d'agents en exercice**, comme la maquette de TCK-2521 le montre, et non une
page vide.

## Constat (mesuré le 2026-11-09, base de dev seedée, arbre de la vague 1)

- **L'annuaire est vide depuis TCK-2506** : `GET /api/public/agents?per_page=48` → `total 0`. Avant
  TCK-2506, il listait 44 lignes, **toutes de rôle `owner`** et aucune `agent`.
- La raison est dans le seeder qui pose le titulaire des biens :
  [`PropertySeeder.php:40`](../../../../takussan-api/database/seeders/Catalog/PropertySeeder.php)
  tire `$owners = $this->ctx->usersWithProfile(OwnerProfile::class, $agency->id)`, puis `:60`
  `$ownerIds`, `:70` `$ownerId = Tirage::un($ownerIds)` et `:175` `'user_id' => $ownerId`. **Tout bien a
  pour `properties.user_id` un titulaire d'`OwnerProfile`**, jamais un agent.
- [`PropertyCollaboratorSeeder.php:24-52`](../../../../takussan-api/database/seeders/Catalog/PropertyCollaboratorSeeder.php)
  rattache bien des agents (`AgentProfile`) à environ 40 % des biens, mais **en collaborateurs**
  (`property_collaborators`), que l'annuaire ne lit pas. `PublicAgentController::index` exige
  `whereHas('properties', publicPortfolio())`, c'est-à-dire `properties.user_id`.
- Comptes : 20 agents actifs (`AgentProfile` actif), 6 admins d'agence `standard` actifs, 247 biens
  du portefeuille public. **0** de ces biens a pour `user_id` un agent actif. Les 20 agents
  collaborent tous sur au moins un bien public.

## Contrat

- Les seeders produisent, pour chaque agence `standard` qui a des agents, des biens du portefeuille
  public dont `properties.user_id` est un agent **en exercice** (`AgentProfile` actif, agence active).
  Ordre de grandeur : la majorité des agents actifs, avec plusieurs biens chacun, pour que
  l'annuaire de TCK-2521 ait de quoi trier et paginer.
- Les propriétaires gardent leurs biens. Une partie d'entre eux reste **non listée** (défaut de
  TCK-2506), et quelques-uns ont `listed_in_public_directory = true`, pour que la démo montre aussi
  le cas « propriétaire qui l'a choisi ».
- Aucun changement de code applicatif : seulement les seeders (`database/seeders/`). Le tirage
  reste déterministe (`Tirage`).

## Critères d'acceptation

- [ ] Après `php artisan migrate:fresh --seed`, `GET /api/public/agents` rend un `total` non nul, et
      chaque ligne de rôle `agent` correspond à un `AgentProfile` actif d'une agence active.
- [ ] `/fr/agents` affiche des agents en exercice sur la démo, au téléphone et au bureau.
- [ ] Au moins un propriétaire `listed_in_public_directory = true` paraît dans l'annuaire, et les
      propriétaires non listés n'y paraissent pas (la règle de TCK-2506 tient sur les données seedées).
- [ ] Une recette d'API (test de seeder ou de feature) garde le compte non nul d'agents dans
      l'annuaire après le seed, vérifiée par ablation : retirer le rattachement aux agents la fait
      rougir.

## Hors périmètre / à trancher avant d'implémenter

- **Une alternative de produit, pas de seeder** : faire lire à l'annuaire les biens dont un agent est
  **collaborateur** (`property_collaborators`), et non seulement ceux dont il est titulaire. Les 20
  agents de la démo y apparaîtraient sans toucher aux seeders. Mais c'est un changement de règle
  publique, qui touche `PublicAgentController`, le sitemap et les compteurs de TCK-2518. Ce ticket ne
  le fait pas ; s'il est retenu, il faut un ticket à part et une mise à jour de
  `docs/features.md#12`.
- Le sens de `properties.user_id` (le bailleur, depuis TCK-142) ne change pas : un agent titulaire
  d'un bien de démo est un agent qui met **son propre** bien en annonce, ce qui est un cas réel.

## Notes d'implémentation

**Re-mesuré le 2026-11-09 (agent console, vague 2)** : `GET /api/public/agents?per_page=48` sur la
base de dev → `total 0` (confirmé). Les lignes citées (`PropertySeeder.php:40/60/70/175`) étaient
justes. La base de dev partagée N'EST PAS celle du seeder courant (agence 4 `individual` avec 5
agents et 214 biens : semée avant TCK-2378) — elle n'a pas été re-semée (`migrate:fresh` interdit
sur la base partagée) : l'AC « après `migrate:fresh --seed` » est éprouvée par le test, sur une base
de test, et `/fr/agents` sur la démo reste à voir après le prochain seed.

- **Un bien sur trois** (`PropertySeeder::AGENT_TITULAIRE_UN_SUR`) a pour titulaire un agent EN
  EXERCICE de l'agence (le parti — `ctx->departs`, profil suspendu — est écarté), arrivé AVANT la
  création du bien. Choix par **tourniquet**, sans tirage : le tirage d'origine du bailleur est
  conservé, pour ne pas décaler la graine de tout le pipeline (TCK-2380).
- `PropertyCollaboratorSeeder` ne fait plus d'un agent le collaborateur du bien dont il est
  titulaire ; ses trois tirages par ligne sont faits AVANT la garde, dans l'ordre d'origine.
- `UserSeeder` : le premier bailleur de chaque agence a `listed_in_public_directory = true`
  (sans tirage) ; les autres restent non listés.
- Conséquence assumée : un bail sur un bien d'agent a cet agent pour bailleur (`landlord_id =
  property.user_id`), avec ses reversements — le cas réel de l'agent qui loue son propre bien.
- Garde : `tests/Feature/Database/Seeders/SeededAgentDirectoryTest.php` sème le PIPELINE entier
  (1 agence, 40 biens, contrats non figés) puis lit l'annuaire. **Coût : 260 s sous `load average`
  ~20** (34 s de CPU) — le prix d'un pipeline complet, comme `SeedingInvariantsTest`.
- Ablations (2026-11-09) : rattachement retiré → « Aucun agent » (0) ; un bien sur 50 → « 3 agents
  listés sur 12 en exercice » ; aucun propriétaire listé → rouge ; tous listés → rouge. Toutes
  restaurées par `cp`, md5 identique.
- Tests de seeders rejoués après la modification, tous verts : `UserSeederProfilesTest`,
  `PropertyCollaboratorSeederTest`, `SeedingInvariantsTest` (6, dont l'intégrité du jeu par
  `ReferentialIntegrityChecker`), `SeededAddressesAttachedTest`, `FilterCoverageTagsTest`,
  `SeedingJourneyTest`, `SeedingFeatureTablesTest`, `SeedingGrowthTest`. ⚠
  `SeedingTextAndDeterminismTest::test_la_meme_graine_rejoue_le_meme_jeu…` a rougi UNE fois
  (531 s, `load average` ~30) puis est passé vert, seul, sur le même arbre (320 s) : intermittent,
  table fautive non relevée (la sortie ne la nommait pas dans le journal tronqué).
- **Revue adverse — les deux règles du tourniquet gardées**, dans `SeededAgentDirectoryTest`
  (`assertTourniquetDesTitulaires()`), sur le jeu que ce test sème déjà : aucun seed de plus en CI. Un
  premier test séparé (`PropertyHolderRotationTest`, seeders du tourniquet seuls) a été retiré à la
  demande de la revue. Le test vérifie d'abord que chaque cas se produit : des biens tenus par un agent,
  au moins un départ (les partis de `SeedingContext::$departs` sont exactement les profils suspendus) et
  un agent arrivé après le premier bien. Puis : (1) aucun bien n'a pour titulaire un parti ; (2) aucun
  bien n'est né avant l'arrivée de son agent titulaire. Vert : 34 assertions, 155 s sous `load average`
  ~21-33. Ablations, chacune seule : `->reject(departs)` retiré → rouge « Des biens ont pour titulaire un
  agent parti » ; filtre `created_at <= createdAt` retiré → rouge « Des biens sont nés avant l'arrivée de
  leur agent titulaire ». `PropertySeeder.php` restauré par `cp` après chacune (md5 43bb8255…).
  ⚠ Jouer les seeders hors `db:seed` demande `Model::unguarded()` : sans lui, `updateOrCreate()` écarte le
  `created_at` d'arrivée et aucun bien ne va à un agent (mesuré avec le test séparé).
