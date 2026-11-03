---
id: TCK-2181
title: "L'historique des paiements juge le bailleur d'un bail comme LeasePolicy::view"
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

La branche des loyers de `GET /api/payments/history` ne rend plus à l'agent qui a saisi le bien,
suspendu ou retiré, les loyers du bail qui le désigne en `landlord_id`.

## Contexte

Réf : **P217.03** du fichier de pistes, `validé` (V2 accordé).

La branche listait `leases.landlord_id = $user->id` sans autre condition. `LeaseService::create`
recopie le créateur du bien en `landlord_id`, et `LeasePolicy::view` juge ce créateur par
`BailleurDuBien::est` depuis TCK-1926 ; la branche des acomptes suit `BailleurDuBien::restreindre`
depuis TCK-1932.

## Décision du porteur

validé — validation du porteur (2026-10-24) : la branche des loyers de l'historique passe par `BailleurDuBien::restreindre($b, $user, 'landlord_id')`, comme `LeaseController::index`

## Delta à produire

- [x] `PaymentController::history` : la clause `landlord_id` par
  `BailleurDuBien::restreindre($l, $user, 'landlord_id')`, dans un groupe pour garder les `orWhere`
  du personnel et du locataire.
- [x] `AgentCreateurHistoriqueDesLoyersTest`.

## Critères d'acceptation

- [x] AC1 — agent créateur suspendu, puis retiré : aucune ligne `source: lease` de ce bail.
- [x] AC2 — l'agent actif, le bailleur du bien bloqué et le locataire gardent la ligne.

## Hors périmètre

- La passerelle de paiement des loyers (P217.04, TCK-2183).

## Notes d'implémentation

- Avant correctif : les deux cas listent le loyer (2 rouges).
- Ablation : clause remise à `where('landlord_id', …)` → 2 rouges ; remise → 3 verts.
