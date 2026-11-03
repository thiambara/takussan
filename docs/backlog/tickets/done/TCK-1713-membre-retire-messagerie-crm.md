---
id: TCK-1713
title: "Messagerie : le référent retiré de l'agence ne joint plus ses anciens clients par le lien CRM"
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
  features: ["docs/features.md#112-agence--équipe"]
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-153--ce-que-le-retrait-en-leave_unassigned-laisse-au-nom-du-retiré-et-ce-qui-le-lit-encore"
tags: [back, agence, messagerie, pistes]
---

## Objectif utilisateur

Un client de l'agence ne reçoit plus de message, par le lien CRM, d'un ancien agent qui ne
représente plus l'agence.

Réf : **P153.06**.

## Décision du porteur

- P153.06 : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Critère accordé : V7 (V3 voisin).

**Choix de l'implémenteur.** La piste demande de décider si la règle 2 exige l'appartenance de
l'acteur, puis propose deux voies : clore les relations au retrait, ou borner la règle par
`customers.agency_id`. Retenu : **oui**, par la seconde, au plus étroit — un rattachement
(`user_customer_relationships`) à une fiche **d'agence** ne compte que pour qui a encore un profil
**de tout statut** (bailleur, agent, admin) dans l'agence de la fiche. « Personnel de l'agence »
aurait coupé le bailleur de son locataire (règle 2 : « un propriétaire joint son locataire ») ; la
clôture des relations écrirait des données au retrait et ne couvrirait pas les relations déjà
orphelines. La règle vaut dans les trois sens de la règle 2 (le client ne joint plus le retiré par
sa fiche). Une fiche sans agence ne change pas.

## Delta à produire

- [x] `MessagingReach::liveAttachment`, appliqué aux rattachements lus par les règles 2.a, 2.b, 2.c.
- [x] Docblock de la règle 2.
- [x] Test : `MembreRetireMessagerieCrmTest`.

## Critères d'acceptation

- [x] AC1 — agent référent actif d'une fiche de l'agence à compte, retiré en `leave_unassigned` : le client n'est plus dans `MessagingReach::query`, `POST /api/conversations` vers lui → 422.
- [x] AC2 — le client ne joint plus le retiré par sa fiche ; le bailleur de l'agence rattaché à la même fiche joint toujours le client.

## Hors périmètre

- Le marquage du référent parti dans `…/customers/{id}/relationships` (reste de P153.08).

## Notes d'implémentation

- Ablation : `MessagingReach` remis → AC1 rouge ; remis → vert. `MessagingContactsTest` (fiches
  sans agence) inchangé, 26/26.
