---
id: TCK-2164
title: "À la demande d'effacement d'un membre du personnel, les admins de l'agence reçoivent l'inventaire de son portefeuille"
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
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-204--travail-dun-agent-laissé-à-son-compte-effacé"
tags: [back, front, account, agency, notifications, pistes]
---

## Objectif utilisateur

L'administrateur d'une agence apprend qu'un membre de son équipe a demandé l'effacement de son
compte, avec ce que ce membre laisse (tâches, visites, interventions, biens, collaborations,
clients), assez tôt pour le passer à un collègue pendant les 30 jours de grâce.

## Contexte

Réf : **P204.01** du fichier de pistes, `validé`. `collectOpenObligations()` ne lit pas le
portefeuille (`AgentPortfolio`), et après l'exécution la passation n'est plus atteignable
(`{user}` lié sous `SoftDeletes`, 404). Pendant le délai de grâce, le compte n'est pas encore
supprimé : sa ligne d'équipe et l'assistant de passation restent ouverts.

## Décision du porteur

> validation du porteur (2026-10-24) : à la demande d'effacement, les administrateurs de l'agence reçoivent un avis avec l'inventaire du portefeuille de l'agent, à passer pendant les 30 jours de grâce par l'assistant existant ; à l'exécution, ce qui reste est libéré comme le dit P204.03

## Hypothèses (mode sans humain)

- L'avis part pour chaque agence où le compte porte un profil d'agent ou d'admin, et seulement si
  son portefeuille y est non vide (un inventaire vide n'a rien à passer).
- Destinataires : `AdminsDeLAgence::destinataires()` (admins actifs et joignables), le compte
  lui-même écarté s'il est admin.
- Code neuf `agency.member_deletion_requested`, non désactivable (comme les autres avis de la
  plateforme sur l'agence), cible `team` (`/app/agency/team`), paramètres : le nom du membre,
  la date d'exécution et un compte par catégorie de `AgentPortfolio::TRANSFERABLE`.
- Texte neuf en `fr` et `en` ; le `wo` porte le français (wolof en pause).
- Envoyé après le commit de la demande (`DB::afterCommit`).
- « À l'exécution, ce qui reste est libéré comme le dit P204.03 » : livré par le ticket de P204.03.

## Delta à produire

- [x] `NotificationCode::AgencyMemberDeletionRequested` (type, interrupteur nul, paramètres).
- [x] Textes API (`lang/{fr,en,wo}/notifications.php`) et cloche (`messages/{fr,en,wo}.json`).
- [x] `App\Services\Account\ErasedMemberPortfolio::notifyAgencies()`, appelé par `requestDeletion()`.
- [x] Tests : `EffacementAgentPortefeuilleAvisTest`, et le cas du code daté dans `FormeDesDatesDeNotificationTest`.

## Critères d'acceptation

- [x] AC1 — Un agent à deux tâches ouvertes demande l'effacement : l'admin de l'agence reçoit un avis `agency.member_deletion_requested`, `tasks = 2`, cible `team`.
- [x] AC2 — Un portefeuille vide ne prévient personne.
- [x] AC3 — Un admin qui s'efface n'est pas son propre destinataire ; l'autre admin l'est.

## Hors périmètre

- La libération de ce qui reste à l'exécution (P204.03, ticket à part).
- Ouvrir la passation d'un compte déjà effacé (voie (a) de la `Piste`, non retenue par la décision).

## Notes d'implémentation

- Ablation : l'appel `DB::afterCommit(… notifyAgencies …)` commenté → AC1 et AC3 rouges, AC2 vert (il garde l'absence) ; remis → vert.
- `FormeDesDatesDeNotificationTest` exige un émetteur réel pour tout code à paramètre daté : le code y est ajouté avec son cas.
