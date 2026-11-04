---
id: TCK-732
title: "POST /api/documents : même 404 pour un porteur introuvable et un porteur interdit"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-3--isolation-entre-agences-et-autorisation"
tags: [back, documents, authorization, isolation, pistes]
---

## Contexte

Réf : **P03.06** du fichier de pistes, `validé` par le porteur (critère accordé : V2).

`DocumentController::store()` cherche le porteur (`find()`) et rend 404 `document.owner_not_found`
s'il n'existe pas, **avant** d'appeler `authorize('attachTo')`, qui rend 403 sinon. Un compte
connecté apprend ainsi si un bail, un client ou un bien d'une autre agence existe, en essayant
des identifiants.

## Décision du porteur

POST /api/documents : même 404 pour « introuvable » et « interdit » ; le reste tel quel

## Objectif utilisateur

Un compte sans droit sur un porteur ne distingue plus, à la réponse de `POST /api/documents`, un
porteur qui n'existe pas d'un porteur qui ne lui appartient pas.

## Contraintes strictes (métier)

- La règle reste `DocumentPolicy::attachTo()` ; seul le code rendu au refus change.
- Un appelant autorisé reçoit les mêmes réponses qu'avant (201, 422).
- Le code et le texte sont ceux qui existent : `document.owner_not_found`, aucun texte neuf.

## Delta à produire

- [x] `DocumentController::store()` : un refus de `attachTo` rend 404 `document.owner_not_found`,
  comme un porteur introuvable.
- [x] `DocumentTest` : le cas « porteur d'un autre » attend ce 404 et ce code, et un cas
  « porteur introuvable » rend la même réponse.

## Critères d'acceptation

- [x] AC1 — Compte sans lien avec un bien existant → 404, `code = document.owner_not_found`.
- [x] AC2 — Identifiant de bien inexistant → 404, même code, même message.
- [x] AC3 — Le propriétaire du bien dépose toujours (201).

## Hors périmètre

- Le rapprochement bancaire (404 puis 403 `reconciliation.cross_agency`) et la conversation
  (`participants_unavailable` puis `guardReach()`) : la décision du porteur les garde « tels
  quels ».

Hypothèses (mode sans humain) :
- le refus se juge par `Gate::check` (`$user->can('attachTo', …)`), qui passe par la même policy
  et les mêmes `before` qu'`authorize()` ;
- le 422 `document.unsupported_type` reste avant : il ne dépend que du corps, pas de l'existence
  d'une ligne.

## Notes d'implémentation

- Ablation : `DocumentController` remis à l'état d'origine → 2 rouges (`random user cannot upload
  document…`, 403 au lieu de 404 ; `forbidden owner and missing owner get the same response`,
  « 403 is identical to 404 ») ; remis, 11 verts.
- Le refus passe par `$user->can()` et non `authorize()` : `authorize()` lève une
  `AuthorizationException` que l'enveloppe rend en 403, quel que soit le code voulu.
