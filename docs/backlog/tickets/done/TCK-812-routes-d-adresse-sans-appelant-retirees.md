---
id: TCK-812
title: "Les routes `PUT` et `DELETE /api/properties/{property}/address`, sans appelant et plus lâches que la création, sont retirées"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-17--qualité-des-adresses--référentiel-ou-texte-libre"
tags: [back, api, adresses, code-mort, pistes]
---

## Contexte

Réf : **P17.05** du fichier de pistes. Le porteur l'a tranchée le 2026-10-17 : hors agents, faite en
session.

`PUT` et `DELETE /api/properties/{property}/address` n'ont aucun appelant, ni dans le front ni
ailleurs dans le dépôt. Le dernier appelant a été retiré (`property-form/payload.ts:17` le raconte).
Leurs règles sont plus lâches que celles de la création : 255 caractères au lieu de 120, et ni
`geo_city_id` ni `geo_neighborhood_id`.

L'implémenteur s'était arrêté : retirer les routes rend `PropertyAddressTest.php` obsolète, et sa
garde lui interdit de supprimer un test. TCK-490 avait gardé ces routes faute de preuve qu'aucun
client hors dépôt ne les appelle. Or l'API n'a jamais servi en production : ce client ne peut pas
exister.

## Objectif utilisateur

Aucun changement visible. Une adresse ne s'écrit plus qu'avec son bien, à la création ou à la
modification, sous une seule série de règles.

## Contraintes strictes

- La création et la modification du bien gardent leur comportement d'adresse (`AdresseSansVilleTest`).
- Rien d'autre ne change sous `properties/{property}/…`.

## Delta à produire

- Retirer les deux routes de `routes/api/properties.php`, puis `PropertyAddressController` et
  `UpsertPropertyAddressRequest`.
- Retirer `tests/Feature/Api/PropertyAddressTest.php`. Ses cas couvraient les deux routes ; la
  borne de latitude reste gardée sur la création par `PropertyNumericBoundsTest`.
- Dans `AdresseSansVilleTest`, remplacer les deux cas d'upsert par une garde contre le retour de
  la route.

## Critères d'acceptation

- [x] AC1 — `PUT` et `DELETE /api/properties/{id}/address`, sur un bien qui a une adresse, rendent
      404, et l'adresse est inchangée.
- [x] AC2 — `php artisan route:list --path=address` ne rend aucune route.
- [x] AC3 — Les cas de création et de modification d'`AdresseSansVilleTest` restent verts.

## Hors périmètre

- Le signal de distance entre la position et la ville choisie (second volet de P17.05) : plus tard.

## Notes d'implémentation

- **Ablation** : contrôleur, FormRequest et routes remis depuis `HEAD`. La garde rougit
  (« Expected response status code [404] but received 200 »). Retirés à nouveau, elle repasse au
  vert.
- Tests de routes relancés : `ProtectedActionsCoverageTest`, `PlatformRoutesDefaultDenyTest`,
  `NamespaceAccessGuardTest`, `RoutesEnDoubleRetireesTest`, `ImpersonationReadOnlyTest`. Tous
  verts (24 tests).
- Le docblock de `PropertyPolicy` cite encore `PropertyAddressController` parmi les huit contrôleurs
  de TCK-306. C'est un récit au passé, il reste tel quel.
