---
id: TCK-1496
title: "Supprimer ou signer le média d'un bien par `/api/media/{m}` suit la règle d'écriture du bien (P116.06)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-116"
  features:
    - "docs/features.md"
tags: [api, media, authorization, pistes]
---

## Objectif

Que `DELETE /api/media/{media}` (et `sign`, qui délègue à `delete`) se juge, pour le média d'un
bien, par `PropertyPolicy::update`, la règle qui juge déjà la suppression par
`DELETE /api/properties/{p}/media/{id}`.

## Contexte

Réf : **P116.06** du fichier de pistes (angle 116), `validé` le 2026-10-22 (critère V2 accordé).

`MediaPolicy::delete` n'exigeait, pour un média d'agence, que `isAgencyAdminAt` : un admin dont le
rôle retire `properties.update_any` supprimait la photo d'un bien qu'il ne peut pas modifier, un
agent qui porte la capacité recevait 403.

## Décision du porteur

> porteur (2026-10-22) : juger `DELETE /api/media/{m}` par la règle d'écriture du porteur du média (`PropertyPolicy::update` pour un bien)

Choix : la règle est branchée pour le porteur que la décision nomme, le bien, avant les autres
branches de `delete` (le bailleur suit donc lui aussi `PropertyPolicy::update`). `sign` délègue
à `delete` et suit la même règle, comme l'écrivait le classement du mesureur.

## Reste à faire

- Les autres porteurs de média qui ont un `agency_id` (relevé bancaire, intervention, document…)
  restent jugés par « être admin de l'agence » : chacun demande d'identifier sa règle d'écriture.

## Delta produit

- [x] `MediaPolicy::delete` : branche `Property` → `$user->can('update', $target)`.
- [x] `tests/Feature/Media/PropertyMediaDeleteFollowsPropertyWriteRuleTest.php` (4 cas).

## Critères d'acceptation

- [x] AC1 — admin dont le rôle retire `properties.update_any` : 403, média intact.
- [x] AC2 — agent qui porte `properties.update_any` : 204, média supprimé.
- [x] AC3 — admin du rôle système : 204 ; admin d'une autre agence : 403.

## Notes d'implémentation

- **Ablation** : `MediaPolicy` remise à `pre-dev` → 2 rouges (AC1, AC2) ; remise → 4/4.
