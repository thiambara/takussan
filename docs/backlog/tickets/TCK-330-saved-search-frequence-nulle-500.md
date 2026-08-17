---
id: TCK-330
title: "Créer une recherche sauvegardée avec une fréquence d'alerte vide rend 500"
status: todo
phase: P1
family: bug
estimate: S
wave: null
created: 2026-08-17
updated: 2026-08-17
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#23-savedsearch-
tags: [back, validation, recherche-sauvegardee, bug]
---

## Objectif utilisateur

Qu'un utilisateur qui crée une recherche sauvegardée sans choisir de fréquence d'alerte obtienne
une réponse qu'il peut comprendre et corriger, au lieu d'une erreur serveur.

## Contrat de données

Aucun modèle nouveau. **Trois faits mesurés le 2026-08-17**, tous sur `saved_searches` :

| Requête | Envoi | Réponse mesurée |
|---|---|---|
| `POST /api/saved-searches` | `notification_frequency: ""` | **500** |
| `PUT /api/saved-searches/{id}` | `notification_frequency: ""` | **422** |
| `POST /api/saved-searches` | `notification_frequency: "none"` — *la valeur écrite dans la spec* | **422** |

**La mécanique du 500.** La colonne est `string()->default('daily')`, donc **NOT NULL**
(`database/migrations/2026_04_17_160021_create_saved_searches_table.php:16`), en accord avec
`spec_refs.models`. La règle de création est `['nullable', 'in:off,daily,weekly,instant']`. Le
middleware **global** de Laravel `ConvertEmptyStringsToNull` transforme `""` en `null` avant toute
validation ; `nullable` l'accepte ; `SavedSearch::create()` insère alors un `NULL` explicite, et la
contrainte d'intégrité lève. Le champ est traversant : `SearchService.php:96` retombe sur `'daily'`
quand la clé est absente, mais pas quand elle vaut `null`.

**Les deux requêtes ne s'accordent pas entre elles.** La création dit `nullable`, la mise à jour dit
`sometimes` **sans** `nullable` — d'où 500 d'un côté et 422 de l'autre, pour la même saisie sur le
même champ.

**C'est PRÉEXISTANT.** Vérifié contre `ad007231` (le commit d'avant le déplacement des validations
de TCK-305) : mêmes règles, même `create(array_merge($data, …))`, et le middleware global
convertissait déjà `""` en `null`. TCK-305 n'a pas introduit ce défaut et ne l'a pas aggravé — il
l'a rendu visible en écrivant les tests qui traversent ce chemin.

## Contraintes strictes (métier)

**La question à trancher est un choix produit, et ce ticket ne le tranche pas :**

> **« Pas d'alerte » et « champ non renseigné » sont-ils le même état ?**

Les deux réponses existent déjà dans le dépôt, et elles mènent à des correctifs différents :

- **Si ce sont deux états distincts** — le domaine porte déjà une valeur sentinelle pour « pas
  d'alerte » (`off` en code). Le correctif est alors de **refuser `""` à la validation** : retirer
  `nullable` de la règle de création, pour l'aligner sur la mise à jour qui rend déjà 422. Le client
  qui veut couper l'alerte envoie la sentinelle, pas le vide.
- **Si c'est le même état** — le correctif est de **rendre la colonne nullable** (migration + `down()`
  juste, cf. principe non négociable n°4) et de décider ce que `null` signifie à la lecture, pour
  `SearchService` comme pour `SavedSearchResource`.

⚠️ **Un troisième écart, à ne pas confondre avec le bug, et qui pèse sur la décision.**
`spec_refs.models` documente les valeurs `instant, daily, weekly, **none**`. Le code valide
`off, daily, weekly, instant` — **`none` est rejeté par un 422**, mesuré. La spec et le code ne
nomment donc pas la même sentinelle. Cet écart relève de `/sync-specs` : **ne pas modifier
`docs/models-spec.md` depuis ce ticket**, mais le trancher avant de figer une règle de validation
qui contredirait la source de vérité une seconde fois.

Le comportement de la mise à jour (422) est le comportement de référence : quelle que soit la
réponse retenue, **les deux requêtes doivent finir d'accord**.

## Delta à produire

- [ ] Trancher la question produit ci-dessus, et l'écrire dans ce ticket avant de coder
- [ ] Trancher `off` vs `none` avec `/sync-specs` — la valeur retenue doit exister des deux côtés
- [ ] Aligner `StoreSavedSearchRequest` et `UpdateSavedSearchRequest` sur la décision : les deux
      règles doivent produire le **même** code de réponse pour la même saisie
- [ ] Si la colonne devient nullable : migration + `down()` réversible, et définir la lecture de
      `null` dans `SearchService` et `SavedSearchResource`
- [ ] Tests : le cas `""` sur les DEUX requêtes, et le cas de la sentinelle retenue

## Critères d'acceptation

- [ ] AC1 — `POST /api/saved-searches` avec `notification_frequency: ""` ne rend plus **500**
- [ ] AC2 — `POST` et `PUT` rendent le **même** code de réponse pour la même saisie vide
- [ ] AC3 — la sentinelle « pas d'alerte » est acceptée, et c'est la **même** chaîne dans
      `docs/models-spec.md` et dans les règles de validation
- [ ] AC4 — `tests/Feature/Validation/BaseFormRequestNormalizationTest.php::test_a_nullable_rule_over_a_not_null_column_still_fails_and_it_predates_this_ticket`
      **rougit** et est mis à jour dans la même PR. Ce test fige délibérément le 500 tel qu'il est
      aujourd'hui : **son rouge est le signal attendu**, pas un obstacle — il prouve que la décision
      a bien changé le comportement observable. Le supprimer sans le remplacer rouvrirait le trou
      qu'il garde.
- [ ] AC5 — la suite backend reste verte, sans assertion assouplie

## Hors périmètre

- Toute autre colonne `NOT NULL` dont la règle serait `nullable` : ce ticket ne traite que
  `saved_searches.notification_frequency`. Un balayage systématique est un ticket à part.
- La convergence spec↔code sur d'autres champs de `SavedSearch` — `/sync-specs`.
- Le déclenchement réel des alertes (job planifié, cadence) : non touché ici.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
