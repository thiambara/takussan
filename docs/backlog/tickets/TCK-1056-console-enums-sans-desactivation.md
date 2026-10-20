---
id: TCK-1056
title: "La console des enums métier ne désactive plus de valeur (P66.02)"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: [TCK-1055]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md
tags: [back, front, super-admin, enums, pistes]
---

## Objectif utilisateur

Le super-admin ne peut plus « désactiver » à la console une valeur d'enum métier que l'écriture d'un
bien accepte quand même et que tous les formulaires continuent de proposer.

## Contrat de données

Réf. P66.02 du fichier de pistes (angle 66). `DELETE /api/admin/enums/{key}/values/{value}`
disparaît, et `PATCH /api/admin/enums/{key}/values/{value}` n'accepte plus `is_active`. La liste
des valeurs est celle de l'enum PHP ([ADR-0007](../../adr/0007-pas-d-enum-sql.md)).

## Décision du porteur

> validé — avec (b) de P66.01 : retirer la désactivation de la console (porteur, 2026-10-20)

## Contraintes strictes (métier)

- Aucune donnée n'est réécrite : un réglage qui porte déjà une valeur inactive reste en base, et
  `/api/enums/{key}` continue d'en écarter les valeurs inactives.

## Delta à produire

- [x] API : retirer la route `admin.enums.values.destroy`,
      `BusinessEnumController::deactivateValue()`, `BusinessEnumService::deactivateValue()` et
      `usageCount()`, la règle `is_active` d'`UpdateBusinessEnumValueRequest` et son traitement
      dans `updateValue()`.
- [x] Front : retirer le bouton de désactivation de la table, `deleteBusinessEnumValue()`,
      `is_active` du corps de `patchBusinessEnumValue()` et la clé `deactivateValueAria`.
- [x] Tests : `BusinessEnumTest::test_console_refuses_deactivating_a_value`, et un cas de
      `enums/__tests__/page.test.tsx`.

## Critères d'acceptation

- [x] `DELETE …/values/farm` par un super-admin ne répond plus 200, `PATCH …/values/farm`
      `{is_active: false}` laisse `farm` active, et aucune ligne d'audit de désactivation n'est
      écrite.
- [x] `/super-admin/enums` n'a aucun bouton « Désactiver ».

## Hors périmètre

- L'édition des libellés (P66.03) : ticket à part dans le même lot.
- Le compte d'usage de la console reste affiché : il ne servait qu'au 409 de la désactivation, mais
  il est lu, et son retrait n'est pas demandé.

## Notes d'implémentation

- Le code `business_enum.value_in_use` reste dans `lang/*/errors.php`, sans émetteur : toucher ces
  fichiers fait sélectionner la suite entière par `bin/impacted-tests.php`.

- Ablation API : correctif retiré, le test rougit sur « la désactivation a répondu 200 ». Ablation
  partielle, `DELETE` retiré mais `is_active` rendu au `PATCH` : le test rougit encore (`farm`
  inactive), le second volet porte donc.
- Ablation front : composant, requêtes et messages d'origine remis, le cas rougit sur le bouton
  « Désactiver villa » trouvé.
