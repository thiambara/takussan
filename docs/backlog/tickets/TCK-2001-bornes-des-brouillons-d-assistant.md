---
id: TCK-2001
title: "Un brouillon d'assistant est borné à 256 Kio, et un compte à 20 brouillons"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#70-wizarddraft-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-brouillons-dassistant-nont-ni-borne-de-taille-ni-de-nombre-et-laccueil-les-relit-tous-données-comprises"
tags: [api, wizard-drafts, validation, pistes]
---

## Contexte

Réf : **P181.03** du fichier de pistes, `validé` (V7 accordé).

`UpsertWizardDraftRequest` acceptait un `data` `nullable|array` sans borne, et un compte autant de
clés qu'il voulait ; `GET /api/me/wizard-drafts` les rend toutes, données comprises (mesuré par le
mesureur : 5 Mo accepté en 201).

## Décision du porteur

> validé — validation du porteur (2026-10-23) : la recommandation du délégué : 256 Kio sur `json_encode(data)`, 20 brouillons par compte ; retirer `data` de la liste est un autre ticket

## Objectif utilisateur

Un brouillon reste de taille raisonnable, et la liste de l'accueil n'en compte pas plus de 20.

## Delta à produire

- [x] `UpsertWizardDraftRequest::MAX_OCTETS` (256 × 1024) et `::MAX_BROUILLONS` (20).
- [x] `UpsertWizardDraftRequest::after()` : `json_encode(data)` au-delà → 422 sur `data` ; une clé
  neuve quand le compte en a déjà 20 → 422 sur `key` ; la mise à jour d'une clé existante passe.
- [x] `tests/Feature/WizardDraft/WizardDraftBornesTest.php`.

## Critères d'acceptation

- [x] AC1 — 256 Kio + 1 octet → 422, rien d'écrit ; 256 Kio exactement → 201.
- [x] AC2 — 20 brouillons : une 21ᵉ clé → 422 ; la mise à jour d'une des 20 → 200 ; les brouillons
  d'un autre compte ne comptent pas.

## Hors périmètre

- Retirer `data` de `GET /api/me/wizard-drafts` (un autre ticket, par la décision).
- Le front n'affiche rien de neuf sur un refus : l'enregistrement automatique échoue en 422.

## Notes d'implémentation

- La taille d'un brouillon réel des quatre parcours n'a pas été mesurée (hypothèse : bien en deçà).
- Ablation (`after()` retiré) : 2 rouges ; remis → 2/2.
