---
id: TCK-2021
title: "Le membre retiré quitte aussi les groupes rattachés à un bien de l'agence qu'il ne lit plus"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-191--fils-rattachés-à-un-bail-ou-à-un-bien-face-à-la-policy-de-leur-contexte"
tags: [api, messagerie, retrait, pistes]
---

## Objectif utilisateur

Le membre retiré d'une agence ne lit plus ni n'écrit dans un groupe ouvert sur un bien de cette
agence (sans bail) dont il ne voit plus la fiche ; les autres participants le gardent.

## Contexte

Réf : **P191.02** du fichier de pistes. Prolonge TCK-1711 (P153.04), qui ne quittait que les fils
de bail.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : étendre `leaveUnreadableLeaseThreads` aux groupes rattachés à un `property_id`, jugés par `PropertyPolicy::view`

## Hypothèses (mode sans humain)

- Seuls les **groupes** sans bail sont visés : un fil à `lease_id` est déjà jugé par le bail
  (TCK-1711), et une directe à `property_id` est un fil de prospect, que sa propre branche juge
  (TCK-886).
- Le bien est lu soft delete compris : un bien supprimé que le retiré ne voit pas fait quitter le
  groupe.

## Delta à produire

- [x] `AgencyMemberRemovalService::leaveUnreadableLeaseThreads()` quitte aussi ces groupes.
- [x] Garde dans `tests/Feature/Agency/MembreRetireFilsDeBailTest.php`.

## Critères d'acceptation

- [x] AC1 — Retrait en `leave_unassigned` → `left_at` posé sur le groupe de bien du retiré, `GET` et
  `POST …/messages` en 403 ; le locataire garde le groupe.

## Hors périmètre

- P191.04 (qui peut participer à un groupe de bail).

## Notes d'implémentation

- Reproduit sur `c7f6c4101` : `allows` restait vrai pour le retiré.
- Ablation : le bloc neuf retiré → rouge (« true is false ») ; rétabli → vert.
