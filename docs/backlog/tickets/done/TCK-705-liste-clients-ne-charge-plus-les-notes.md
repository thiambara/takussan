---
id: TCK-705
title: "CustomerResource ne charge plus la relation notes ligne par ligne quand la colonne n'est pas lue"
status: done
phase: P3
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#33-customernote-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-20--nombre-réel-de-requêtes-sql-par-écran
tags: [api, crm, performance, pistes]
---

## Contexte

Réf : **P20.01** du fichier de pistes, `retenu · autonome` (classement A2).

`notes` est à la fois une colonne de `customers` (`Customer.php:60`) et une relation `HasMany`
(`Customer.php:273`). `CustomerResource` rendait `'notes' => $this->notes`. Le front ne lit pas la
colonne (`DASHBOARD_CUSTOMER_FIELDS`, `takussan-web/src/lib/queries/customers.ts`), et elle n'est
d'ailleurs pas dans `Customer::$queryFields` : l'attribut était absent, Eloquent retombait sur la
relation et la chargeait paresseusement, une requête `customer_notes` par ligne. La liste rendait
en plus toutes les notes internes de chaque fiche, que personne ne lit.

## Objectif

`CustomerResource` rend la colonne `notes` si elle a été lue, la relation si `include=notes` l'a
chargée, et rien sinon : plus aucune requête de notes par ligne.

## Delta à produire

- [x] `CustomerResource::toArray()` : `notes` sous `when()`, conditionné à la présence de
      l'attribut ou au chargement de la relation.
- [x] Test `tests/Feature/Crm/CustomerIndexQueryBudgetTest.php`.

## Critères d'acceptation

- [x] AC1 — `GET /api/customers` avec les champs et l'`include=tags` du front ne lit
      `customer_notes` ni pour 2 clients ni pour 12.
- [x] AC2 — La même liste ne rend pas de clé `notes`.
- [x] AC3 — Sans `fields[customers]` (colonne lue), `notes` rend la colonne, comme avant.
- [x] AC4 — `GET /api/customers/{id}?include=notes` rend toujours la relation.

## Hypothèses (mode sans humain)

- La piste propose de rendre la relation « sous une autre clé par `whenLoaded`, ou ne plus la rendre
  du tout ». Les deux changent le contrat de `include=notes`, que la fiche du front envoie encore
  (P02.09). Le correctif garde la clé `notes` et ses deux sens actuels, et retire seulement le
  chargement paresseux : c'est le minimum qui ferme le défaut sans choix de contrat.
- Le budget « 2 lignes = 12 lignes » que proposait la piste n'est pas tenable par ce ticket : une
  fois les notes retirées, il reste une lecture `platform_profiles` par ligne (`isSuperAdmin()`,
  pistes P20.03 et P02.03). Le test garde donc les seules lectures de `customer_notes`.

## Hors périmètre

- La requête `platform_profiles` par ligne : P20.03 et P02.03.
- `include=notes` envoyé par la fiche alors que rien ne lit `customer.notes` : P02.09.
- Les notes rendues par `include=notes` restent sérialisées brutes (dates `…000000Z` et non
  `iso()`, ADR-0018) : relevé, non corrigé.

## Notes d'implémentation

- Ablation : `CustomerResource.php` remis à sa version de `pre-dev` → 2 rouges
  (`test_la_liste_ne_lit_aucune_note` : « 2 is identical to 0 » ; `…ne_rend_pas_les_notes…` :
  clé `notes` présente) ; correctif remis → 4 verts.
- `fields[customers]=id,notes` rend 400 : la colonne n'est pas dans `$queryFields`. AC3 se teste
  donc sans `fields`.
