---
id: TCK-1279
title: "POST /api/agencies : le créateur ne choisit plus le statut de son agence"
status: todo
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-147--statuts-posés-par-un-ruleenum-entier-dans-les-requêtes-décriture"
tags: [api, agence, moderation, pistes]
---

## Contexte

Réf : **P147.07** du fichier de pistes, `retenu · autonome` (A1).

`StoreAgencyRequest` accepte `status` sur tout `AgencyStatus`, et `AgencyController::store`
écrit `$data['status'] ?? active` : un compte sans agence crée la sienne `suspended` (mesuré :
201) ou `inactive`, alors que `suspended` est la sanction de la console, posée avec un motif et
levée par `reinstate` seul, et `inactive` l'état que pose `unverify`. Aucun écran n'envoie la clé.

## Objectif

Une agence créée par `POST /api/agencies` naît `active` ; seuls les gestes de la console changent
son statut.

## Delta à produire

- [ ] Retirer `status` des règles de `StoreAgencyRequest` (la clé, non validée, n'atteint plus
      `validated()`) ; le contrôleur pose `active`.
- [ ] Test : `POST /api/agencies {name, status: suspended}` → 201, agence `active`.

## Critères d'acceptation

- [ ] AC1 — `POST /api/agencies` avec `status: suspended` crée une agence `active`.

## Hors périmètre

- Qu'une agence doive naître non vérifiée : autre question, notée par la mesure.

## Notes d'implémentation

_(à remplir par implementing-specs)_
