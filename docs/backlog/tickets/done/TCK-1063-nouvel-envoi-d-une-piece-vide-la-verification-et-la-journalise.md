---
id: TCK-1063
title: "Un nouvel envoi d'une pièce de profil vide sa vérification et journalise celle qu'il remplace"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-64--pièces-kyc-des-profils-à-leffacement-à-la-fin-du-profil-et-au-re-téléversement"
tags: [api, kyc, audit, pistes]
---

## Contexte

Réf : **P64.04** du fichier de pistes, `validé` (V3). Les trois `uploadKyc` (propriétaire, agent,
prestataire) font un `updateOrCreate` sur (profil, type) qui écrit `is_verified = false` sans
toucher `verified_by` ni `verified_at` : après un nouvel envoi, la pièce se dit « non vérifiée »
mais garde l'auteur et la date de la vérification du fichier précédent.

## Décision du porteur

> remettre `verified_by` et `verified_at` à `null` avec `is_verified` dans une méthode partagée, et écrire au journal d'audit qui avait vérifié la pièce remplacée, pour en garder la trace (porteur, 2026-10-20)

## Objectif

Après un nouvel envoi, les trois champs de vérification sont vides, et le journal d'audit dit qui
avait vérifié la pièce remplacée, et quand.

## Delta à produire

- [x] `App\Services\Kyc\ProfilePieces::upsert()` : sous transaction, lit la pièce existante
      (verrou), écrit au journal `document_verification_reset` (`verified_by`, `verified_at`,
      causé par l'auteur de l'envoi) si elle portait une vérification, puis `updateOrCreate`
      avec les trois champs remis à zéro.
- [x] Les trois `uploadKyc` passent par elle.
- [x] Test : `KycDocumentsDerivedTest::test_un_nouvel_envoi_efface_la_verification_et_la_journalise`,
      sur les trois profils.

## Critères d'acceptation

- [x] AC1 — Après un nouvel envoi d'une pièce vérifiée, `is_verified`, `verified_by` et
      `verified_at` sont vides, pour chacun des trois profils.
- [x] AC2 — Une ligne `document_verification_reset` a la pièce pour sujet, l'auteur de l'envoi pour
      cause, et porte `verified_by` et `verified_at` de la vérification remplacée.
- [x] AC3 — Un envoi sur une pièce non vérifiée n'écrit rien au journal.

## Hypothèses (mode sans humain)

- **Journal d'audit = `activity_log`** (`activity('Document')`), le journal que lit la console
  d'audit ; `Document` n'y écrit rien de lui-même.
- **Le journal n'écrit que s'il y a une vérification à perdre** (`is_verified` ou `verified_by`
  posé) : sinon, il n'y a pas de trace à garder.

## Hors périmètre

- `DocumentController::verify()`, qui pose les trois champs ensemble, inchangé.

## Notes d'implémentation

- Avant correctif : 3 rouges (`verified_by` encore posé). Ablations : remise à `null` retirée →
  3 rouges ; journal retiré → 3 rouges. Remis → 11 verts sur la classe, 69 verts sur les
  classes qui téléversent une pièce.
- L'import `Document` de `ServiceProviderProfileController` n'avait plus d'usage, il est retiré.
