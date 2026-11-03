---
id: TCK-972
title: "Un compte bloqué ou au statut `deleted` n'est plus un contact joignable de la messagerie"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-compte-bloqué-est-proposé-par-le-sélecteur-de-participants-et-accepté-dans-un-groupe-comme-dans-une-directe"
tags: [back, messaging, pistes]
---

## Objectif utilisateur

Le sélecteur de participants ne propose plus un compte qui ne peut ouvrir aucune session, et le
serveur refuse de l'ajouter à un groupe ou d'ouvrir une directe avec lui.

## Contexte

Réf : **P51.01** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`MessagingReach::query()` ne filtrait aucun `users.status` : seul le `SoftDeletes` du modèle
écartait un compte. Mesuré avant correctif (test de garde ci-dessous, sans le correctif) : un
correspondant passé à `blocked`, et un autre à `deleted`, sortent tous deux dans
`GET /api/conversations/contacts`.

## Décision du porteur (déléguée)

> écarter `UserStatus::Blocked` et `UserStatus::Deleted` dans `MessagingReach::query()`, pour que la liste, `outOfReach()` et les trois FormRequests suivent ; `inactive` reste joignable ; test « compte bloqué → absent de la liste, 422 à la création d'un groupe et d'une directe »

## Hypothèses (mode sans humain)

- `users.status` est `NOT NULL` (défaut `active`, migration `2026_04_15_210400`) : un `NOT IN`
  n'écarte donc aucune ligne par un `NULL`.
- Les fils existants d'un compte bloqué ne sont pas touchés : seule la joignabilité change, et un
  compte débloqué redevient joignable.

## Delta à produire

- [x] `MessagingReach::query()` écarte `blocked` et `deleted` ; l'en-tête le dit.
- [x] Test : `MessagingContactsTest::test_un_compte_bloque_n_est_ni_liste_ni_accepte`.

## Critères d'acceptation

- [x] AC1 — un compte `blocked` ou `deleted` est absent de `GET /api/conversations/contacts` et de
  `GET /api/conversations/{id}/contacts`.
- [x] AC2 — `POST /api/conversations` le refuse en 422, en groupe comme en directe ;
  `POST /api/conversations/{id}/participants` aussi.
- [x] AC3 — un compte `inactive` reste listé et accepté.

## Hors périmètre

- Ce que reçoit un compte bloqué déjà participant d'un fil (notification, e-mail) : non mesuré.

## Notes d'implémentation

- Ablation : la ligne `whereNotIn('users.status', …)` retirée → 1 rouge
  (`test_un_compte_bloque_n_est_ni_liste_ni_accepte`, liste à 4 au lieu de 2) ; remise → 20 verts.
