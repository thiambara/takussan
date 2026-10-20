---
id: TCK-1057
title: "La console des enums métier n'édite plus les libellés FR / EN / WO, et son sous-titre ne le promet plus (P66.03)"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: [TCK-1056]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md
tags: [back, front, super-admin, enums, i18n, pistes]
---

## Objectif utilisateur

Le super-admin ne peut plus éditer à la console des libellés qu'aucun rendu ne lit, et l'écran ne
lui annonce plus qu'il « gère les libellés FR / EN / WO ».

## Contrat de données

Réf. P66.03 du fichier de pistes (angle 66). `PATCH /api/admin/enums/{key}/values/{value}`
disparaît : la console ne garde que ses deux lectures. Les libellés affichés viennent de
`lang/<locale>/properties.php` côté API et de next-intl côté front (principe n° 5 du `CLAUDE.md`
racine).

## Décision du porteur

> validé — avec (b) de P66.01 : retirer l'édition des libellés FR / EN / WO (principe n° 5) et corriger le sous-titre de `/super-admin/enums` (porteur, 2026-10-20)

## Contraintes strictes (métier)

- Aucune donnée n'est réécrite : un réglage `enum.<clé>.values` déjà enregistré reste en base.
- Le wolof est en pause : le sous-titre corrigé est une clé neuve, `readOnlySubtitle`, qui porte en
  `wo` le texte français tel quel. L'ancienne clé `subtitle` est retirée des trois langues.

## Delta à produire

- [x] API : retirer la route `admin.enums.values.update`, `BusinessEnumController::updateValue()`,
      `BusinessEnumService::updateValue()`, `persist()` et `audit()`,
      `UpdateBusinessEnumValueRequest`, et le code `business_enum.value_not_found` des trois langues.
- [x] Front : retirer `EnumValueDialog`, le bouton « Modifier » et la colonne d'actions,
      `patchBusinessEnumValue()` et les clés devenues mortes ; le sous-titre passe par
      `superAdmin.pages.enums.readOnlySubtitle`.
- [x] Tests : `BusinessEnumTest::test_console_refuses_editing_labels`, et un cas de
      `enums/__tests__/page.test.tsx`.

## Critères d'acceptation

- [x] `PATCH …/values/villa` avec des libellés ne répond plus 200, n'écrit aucun réglage ni aucune
      ligne d'audit.
- [x] `/super-admin/enums` n'a aucun bouton « Modifier », ne dit plus « Gérez les libellés », et
      dit que les valeurs ne se modifient pas depuis la console.

## Hors périmètre

- Les colonnes FR / EN / WO restent affichées. Sans réglage enregistré, elles rendent
  `Str::headline(<valeur>)` (« Apartment » en FR, constat de P66.04) et non les libellés des
  dictionnaires : les retirer ou les nourrir des dictionnaires n'est pas demandé.
- Un réglage déjà enregistré (préproduction, non mesuré) garde ses valeurs ajoutées, inactives ou
  renommées, que la console et `/api/enums/{key}` continuent de lire.

## Notes d'implémentation

- Ablation API : correctif retiré, le test rougit sur « l'édition des libellés a répondu 200 ».
- Ablation front : composant, page, requêtes et messages d'origine remis, le cas rougit sur le
  bouton « Modifier villa » trouvé.
- Après ce ticket, `BusinessEnumService` n'écrit plus rien : il ne garde que `all()` et `get()`.
- `EnumValueDialog.test.tsx`, retiré par TCK-1055, est rétabli et réécrit : la garde de l'implémenteur
  refuse qu'un test se supprime. Il garde le retrait au niveau du composant (aucun bouton dans la
  table, le module n'exporte plus que `EnumList` et `EnumValueTable`). Ablation : composant et
  messages de `pre-dev` remis, ses deux cas rougissent.
