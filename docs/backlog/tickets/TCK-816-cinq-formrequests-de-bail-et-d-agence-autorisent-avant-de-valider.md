---
id: TCK-816
title: "Les FormRequests de révision du loyer, de renouvellement, de restitution du dépôt, de résiliation anticipée et de mise à jour d'agence délèguent à la policy dans `authorize()`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#22-rôles--permissions"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-22--formrequests-sans-autorisation-propre-et-règles-dautorisation-dans-les-services"
tags: [back, api, autorisation, validation, pistes]
---

## Contexte

Réf : **P22.01** du fichier de pistes, `validé` par le porteur.

Cinq FormRequests (`ReviewRentRequest`, `RenewLeaseRequest`, `RefundDepositRequest`,
`RequestEarlyTerminationRequest`, `AgencyUpdateRequest`) lèvent le refus par défaut de
`BaseFormRequest` par `return true;`, alors que leur contrôleur autorise dans son corps, donc après
la validation. Un compte sans lien avec le bail ou l'agence reçoit 422 et les noms des champs au
lieu de 403 : c'est l'inversion que TCK-305 a fermée sur 65 autres méthodes
(`takussan-api/CLAUDE.md`, § Validation, piège 2).

**Décision du porteur** (recopiée mot pour mot) :

> les cinq routes mesurées seulement (rent, renew, deposit-refund, early-termination, PUT agencies) : authorize() délègue à la policy ; AuthorizationPrecedesValidationTest prend un cas par route ; reste : les autres FormRequests permissives (44 méthodes qui autorisent dans leur corps, 26 qui n'autorisent rien) et la garde « authorize() qui rend true sec »

**Reste à faire** (gardé par le porteur, non implémenté ici) : les autres FormRequests permissives
(44 méthodes qui autorisent dans leur corps, 26 qui n'autorisent rien) et la garde « authorize()
qui rend true sec ».

**Hypothèse notée (mode sans humain)** : `PATCH /api/agencies/{agency}` partage le FormRequest de
`PUT` ; il est corrigé du même geste, sans cas de test propre.

## Objectif utilisateur

Aucun changement pour un appelant autorisé. Un appelant non autorisé reçoit 403, quel que soit le
corps envoyé, et n'apprend plus rien des règles de validation.

## Delta à produire

- `authorize()` des cinq FormRequests : délégation à l'ability que le contrôleur juge déjà
  (`reviewRent`, `renew`, `refundDeposit`, `requestEarlyTermination` sur le bail ; `update` sur
  l'agence).
- `AuthorizationPrecedesValidationTest` : un cas par route, avec son versant « autorisé → 422 ».

## Critères d'acceptation

- [x] AC1 — Compte membre d'une autre agence, corps invalide : les cinq routes rendent 403, sans
      `errors`.
- [x] AC2 — Super-admin, même corps : les cinq routes rendent 422 et nomment les champs.

## Hors périmètre

- Le reste de la décision du porteur (ci-dessus).
- Les `abort_unless` des contrôleurs restent : ils sont redondants mais inoffensifs, et les retirer
  dépasse le geste demandé.

## Notes d'implémentation

- **Reproduction** : avant correctif, les cinq cas « intrus » rendaient 422 (`new_rent`, `start_date`,
  `amount`, `effective_date`, `email`) ; les cinq versants « super-admin → 422 » étaient déjà verts.
- **Ablation** : les cinq FormRequests remises à `return true;` → 5 rouges (« Expected response
  status code [403] but received 422 »), 25 verts ; correctif remis → 30 verts.
- `authorize()` appelle la même ability que l'`abort_unless` du contrôleur, par `$this->user()?->can()`
  et non `Gate::authorize()`, pour garder le corps `{"message":""}` d'un 403 (cf. le commentaire
  d'`AgencyController::update`).
