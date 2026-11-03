---
id: TCK-1435
title: "Une entrée liée du registre des droits ne se clôt pas à la main tant que sa demande vit"
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
  adr:
    - "docs/adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-147--statuts-posés-par-un-ruleenum-entier-dans-les-requêtes-décriture"
tags: [back, rgpd, registre, console, pistes]
---

## Contexte

Réf : **P147.08** du fichier de pistes, `validé` par le porteur (critère V3 accordé).

`PrivacyRegistryObserver` répond seul l'entrée d'un export prêt ou d'un effacement exécuté, et
retire celle d'un effacement annulé (ADR-0044 §4). `PATCH /api/admin/privacy-requests/{id}`
acceptait pourtant les cinq statuts sur une entrée liée : mesuré par le mesureur, une entrée
d'effacement en attente passée `rejected` à la main, puis l'effacement exécuté, et le registre
gardait `rejected` sans `answered_at`.

## Décision du porteur

validé — porteur (2026-10-22) : refuser toute clôture manuelle d'une entrée liée du registre tant que sa demande vit

## Contrat de données

- `PATCH /api/admin/privacy-requests/{id}` : passer une entrée ouverte à un statut clos
  (`answered`, `rejected`, `withdrawn`) alors que `PrivacyRequest::linkedRequestIsPending()` →
  **422 `privacy.request_linked_pending`**, rien n'est écrit (ni statut, ni résumé, ni preuve).
- « Sa demande vit » (hypothèse, lue des écrivains de l'observateur) : l'effacement lié existe et
  n'est pas exécuté (annulé, il est supprimé : l'entrée est déjà `withdrawn`) ; l'export lié est
  `queued` ou `processing`. Un export `failed` ou `expired` ne répondra plus : l'entrée revient à
  la main.
- Les gestes qui laissent l'entrée ouverte (résumé, `received`/`in_progress`) restent permis.
- Messages `errors.privacy.request_linked_pending` en `fr` et `en` ; en `wo`, le texte français
  (wolof en pause).

## Delta à produire

- [x] `PrivacyRequest::linkedRequestIsPending()`.
- [x] `PrivacyRequestController::update` : refus avant toute écriture.
- [x] Clé `errors.privacy.request_linked_pending` dans les trois langues.
- [x] `tests/Feature/Privacy/PrivacyRegistreEntreeLieeTest.php`.

## Critères d'acceptation

- [x] AC1 — entrée d'un effacement en attente : `answered`, `rejected`, `withdrawn` → 422, entrée
  `in_progress`, `answered_at` nul.
- [x] AC2 — entrée d'un export en file : `rejected` → 422.
- [x] AC3 — entrée d'un export en échec : `rejected` → 200.
- [x] AC4 — entrée liée, `received` avec un résumé → 200.

## Hors périmètre

- L'écran du registre à la console : il affiche le message de l'API ; aucun bouton n'est retiré.

## Notes d'implémentation

- Ablation : la condition `linkedRequestIsPending()` neutralisée → 4 rouges (200), remise → 6/6.
