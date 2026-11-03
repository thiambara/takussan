---
id: TCK-2029
title: "L'agent créateur d'un bien d'agence, suspendu ou retiré, ne le resoumet plus à la modération"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, moderation, authorization, pistes]
---

## Contexte

Réf : **P190.06** du fichier de pistes, `validé` (V2 accordé). `PropertyModerationPolicy::resubmit`
rendait vrai dès que `user.id === property.user_id`, avant tout jugement d'agence : l'agent qui a
saisi le bien, suspendu ou retiré, resoumettait un bien rejeté (`POST /api/properties/{id}/resubmit`
→ 200, statut `pending_review`).

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite

## Hypothèses (mode sans humain)

- `PropertyModerationPolicy` n'étend pas `BasePolicy` : la règle de `bailleurEcrit` y est écrite
  en clair (`BailleurDuBien::est`, et non bloqué dans l'agence), plutôt que de changer la classe
  parente d'une policy enregistrée par `Gate::define`.

## Delta à produire

- [x] `PropertyModerationPolicy::resubmit` : `user_id` ne vaut titre que sur un bien sans agence ou
  pour un bailleur non bloqué de l'agence ; la branche du personnel actif est inchangée.
- [x] Test `AgentCreateurResoumissionTest`.

## Critères d'acceptation

- [x] AC1 — agent créateur suspendu, puis retiré → 403, statut `rejected` inchangé.
- [x] AC2 — bailleur bloqué → 403 ; bailleur actif, agent actif et propriétaire d'un bien sans
  agence → 200.

## Hors périmètre

- `approve` et `reject` (admin d'agence, P116.05).

## Notes d'implémentation

- Ablation : policy remise à l'état d'avant → 3 rouges (suspendu, retiré, bailleur bloqué : 200), vert remis.
