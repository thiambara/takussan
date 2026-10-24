---
id: TCK-2018
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
rendait vrai dès que `user.id === property.user_id`, avant tout jugement d'agence. L'agent qui a
saisi un bien d'agence, suspendu ou retiré, le resoumettait (`POST /api/properties/{id}/resubmit`
→ 200, statut `pending_review`, motif et rejet effacés).

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite

## Delta à produire

- [x] `resubmit` : `user_id` ne vaut titre que sur un bien sans agence, ou pour un bailleur de l'agence (`BailleurDuBien::est`) non bloqué — la règle de `BasePolicy::bailleurEcrit`, recopiée parce que cette policy n'étend pas `BasePolicy`. Le personnel actif garde sa branche.
- [x] Test `AgentCreateurResoumissionTest`.

## Critères d'acceptation

- [x] AC1 — Agent créateur suspendu, puis retiré : 403, statut `rejected` et motif inchangés.
- [x] AC2 — Bailleur bloqué dans l'agence : 403 (la piste nomme `bailleurEcrit`, qui le refuse).
- [x] AC3 — Bailleur actif, particulier d'un bien sans agence, agent créateur actif (au titre du personnel) : 200, `pending_review`.

## Hypothèse

- `PropertyModerationPolicy` n'étend pas `BasePolicy` : la faire hériter pour appeler
  `bailleurEcrit` lui aurait ajouté les abilities par défaut de `BasePolicy` ; la condition est
  donc écrite en place, avec `BailleurDuBien::est` et `isBlockedOwnerAt`.

## Notes d'implémentation

- Ablation : policy de `pre-dev` → 3 rouges sur 6 (200 au lieu de 403) ; remise → 6 verts.
