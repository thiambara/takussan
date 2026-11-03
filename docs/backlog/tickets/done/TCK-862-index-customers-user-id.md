---
id: TCK-862
title: "`customers` : un index sur `user_id`, lu par la dérivation `tenant` de `/api/auth/me`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes"
tags: [back, index, performance, pistes]
---

## Objectif utilisateur

La dérivation du rôle `tenant`, jouée à chaque `/api/auth/me`, retrouve les dossiers client d'un
utilisateur par un index, sans relire toute la table `customers`.

## Contexte

Réf : **P02.04** du fichier de pistes, `retenu · autonome` (A2 pour la seule partie
`customers.user_id`, A6 pour le docblock).

`HasProfiles::hasActiveTenantLease()` joint `customers ⋈ leases` sur `customers.user_id`. PostgreSQL
n'indexe pas une clé étrangère (piège n° 8 de `takussan-api/CLAUDE.md`), et aucune migration ne
posait cet index. Le docblock de `profileTypes()` affirmait le contraire.

## Contrat de données

- Migration neuve `index_customers_on_user_id` : index `customers_user_id_index` sur `(user_id)`,
  `down()` qui le retire.

## Contraintes strictes (métier)

- Aucun résultat ne change : ajout d'index seul.

## Delta à produire

- [x] Migration d'ajout d'index (neuve), avec son `down()`.
- [x] Docblock de `HasProfiles::profileTypes()` ramené au schéma.
- [x] Test : `Tests\Feature\Database\CustomersUserIdIndexTest` (index présent, plan de la requête
  de `hasActiveTenantLease()` par l'index).

## Critères d'acceptation

- [x] AC1 — l'index `customers_user_id_index` sur `(user_id)` existe.
- [x] AC2 — la requête de `tenantLeases()` filtrée sur les statuts actifs lit `customers` par cet
  index, sans `Seq Scan on customers`.

## Hors périmètre

- Les 109 autres clés étrangères sans index relevées par P02.04 : chacune demande son `EXPLAIN`,
  et plus d'un ticket. L'entrée passe à `fait — reste`.
- `models-spec.md` § 7 : à compléter par `/sync-specs` si elle liste les index (spec fermée à
  l'agent).

## Notes d'implémentation

- Ablation : la migration retirée, les deux tests rougissent (index absent ; plan sans l'index) ;
  remise, verts.
- Le test du plan pose `SET LOCAL enable_seqscan = off` : sur une table de test de 31 lignes, le
  moteur balaierait quel que soit l'index.
