---
id: TCK-2728
title: "La lecture du portefeuille de crédits a deux gardes sur les mises en avant : les dire, et épingler celle qui est seule ailleurs"
status: todo
phase: P3
family: technique
estimate: S
wave: 90
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2663]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#93-propertyboost-"
tags: [technique, credits, boost, autorisation, ablation, suivi-lot-1]
---

## Objectif utilisateur

Qui retire un jour l'une des gardes de lecture du portefeuille sait qu'une autre la double — et un test rougit si la
seule garde d'une route disparaît.

## Contexte

Vérification de TCK-2663 : l'ablation de `authorize('viewAny', [CreditLot::class, $agency])` est restée **verte**. Cause
trouvée (relevé du 2026-11-11, sans exécution) — la règle `CreditLotPolicy::viewAny` (`boost.spend` sur l'espace) est
invoquée à **deux** endroits :

- `App\Http\Requests\Credits\AuthorizesWalletReading::authorize()` — porté par `IndexCreditBoostsRequest`
  (`GET /api/credits/boosts`) et `CreditSuggestionsRequest` (`GET /api/credits/suggestions`), avant la validation ;
- `App\Http\Controllers\Api\Credits\ReadsWallet::walletAgency()` — appelé par `CreditBoostController` (les deux mêmes
  routes) **et** par `CreditController` (`GET /api/credits`, `GET /api/credits/balance`), qui n'ont pas de FormRequest.

Sur les routes des mises en avant, chacune couvre l'autre : retirer l'une seule laisse tout vert. Sur `GET /api/credits`
et `…/balance`, `ReadsWallet` est **seule**. *Une ablation qui laisse vert ne prouve pas qu'un mécanisme est inutile :
elle prouve qu'un autre le couvre.*

## Décision

**Aucune décision du porteur requise** : la double garde est gardée (la FormRequest fait passer 403 avant 422, le
contrôleur garde les routes sans FormRequest) ; elle est dite et épinglée.

## Contrat de données

Aucun changement de réponse.

## Contraintes strictes (métier)

- Aucune garde n'est retirée.
- Les deux docblocks se citent l'un l'autre (`AuthorizesWalletReading` ↔ `ReadsWallet`) et disent sur quelles routes
  chacun est seul.

## Delta à produire

- [ ] Docblocks de `AuthorizesWalletReading` et de `ReadsWallet`.
- [ ] Vérifier par ablation (une à la fois, au premier plan) que `tests/Feature/Boost/CreditsApiTest.php` (≈ l. 40, `GET
      /api/credits` → 403) et `tests/Feature/Boost/CreditBalanceEndpointTest.php` (≈ l. 50, `…/balance` → 403) **rougissent**
      quand l'`authorize` de `ReadsWallet::walletAgency()` est retiré — **candidats à confirmer**, non exécutés au
      relevé. S'ils restent verts, écrire le test qui manque.
- [ ] Vérifier que `CreditsBoostsListTest` (`…/boosts?filter[status]=nimporte` → 403) et `CreditsSuggestionsTest`
      (`…/suggestions?limit=99` → 403) rougissent quand `AuthorizesWalletReading::authorize()` rend `true` (la garde qui
      fait passer 403 avant 422).

## Critères d'acceptation

- [ ] AC1 — `authorize` de `ReadsWallet::walletAgency()` retiré : au moins un test de `GET /api/credits` et un de
      `GET /api/credits/balance` rougissent (ablation consignée dans les notes, md5 restauré).
- [ ] AC2 — `AuthorizesWalletReading::authorize()` forcé à `true` : les tests 403-avant-422 des boosts et des suggestions
      rougissent.
- [ ] AC3 — Les deux docblocks nomment l'autre garde et les routes où chacune est seule.

## Hors périmètre

- Les mesures des mises en avant (`BoostMeasures`) : la borne d'agence des visites est déjà posée (6331d6a29).

## Notes d'implémentation

_(à remplir par implementing-specs)_
