---
id: TCK-1147
title: "Un bail en préavis bloque l'effacement du compte, comme un bail actif"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-81--état-du-bail-face-aux-écritures-dargent"
tags: [back, rgpd, lease, pistes]
---

## Objectif utilisateur

Un locataire ou un bailleur dont le bail est en préavis ne peut pas effacer son compte tant que le
bail court, comme pour un bail actif.

## Contexte

Réf : **P81.04** du fichier de pistes, `validé` (critère V3 accordé).

`AccountDeletionService::collectOpenObligations()` ne comptait comme bail en cours que `active` et
`pending_signature`, alors que `User::ACTIVE_TENANT_LEASE_STATUSES` (`active`, `terminating`) juge
le bail en préavis en cours ailleurs. Mesuré avant correctif (test de garde ci-dessous, `pre-dev`
cdef5c26f) : un locataire au bail `terminating`, sans échéance due, obtient 202 sur
`POST /api/auth/me/deletion-request`.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : les baux en cours se jugent par `User::ACTIVE_TENANT_LEASE_STATUSES`, **plus**
`pending_signature`, qui bloquait déjà : la lecture littérale (la constante seule) aurait cessé de
bloquer un bail en attente de signature, ce que la piste ne demande pas.

## Reste à faire

> écrire dans TCK-957 si les types `regularization` et `charges` restent permis après la sortie

Non fait : c'est un choix de produit (permis ou non après la sortie) que ni la piste ni la
validation ne tranchent.

## Delta à produire

- [x] `AccountDeletionService::openLeaseStatuses()`, lu par les deux requêtes de baux de
  `collectOpenObligations()`.
- [x] Test `AccountDeletionRequestTest::test_blocked_by_a_terminating_lease_as_tenant_and_as_landlord`.

## Critères d'acceptation

- [x] AC1 — bail `terminating` côté locataire, sans échéance due → 422, obligation `lease`.
- [x] AC2 — bail `terminating` côté bailleur → 422, obligation `lease`.

## Hors périmètre

- La règle des écritures après la sortie (reste ci-dessus).

## Notes d'implémentation

- Ablation : service rendu à l'état d'avant → 1 rouge (202 au lieu de 422) ; remis → la classe
  entière 13/13.
