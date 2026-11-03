---
id: TCK-2223
title: "`invitations:expire` et la révocation relisent l'invitation sous verrou et rejugent son état"
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
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-229--tâches-planifiées-qui-transitent-une-ligne-chargée-en-lot-face-au-geste-joué-pendant-leur-passage"
tags: [back, invitation, concurrence, pistes]
---

## Objectif utilisateur

Une invitation relancée, révoquée ou acceptée pendant le passage de `invitations:expire` garde son
état, et l'invitant ne reçoit pas d'avis d'expiration pour elle. Une révocation ne repasse pas en
`revoked` une invitation acceptée entre-temps.

## Contexte

Réfs : **P229.01** et **P229.02** du fichier de pistes, `retenu · autonome` (A1 : le commentaire de
`resend` disait déjà que son verrou fermait la course avec le cron et la révocation ; `revoke`
refusait déjà une invitation acceptée par 422 `invitations.errors.already_accepted`). Même cause
(écriture sur le modèle chargé avant la transaction), même correctif : un ticket.

Avant (mesuré, geste joué dans l'écouteur `retrieved` après la lecture de la tâche) : relance →
`expired` avec échéance neuve et un avis d'expiration ; révocation → `expired` ; acceptation →
`expired` avec `accepted_at` ; `revoke()` sur un modèle resté `sent` après une acceptation en base
→ `revoked`.

## Hypothèses (mode sans humain)

- `expire()` relit chaque ligne sous verrou en rejouant la sélection (`sent`, échue) plutôt que par
  une mise à jour conditionnelle : l'écriture garde `save()` et donc les événements du modèle.
- `expire()` rend les seules invitations expirées : `ExpireInvitations` affiche ce compte.

## Delta à produire

- [x] `InvitationService::expire()` : relecture sous verrou, sélection rejugée, journal et avis
  seulement pour une ligne prise.
- [x] `InvitationService::revoke()` : relecture sous verrou, `revoked` et `accepted` rejugés sur la
  ligne fraîche.
- [x] Commentaire de `resend()` corrigé.
- [x] Test : `tests/Feature/Invitation/ExpirationFaceAuGesteConcurrentTest.php`.

## Critères d'acceptation

- [x] AC1 — Relance après la lecture de la tâche → `sent`, échéance future, aucun avis ni journal
  d'expiration, rien de rendu.
- [x] AC2 — Révocation après la lecture → `revoked`, aucun avis.
- [x] AC3 — Acceptation après la lecture → `accepted`, aucun avis.
- [x] AC4 — Sans geste concurrent, l'expiration est écrite, journalisée et annoncée.
- [x] AC5 — `revoke()` sur un modèle périmé d'une invitation acceptée → 422, ligne intacte, aucun
  journal.

## Hors périmètre

- Ce que l'acceptation fait du profil (P229.02 ne l'a pas joué).

## Notes d'implémentation

- **Ablation** : `InvitationService.php` remis à `origin/pre-dev` → 4 rouges sur 5 (AC4 reste
  vert, c'est le témoin) ; correctif remis → 5 verts.
- Le geste est joué une seule fois dans `Invitation::retrieved` : la relecture sous verrou de la
  tâche déclenche aussi `retrieved`, d'où le drapeau.
