---
id: TCK-986
title: "Une garde refuse toute relation qui porte le nom, ou le nom snake_case, d'une colonne de sa table"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#40-bankstatement-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-58--colonnes-absentes-du-sparse-fieldset--relation-valeur-par-défaut-ou-null-à-la-place"
tags: [api, models, garde, pistes]
---

## Contexte

Réf : **P58.01** du fichier de pistes, `retenu · autonome` (A5). Une relation homonyme d'une
colonne est une panne silencieuse sous deux formes :

- nom exact (`Customer::notes`) : `$model->notes` retombe sur la relation quand la colonne n'a pas
  été lue, et la charge paresseusement — le N+1 de P20.01, corrigé par TCK-705 ;
- nom `snake_case` (`BankStatement::uploadedBy` / `uploaded_by`) : `Model::toArray()` fusionne les
  attributs puis les relations nommées en `snake_case`, et la relation chargée écrase
  l'identifiant dans toute sérialisation brute.

Rien ne garde la règle. Re-mesuré le 2026-10-19 sur `pre-dev` 99abff99b par le test ci-dessous,
liste d'exceptions vide : 7 collisions (1 exacte, 6 `snake_case`), les mêmes que le mesureur.

## Objectif

Une collision neuve entre une relation et une colonne rougit en CI au lieu d'attendre sa mesure.

## Delta à produire

- [x] Tests: `tests/Feature/Models/RelationSansCollisionDeColonneTest.php` — balayage par réflexion
      de `app/Models` (méthodes publiques sans paramètre dont le type de retour est une `Relation`),
      confronté à `Schema::getColumnListing` ; exceptions justifiées pour les 7 paires existantes ;
      plancher de plausibilité ; une exception qui ne collisionne plus rougit.

## Critères d'acceptation

- [x] AC1 — Sur l'arbre actuel, le test est vert et chacune des 7 exceptions est encore une collision.
- [x] AC2 — Une relation neuve au nom `snake_case` d'une colonne (ablation : `Document::verifier`
      renommée `verifiedBy`) fait rougir le test en la nommant.

## Hypothèses (mode sans humain)

- Seules les relations à type de retour déclaré sont vues : c'est la convention du dépôt (le
  plancher de plausibilité rougit si le balayage n'en voit presque plus).
- Les 7 collisions existantes restent : les renommer toucherait les `include=` publics.

## Hors périmètre

- Le renommage des six relations `fooBy` (`uploader`, `finalizer`…) : il change des `include=`
  publics.

## Notes d'implémentation

- Avant : liste d'exceptions vide → rouge, 7 collisions nommées.
- Ablation : `Document::verifier` renommée `verifiedBy` → rouge (`Document::verifiedBy ↔ colonne
  verified_by`) ; remise en place → vert.
- `AppNotification::deliveryAttempts`, `BankStatementLine::confirmedBy` et
  `Lease::earlyTerminationRequestedBy` ne sont chargées nulle part dans `app/` (grep) : leur
  exception le dit.
