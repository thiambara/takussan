---
id: TCK-703
title: "Une adresse envoyée avec une ville nulle rend 422, plus 500, sur les trois voies d'écriture"
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
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#4-address
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-17--qualité-des-adresses--référentiel-ou-texte-libre
tags: [api, geo, validation, pistes]
---

## Contexte

Réf : **P17.01** du fichier de pistes, `retenu · autonome` (classement A1).

`addresses.city` est `NOT NULL DEFAULT 'Dakar'` (models-spec § 4, migration
`2026_04_17_160003_create_addresses_table.php:17`). Une ville **omise** prend le défaut, une ville
envoyée à `null` ne le prend pas. Les trois règles d'écriture d'une adresse déclaraient pourtant la
ville `nullable` : `StorePropertyRequest` (`address.city`), `UpdatePropertyRequest`
(`address.city`) et `UpsertPropertyAddressRequest` (`city`). Re-mesuré le 2026-10-16 sur `pre-dev`
7f5eaa8d : les trois voies rendent **500** (`SQLSTATE[23502] null value in column "city"`). Le
front exige la ville (`lib/schemas/property.ts:163`) : le défaut touche les clients directs de l'API.

## Objectif

Une ville `null` (ou `""`, converti en `null` par le middleware) est refusée en 422 sur les trois
voies ; une ville omise garde le comportement actuel.

## Delta à produire

- [x] `address.city` / `city` : `nullable` remplacé par `filled` dans les trois FormRequests
      (`sometimes` gardé pour le PATCH).
- [x] Test `tests/Feature/Geo/AdresseSansVilleTest.php` : un `null` par voie attend 422 et laisse
      la base intacte ; une ville omise prend le défaut (POST, upsert) ou garde la ville (PATCH).

## Critères d'acceptation

- [x] AC1 — `POST /api/properties` avec `address.city: null` → 422 sur `address.city`, aucun bien créé.
- [x] AC2 — `PATCH /api/properties/{id}` avec `address.city: null` → 422, la ville en base inchangée.
- [x] AC3 — `PUT /api/properties/{id}/address` avec `city: null` → 422, à la création comme à la
      modification de l'adresse.
- [x] AC4 — Une ville omise : 201 avec `Dakar` (POST, upsert), 200 et ville conservée (PATCH).

## Hypothèses (mode sans humain)

- **`filled` plutôt que `required_with:address`** (la `Piste` proposait l'un ou l'autre) :
  `required_with` aurait refusé une adresse sans ville, qui passe aujourd'hui avec le défaut
  `Dakar`. `filled` ne refuse que la valeur vide, ce que prescrit la ligne `Mesure` du mesureur
  (« retirer `nullable` … sans rien changer à un appel qui omet la clé »).
- **Un `null` accompagné de `address.geo_city_id` est refusé lui aussi.** Mesuré avant correctif :
  `POST` avec `geo_city_id` et `city: null` rendait 201, la canonisation (règle 5 de
  `GeoAddressCanonicalizer`) réécrivant la ville depuis le référentiel. Le refuser garde une règle
  unique ; le client qui veut la ville du référentiel omet `city`, ce qui donne le même résultat.
  Sur le PATCH, ce même appel rendait 500 quand `geo_city_id` ne changeait pas (la règle 1 remet
  l'identifiant à `null`) : l'admettre n'aurait pas fermé le 500.

## Hors périmètre

- `country` a la même forme (`NOT NULL DEFAULT 'SN'`, règles `nullable` dans les trois
  FormRequests) : non mesuré dans ce passage, signalé dans le rapport.

## Notes d'implémentation

- Avant correctif : 4 rouges sur 7 (trois 500, et le 201 du cas `geo_city_id` + `null`).
- Ablation : les trois FormRequests remises à leur version de `pre-dev` → 4 rouges ; correctif
  réappliqué → 7 verts.
