---
id: TCK-1862
title: "La liste des garants rend 400, et non 500, sur un `lease_id` qui n'est pas un identifiant"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-188--paramètres-de-date-et-de-nombre-lus-à-la-main-hors-de-filter"
tags: [api, baux, garants, validation, pistes]
---

## Contexte

Réf : **P188.05** du fichier de pistes, `retenu · autonome` (A1). `GuarantorController::index`
passe `$request->input('lease_id')` tel quel à un `whereHas('leases', …)` : `lease_id=abc` → 500
`22P02`, `lease_id` à 20 chiffres → 500 `22003`. TCK-1273 a fixé la réponse d'un identifiant mal
formé lu hors de spatie : `ExactIdentifierFilter::exiger()`, 400 `filter.identifier_invalid`.

## Objectif utilisateur

Un appel à la liste des garants avec un bail mal désigné reçoit une erreur qui accuse la requête.

## Contrat de données

`GET /api/guarantors?lease_id=…` : un `lease_id` qui n'est pas un entier de 18 chiffres au plus
rend 400 `filter.identifier_invalid` ; un entier filtre comme avant.

## Delta à produire

- [x] `GuarantorController::index` : `ExactIdentifierFilter::exiger($request->input('lease_id'), 'lease_id')`.
- [x] Tests : `GuarantorTest::test_un_lease_id_mal_forme_rend_400_et_non_500` (trois cas) et
  `test_un_lease_id_entier_filtre_toujours_les_garants`.

## Critères d'acceptation

- [x] AC1 — `lease_id=abc`, `lease_id=99999999999999999999`, `lease_id[]=abc` → 400
  `filter.identifier_invalid`.
- [x] AC2 — témoin : `lease_id=5` → 200.

## Hors périmètre

- Aucun appel du front n'envoie `lease_id` à cette route (relevé par la piste) : rien côté front.

## Notes d'implémentation

- Un cas par exécution (fournisseur de données) : la requête fautive abandonnait la transaction
  PostgreSQL du test.
- Reproduction : les trois cas rouges avant correctif (500).
- Ablation : contrôleur remis à l'état de `pre-dev` → 3 rouges ; correctif remis → 4 verts.
  `GuarantorTest` entier 14 verts.
