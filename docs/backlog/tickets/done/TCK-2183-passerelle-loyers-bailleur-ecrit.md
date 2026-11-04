---
id: TCK-2183
title: "La passerelle de paiement d'un loyer juge le bailleur par bailleurEcrit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-217--clauses-de-périmètre-des-listes-écrites-à-la-main-face-à-la-policy-view"
tags: [api, paiements, baux, autorisation, pistes]
---

## Objectif

`LeasePaymentPolicy::update`, qui garde `initiate`, `verify` et `providers` de la passerelle pour
`lease-payments`, refuse l'agent qui a saisi le bien une fois suspendu ou retiré.

## Contexte

Réf : **P217.04** du fichier de pistes, `validé` (V1 et V2 accordés).

La policy acceptait `landlordWrites`, qui ne refuse que le bailleur bloqué : l'agent recopié en
`landlord_id` passait. Les gestes du bail sont jugés par `bailleurEcrit` depuis TCK-1722.

## Décision du porteur

validé — validation du porteur (2026-10-24) : `LeasePaymentPolicy::update` passe de `landlordWrites` à `bailleurEcrit` ; le bailleur bloqué reste refusé

## Delta à produire

- [x] `LeasePaymentPolicy::update` : `bailleurEcrit` au lieu de `landlordWrites`.
- [x] `AgentCreateurPaiementDesLoyersTest`.
- [x] `MigratedAuthorizationRulesTest::test_lease_payment_update_follows_the_lease` : le
  « bailleur » y était un compte sans profil propriétaire dans l'agence, la population que la
  décision refuse ; il reçoit un profil propriétaire, et le cas sans profil est épinglé refusé.

## Critères d'acceptation

- [x] AC1 — agent créateur suspendu, puis retiré : `can('update')` faux, `providers` et `verify`
  → 403.
- [x] AC2 — l'agent actif, le bailleur du bien et le locataire acceptés ; le bailleur bloqué
  refusé.

## Hors périmètre

- `initiate` n'est pas appelé par le test (il joint un fournisseur) : même ability.

## Notes d'implémentation

- Avant correctif : les deux cas rendent `can('update')` vrai (2 rouges).
- Ablation : `landlordWrites` remis → 2 rouges ; `bailleurEcrit` → 4 verts.
- Piège : `MigratedAuthorizationRulesTest` admettait un « bailleur » sans aucun profil ; il rougit
  sous le correctif, c'est la règle décidée.
