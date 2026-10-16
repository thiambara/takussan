---
id: TCK-690
title: "Le courriel d'invitation part après le commit de la transaction de l'appelant"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#onboarding-parcours
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-11--notifications--doublons-préférences-échecs
tags: [api, invitation, mail, transaction, pistes]
---

## Objectif utilisateur

Un gérant d'agence qui invite un agent, un propriétaire ou un prestataire ne perd pas son
invitation quand le transport de courriel tombe en panne, et l'invité ne reçoit jamais un lien
vers une invitation qui n'a pas été enregistrée.

Réf : P11.02 (`docs/plans/2026-10-15-pistes-d-amelioration.md`, angle 11).

## Contrat de données

Aucun changement de schéma ni d'endpoint. Endpoints concernés, inchangés :
`POST /api/agencies/{agency}/agents/invite`, `…/owners/invite`, `…/service-providers/invite`.

## Contraintes strictes (métier)

- Le comportement attendu est écrit dans le code appelé : `InvitationService::send()` envoie
  « intentionally *outside* the DB transaction », pour qu'une panne SMTP ne défasse pas
  l'invitation fraîchement écrite (l'inviteur peut la relancer).
- Les trois services par rôle (`AgentInvitationService`, `OwnerInvitationService`,
  `ServiceProviderInvitationService`) appellent `send()` depuis leur propre `DB::transaction` :
  l'envoi synchrone s'y retrouvait.
- Le renvoi (`resend()`) garde son choix délibéré (TCK-367 : le courriel part DANS la transaction,
  un échec la défait) : hors périmètre.

## Delta à produire

- [x] Service : `InvitationService::send()` diffère `deliver()` par `DB::afterCommit(...)` — immédiat
      hors transaction, au commit le plus externe sinon, abandonné si l'appelant échoue.
- [x] Tests : `tests/Feature/Invitation/InvitationDeliveredAfterCommitTest` (5 scénarios).

## Critères d'acceptation

- [x] AC1 — transport en panne sous `POST …/agents/invite`, `…/owners/invite` et
      `…/service-providers/invite` : l'invitation et le profil `Draft` existent après la réponse.
- [x] AC2 — un appelant dont la transaction échoue après `send()` ne laisse partir aucun
      `InvitationMailable`, et aucune invitation ne subsiste.
- [x] AC3 — hors panne, le courriel part toujours (201, `InvitationMailable` envoyé).

## Hors périmètre

- Le code de réponse sous panne reste **500** (l'exception du transport remonte après le commit,
  comme pour un appel de `send()` hors transaction). Rendre un 201 avec un avertissement serait un
  comportement visible neuf (V7).
- Mettre `InvitationMailable` en file : la piste le citait comme alternative ; non retenu, le
  commentaire de `send()` l'écarte.
- `resend()` et `remindPending()` : inchangés.
- Les 35 échecs Resend de préproduction n'ont pas été re-mesurés (hors poste).

## Notes d'implémentation

- Hypothèse (mode sans humain) : « outside the DB transaction » couvre aussi la transaction de
  l'appelant ; c'est le seul sens où le commentaire tient pour les trois services par rôle.
- `RefreshDatabase` n'empêche pas `afterCommit` de jouer : le gestionnaire de transactions ignore
  le niveau ouvert par le test, et le rappel part au commit de la transaction applicative.
- Panne simulée par un transport `Mail::extend('panne', …)` qui lève `TransportException`.
- Ablation : `DB::afterCommit(...)` remplacé par l'appel direct → 4 rouges sur 5 (invitation
  absente sur les trois voies, courriel envoyé malgré le rollback) ; correctif remis → 5 verts.
