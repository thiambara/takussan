---
id: TCK-1499
title: "Une agence ne se supprime plus : `DELETE /api/agencies/{agency}` est retirée"
status: done
phase: P2
family: cleanup
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  adr:
    - "docs/adr/0048-effet-d-une-suspension-d-agence.md#amendement-du-2026-10-22--une-agence-ne-se-supprime-pas-elle-sort-du-cycle-de-vie-par-son-statut"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-129--suppression-douce-dune-agence"
tags: [back, agence, routes, pistes]
---

## Contexte

Réfs : **P129.06** et **P129.02** du fichier de pistes, toutes deux `validé`. Même cause : la
suppression d'agence contournait le cycle de vie d'ADR-0048, et ses effets (pénalités et relances
d'une agence supprimée, P129.02) n'ont plus d'objet une fois qu'aucune agence ne se supprime.

## Décision du porteur

- P129.06 : validé — porteur (2026-10-22) : appliquer ADR-0048 (amendement du 2026-10-22) : retirer `DELETE /api/agencies/{agency}`, `AgencyController::destroy` et ses deux tests, avec le test de routes qui exige qu'elle ne revienne pas
- P129.02 : validé — porteur (2026-10-22) : réglée par P129.06 (ADR-0048, amendement du 2026-10-22) : aucune agence ne se supprime plus ; rien à implémenter à part

## Delta

- [x] Route `agencies.destroy` retirée de `routes/api/agencies.php`.
- [x] `AgencyController::destroy` retirée (et l'import d'`InvitationService` devenu inutile).
- [x] `AgencyTest::test_primary_admin_can_delete_agency` et
  `test_non_primary_admin_cannot_delete_agency` retirés, pas réécrits (ADR-0048, « Ce qui garde »).
- [x] `SuppressionDAgenceRetireeTest` : la route n'est plus enregistrée, et ses six `DELETE`
  voisins sous `api/agencies/{agency}/…` le restent.
- [x] `InvitationAgenceSupprimeeTest::test_supprimer_l_agence_revoque_ses_invitations_ouvertes`
  passait par la route : il appelle désormais `InvitationService::revokeOpenForAgency` puis
  `$agency->delete()`, ce qui garde la révocation et le 410 (TCK-1339) sans la route.

## Hors périmètre

- `InvitationService::revokeOpenForAgency` n'a plus d'appelant dans `app/` (ADR-0048 : « sa
  révocation à la suppression n'a plus d'émetteur ») ; elle reste, gardée par son test, faute de
  décision sur son retrait.
- Le relevé des agences déjà supprimées en préproduction (ADR-0048, « Les agences déjà
  supprimées ») : hors du poste.

## Notes d'implémentation

- Ablation : route et action remises → `SuppressionDAgenceRetireeTest` rouge, retirées → vert.
