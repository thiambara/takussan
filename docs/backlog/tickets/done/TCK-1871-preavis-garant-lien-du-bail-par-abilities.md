---
id: TCK-1871
title: "La fiche d'un bail ne montre préavis, ajout de garant et lien de paiement qu'à qui `LeasePolicy` l'accorde"
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
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-189--gestes-montrés-par-une-comparaison-didentité-ou-de-rôle-dans-les-détails-refusés-par-la-policy"
tags: [back, front, leases, permissions, pistes]
---

## Objectif utilisateur

Le bailleur suspendu dans l'agence du bail, et l'agent sans `leases.terminate`, ne se voient plus
offrir sur la fiche d'un bail les gestes que l'API leur refuse : préavis et son annulation, ajout
de garant, lien de paiement d'une échéance.

## Contexte

Réf : **P189.03** du fichier de pistes, `retenu · autonome` (A1 : les règles sont écrites dans
`LeasePolicy` et `LeasePaymentPolicy`). Suite de P152.02 (TCK-1424), qui a passé quatre autres
gestes de la fiche sur `abilities`.

La fiche ouvre ces gestes par le rôle (`isAgentSurface` : `super_admin`, `agency_admin`, `agent`,
`owner`), que le bailleur suspendu garde.

## Hypothèses (mode sans humain)

- Comme le recommandent la Piste et la mesure : `abilities` gagne `request_early_termination`
  (`LeasePolicy::requestEarlyTermination`, qui couvre le locataire ; `cancelEarlyTermination` a la
  même règle) et `update` (`LeasePolicy::update`).
- Le préavis et l'annulation de la bannière suivent `request_early_termination` ; l'ajout de garant
  (`AttachGuarantorLeaseRequest`, `update` du bail) et le lien de paiement suivent `update`. Le lien
  reste caché au locataire, comme aujourd'hui : `LeasePaymentPolicy::update` le lui accorderait, mais
  le lui montrer serait un comportement visible neuf.
- Le libellé du bouton de préavis (gestionnaire ou locataire) garde sa règle actuelle.

## Delta à produire

- [x] `LeaseResource` : `abilities.request_early_termination` et `abilities.update`.
- [x] `LeaseDetail` : préavis et bannière sous `request_early_termination` ; ajout de garant et lien
  de paiement sous `update`.
- [x] Tests : `LeaseAbilitiesTest` (bailleur suspendu, agent sans `leases.terminate`, locataire) ;
  `LeaseDetail` sans ces gestes quand l'API les refuse.

## Critères d'acceptation

- [x] AC1 — Bailleur du bail suspendu : `request_early_termination` et `update` à `false` ; agent de
  l'agence sans `leases.terminate` : `request_early_termination` à `false`, `update` à `true` ;
  locataire : `request_early_termination` à `true`, `update` à `false`.
- [x] AC2 — La fiche ne monte le préavis et l'annulation que sous `request_early_termination`,
  l'ajout de garant et le lien de paiement que sous `update` ; sans `abilities`, aucun.

## Hors périmètre

- Toute règle de `LeasePolicy` ou de `LeasePaymentPolicy`, tout calcul de montant.
- Le lien de paiement au locataire.
- Les gestes encore ouverts par le rôle (document, échéancier) : autre règle, non mesurée ici.

## Notes d'implémentation

- Ablation : les deux clés retirées de `LeaseResource` → 5 rouges dans `LeaseAbilitiesTest` ; la
  fiche remise sur le rôle → 3 rouges dans `LeaseDetail.capacites.test.tsx` ; remis → verts.
- `LeaseAbilitiesTest` comparait `abilities` à l'identique : ses trois cas existants portent les
  deux clés neuves. `LeaseDetail.preavis.test.tsx` simulait un bail sans `abilities` : ses fixtures
  portent désormais le verdict que l'API sert au locataire et à l'agent.
- `isLeaseTenant` disparaît de la fiche : le verdict de l'API couvre le locataire.
