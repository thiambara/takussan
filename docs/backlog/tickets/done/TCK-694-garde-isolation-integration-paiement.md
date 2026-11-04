---
id: TCK-694
title: "Le test d'isolation à l'initiation du paiement vérifie l'intégration réellement utilisée"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#31-integration-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-12--tests--zones-non-gardées-tests-verts-sans-leur-code
tags: [api, payments, tests, isolation, pistes]
---

## Contexte

Réf : **P12.01** du fichier de pistes, `retenu · autonome` (classement A5 : garde ajoutée, sans
toucher au code ni à un seuil).

`PaymentGatewayInitiateTest::test_initiate_only_uses_agency_scoped_integration` crée une
intégration Wave dans une autre agence (« must not be picked »), mais sa seule assertion est
`assertOk()`, et le faux Wave du `setUp` répond 200 à toute clé. Retirer le filtre d'agence de
`PaymentGatewayService::resolveIntegration()` laisse le test vert (reproduit le 2026-10-16) : une
régression qui ferait encaisser une agence sur le compte d'une autre passerait la CI.

## Objectif

Le test échoue dès que l'initiation d'un paiement utilise l'intégration d'une autre agence.

## Delta à produire

- [x] L'intégration étrangère du test a des identifiants complets (`api_key`, `webhook_secret`)
      et est créée **avant** celle de l'agence : sans filtre, rien ne l'écarte.
- [x] Le test asserte la clé envoyée au fournisseur (`Http::assertSent` sur
      `Authorization: Bearer wave_test_key`, `Http::assertNotSent` sur la clé étrangère) et
      l'intégration enregistrée dans `metadata.gateway.integration_id`.

## Critères d'acceptation

- [x] AC1 — Avec le code actuel, le test est vert.
- [x] AC2 — Sans le filtre `agency_id` de `resolveIntegration()`, le test est rouge.

## Hypothèses (mode sans humain)

- La `Piste` propose `integration_id` **ou** `Http::assertSent` : les deux sont assertés, ils ne
  s'excluent pas et ne demandent aucun choix de produit.

## Hors périmètre

- Le code de `resolveIntegration()`, juste aujourd'hui.
- Le même cas sur le repli global (`agency_id` nul) et sur les autres fournisseurs.

## Notes d'implémentation

- Ablation : filtre `where(agency_id = ? or agency_id is null)` retiré de `resolveIntegration()`
  → l'ancien test **vert**, le nouveau **rouge** (« An expected request was not recorded » : la
  clé étrangère a servi). Filtre remis : la classe entière, 13 verts (58 assertions).
- L'ordre de création compte : créée après celle de l'agence, l'intégration étrangère n'est pas
  prise sans filtre (ordre physique de PostgreSQL), et le test ne verrait rien.
