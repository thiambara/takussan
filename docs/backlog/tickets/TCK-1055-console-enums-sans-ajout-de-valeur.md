---
id: TCK-1055
title: "La console des enums métier n'ajoute plus de valeur : la liste vit dans le code (P66.01)"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md
tags: [back, front, super-admin, enums, pistes]
---

## Objectif utilisateur

Le super-admin ne peut plus ajouter à la console une valeur d'enum métier que la création d'un bien
refuse ensuite en 422, et l'écran lui dit que ces listes vivent dans le code.

## Contrat de données

Réf. P66.01 du fichier de pistes (angle 66). `POST /api/admin/enums/{key}/values` disparaît. Les
lectures `GET /api/admin/enums`, `GET /api/admin/enums/{key}` et `GET /api/enums/{key}` ne changent
pas. La liste des valeurs est celle de l'enum PHP
([ADR-0007](../../adr/0007-pas-d-enum-sql.md)) : `Rule::enum` à l'écriture d'un bien, cast du modèle.

## Décision du porteur

> validé — (b) retirer de la console l'ajout de valeur et dire à l'écran que la liste vit dans le code (ADR-0007) ; test qui refuse l'ajout (porteur, 2026-10-20)

## Contraintes strictes (métier)

- Aucune donnée n'est réécrite : un réglage `enum.<clé>.values` déjà enregistré reste en base.
- Le wolof est en pause : le texte neuf porte en `wo` le texte français tel quel.

## Delta à produire

- [x] API : retirer la route `admin.enums.values.store`, `BusinessEnumController::storeValue()`,
      `BusinessEnumService::addValue()` et `StoreBusinessEnumValueRequest`.
- [x] Front : retirer le bouton « Ajouter une valeur » et le mode « ajout » du dialogue,
      `postBusinessEnumValue()` et la clé `superAdmin.enums.addValue`.
- [x] Front : un avis à l'écran, `superAdmin.pages.enums.codeNotice`.
- [x] Tests : `BusinessEnumTest::test_console_refuses_adding_a_value`, et
      `enums/__tests__/page.test.tsx`.

## Critères d'acceptation

- [x] `POST /api/admin/enums/property_type/values` par un super-admin ne répond plus 201, n'écrit
      aucun réglage ni aucune ligne d'audit, et `/api/enums/property_type` rend les cas de l'enum.
- [x] `/super-admin/enums` n'a aucun bouton d'ajout et affiche l'avis.

## Hors périmètre

- La désactivation (P66.02) et l'édition des libellés (P66.03) : tickets à part dans le même lot.
- Un réglage déjà enregistré en préproduction, qui garde ses valeurs ajoutées : non mesuré, aucune
  écriture ni lecture ne change ici.

## Notes d'implémentation

- Hypothèse : la route retirée répond 404 ou 405 ; le test accepte les deux.
- Ablation API : correctif retiré, le test rougit sur « l'ajout de valeur a répondu 201 ».
- Ablation front : composant, page et messages d'origine remis, le test rougit sur le bouton
  « Ajouter une valeur » trouvé. Une première ablation sans les messages rougissait seulement sur
  l'avis : le bouton y portait la clé brute, que `/ajouter/i` ne trouve pas.
- `EnumValueDialog.test.tsx` est retiré : il éprouvait le seul mode « ajout ».
