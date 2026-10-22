---
id: TCK-1339
title: "Une invitation ouverte d'une agence supprimée est révoquée et ne s'accepte plus"
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
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-129--suppression-douce-dune-agence"
tags: [back, invitations, agences, pistes]
---

## Contexte

Réf : **P129.03** du fichier de pistes, `validé` par le porteur (critère V7 accordé). Entrée dans le
lot de l'angle 123 par la famille : elle cite `InvitationService.php`, que P123.02 (TCK-1335)
modifie.

`DELETE /api/agencies/{id}` ne révoquait pas les invitations ouvertes : `invitations:remind` les
relançait, et `POST /api/invitations/{token}/accept` rendait 200 (le mesureur a vu une
collaboration de prestataire passer à `active` vers l'agence supprimée).

## Décision du porteur

validé — porteur (2026-10-22) : révoquer les invitations `sent` de l'agence à sa suppression et refuser l'acceptation d'une invitation dont l'agence n'existe plus (410)

## Contrat de données

- `DELETE /api/agencies/{id}` : inchangé (204) ; les invitations `sent` de l'agence passent
  `revoked`, avec `revoked_at` et une ligne `invitation_revoked` causée par qui supprime.
- `POST /api/invitations/{token}/accept` : 410 `invitation.token_revoked` si l'agence de
  l'invitation n'existe plus. **Choix** : le code existant `invitation.token_revoked`, dont le front
  a déjà le texte, plutôt qu'un code neuf (la décision fixe le statut 410, pas le code).

## Delta à produire

- [x] `InvitationService::revokeOpenForAgency()`, par `revoke()`.
- [x] `AgencyController::destroy()` : révocation et suppression dans une même transaction.
- [x] `lookupActiveInvitation()` : 410 si l'agence n'existe plus (invitations restées ouvertes
  d'une agence supprimée avant ce ticket, ou hors de la route).
- [x] `tests/Feature/Invitation/InvitationAgenceSupprimeeTest.php`.

## Critères d'acceptation

- [x] AC1 — suppression par la route : l'invitation passe `revoked`, celle d'une autre agence reste
  `sent`, `remindPending()` à J+4 ne la relance pas, l'acceptation rend 410 et ne crée aucun compte.
- [x] AC2 — agence supprimée hors de la route : l'invitation reste `sent`, l'acceptation rend 410.

## Hors périmètre

- Une invitation `expired` d'une agence supprimée n'est pas révoquée (la décision vise les `sent`) ;
  sa relance (`resend`) reste possible, mais son acceptation rend 410 (AC2).
- La restauration d'une agence ne rouvre pas ses invitations (P129.06).

## Notes d'implémentation

- Ablation : service et contrôleur remis à l'origine → 2 rouges (statut `sent`, puis 200), remis → 2/2.
