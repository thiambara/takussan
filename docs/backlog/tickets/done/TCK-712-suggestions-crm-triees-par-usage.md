---
id: TCK-712
title: "Les suggestions d'étiquettes CRM s'affichent, triées par usage dans l'agence, sans recompter les biens"
status: done
phase: P1
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
    - docs/models-spec.md#10-tag
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes
tags: [api, web, tags, crm, performance, pistes]
---

## Contexte

Réf : **P02.05** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`fetchCrmTags` (`takussan-web/src/lib/queries/customers.ts`), qui nourrit les suggestions
d'étiquettes de la liste et de la fiche client, demande `fields[tags]=id,name,color,usage_count`
et `sort=-usage_count`. `usage_count` n'est pas une colonne, et aucun tri ne le porte : l'API rend
400, que l'appelant masque par `.catch(() => [])`. Les suggestions sont donc toujours vides.

Par ailleurs, `TagController::index` pose `withCount(['properties', 'customers'])` **avant**
`buildQuery()`. Un `fields[tags]=…` y remplace la liste des colonnes et emporte les comptes, et
`format()` recompte alors les biens étiquette par étiquette. Même sans `fields`, `usage_count`
recompte les biens au lieu de lire `properties_count`.

## Décision du porteur

corriger le 400 ; suggestions CRM triées par usage dans l'agence ; retirer le compte properties redondant

## Objectif

`GET /api/tags?filter[type]=crm&fields[tags]=id,name,color&sort=-usage_count`, la requête de
`fetchCrmTags`, rend 200, trié par usage dans l'agence de l'appelant, et la liste ne fait plus
aucun compte de biens par étiquette.

## Delta à produire

- [x] `App\Sorts\TagUsageSort` : tri `usage_count` = biens portant l'étiquette + clients de
      l'agence de l'appelant qui la portent (la définition de `usage_count` dans
      `TagController::format()`), le nom départageant les égalités.
- [x] `Tag::buildQuery()` déclare ce tri, pour l'agence passée par l'appelant.
- [x] `TagController::index` : `withCount` posé après `buildQuery()` ; `format()` lit
      `properties_count` au lieu de recompter.
- [x] Front : `TAG_FIELDS` ne demande plus `usage_count` comme colonne.
- [x] Tests : `takussan-api/tests/Feature/Tags/TagCrmSuggestionsTest.php`,
      `takussan-web/src/lib/queries/__tests__/suggestions-crm.tck-712.test.ts`.

## Critères d'acceptation

- [x] AC1 — La requête de `fetchCrmTags` rend 200, triée par usage dans l'agence : une étiquette
      très portée dans une autre agence ne passe pas devant une étiquette plus portée dans celle de
      l'appelant. `sort=usage_count` inverse l'ordre.
- [x] AC2 — `GET /api/tags` ne lance aucun `count(*)` de biens par étiquette, avec ou sans
      `fields[tags]`, et `properties_count` reste juste.
- [x] AC3 — `fetchCrmTags` envoie `fields[tags]=id,name,color` et `sort=-usage_count`.

## Hypothèses (mode sans humain)

- « Usage dans l'agence » reprend la définition déjà rendue sous le nom `usage_count` (biens +
  clients de l'agence de l'appelant), pour que l'ordre suive le nombre affiché. Pour une étiquette
  CRM, le terme « biens » est nul en pratique.
- L'agence est celle de `$user->agency_id` (le pont de compatibilité), celle que `format()`
  employait déjà. Sans agence, le tri ne compte que les biens.

## Reste à faire

- Lancer la requête des équipements en parallèle de celle du bien sur la fiche
  (`properties/[id]/page.tsx`), seconde moitié de la `Piste`, que la décision du porteur ne
  reprend pas.

## Hors périmètre

- Le compte des clients de l'agence dans `format()`, une requête par étiquette : il n'est pas
  redondant (borné à l'agence, ce que `withCount` ne fait pas), et la décision ne vise que le
  compte des biens.
- `customers_count`, posé par `withCount` mais jamais rendu par `format()`.

## Notes d'implémentation

- Ablation, trois fois : tri `usage_count` retiré → AC1 rouge (« 400 is identical to 200 ») ;
  `withCount` remis avant `buildQuery()` → AC2 rouge (« 8 is identical to 0 », deux comptes par
  étiquette sous `fields`) ; tri sans la borne d'agence → AC1 rouge (ordre global). Front :
  `usage_count` remis dans `TAG_FIELDS` → AC3 rouge. Correctif remis → verts.
- Piège : PostgreSQL refuse un alias de colonne (`properties_count`) dans une expression
  d'`ORDER BY`. Le tri bâtit donc ses sous-requêtes corrélées par les relations
  (`getRelationExistenceCountQuery`), comme `withCount`.
