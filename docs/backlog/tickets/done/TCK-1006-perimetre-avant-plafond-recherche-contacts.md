---
id: TCK-1006
title: "La recherche de contacts prend son plafond d'identifiants dans le périmètre, plus sur tous les comptes"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-plafond-de-5-000-identifiants-se-prend-sur-tous-les-comptes-avant-le-périmètre-et-le-correctif-de-p1604-ne-sapplique-pas-ici"
tags: [back, messaging, search, pistes]
---

## Objectif utilisateur

Chercher un contact par son nom le trouve, même quand des milliers de comptes hors de son
périmètre portent le même patronyme.

## Contexte

Réf : **P51.04** du fichier de pistes, `validé` (critère V6 accordé).

`MessagingContactController` demandait à Meilisearch les 5 000 premiers identifiants de tout
l'index `users`, puis les intersectait avec le périmètre de `MessagingReach`. Mesuré avant
correctif, par le test de garde ci-dessous au plafond abaissé à 2 : trois homonymes hors
périmètre, indexés avant le contact, le rejettent au-delà du plafond, et
`filter[search]=Diop` rend une liste vide.

## Décision du porteur

> calculer d'abord en SQL les identifiants du périmètre, puis les passer à Meilisearch en `filter` sur `id`, rendu filtrable dans les réglages d'index (pas de recherche SQL sous un seuil) ; test avec un plafond abaissé : un contact du périmètre classé après N homonymes hors périmètre reste trouvé (porteur, 2026-10-19, sur la recommandation du délégué)

## Hypothèses (mode sans humain)

- Les réglages d'index sont poussés à chaque déploiement par `search:sync-index-settings`
  (`takussan-api/docker/release.sh`), qui arrête le déploiement s'il échoue : rendre `id`
  filtrable ne demande aucun geste sur la préproduction ni la production.
- Le périmètre est calculé avec les filtres déjà posés sur la requête (dont `exclude`), sans tri.
  Un périmètre vide ne va pas jusqu'à Meilisearch.

## Delta à produire

- [x] `config/scout.php` : `filterableAttributes: ['id']` sur l'index `users`.
- [x] `MessagingContactController` : le périmètre en SQL, passé à `User::search()` par
  `whereIn('id', …)` ; le plafond devient `protected` pour qu'un test l'abaisse.
- [x] Test : `MessagingContactsTest::test_un_contact_classe_apres_le_plafond_d_homonymes_hors_perimetre_reste_trouve`.

## Critères d'acceptation

- [x] AC1 — plafond abaissé à 2, trois homonymes hors périmètre : le contact du périmètre est
  trouvé.
- [x] AC2 — les tests existants de la recherche de contacts (périmètre, nom seul, pertinence)
  restent verts.

## Hors périmètre

- Le même plafond sur `HasQueryBuilder` (`SEARCH_ID_CAP`, reste de P16.04) : non touché.

## Notes d'implémentation

- Ablation : `whereIn('id', $perimetre)` retiré → 1 rouge (liste vide) ; `filterableAttributes`
  retiré de la configuration → 1 rouge, Meilisearch rend 400 « Attribute `id` is not
  filterable » : le réglage est porteur, et un déploiement qui ne le pousserait pas casserait la
  recherche de contacts ; remis → 25 verts.
- Le plafond s'abaisse par une sous-classe du contrôleur liée dans le conteneur (le plafond est une
  constante, que `SearchIdCapIndexSettingsTest` lit par réflexion).
