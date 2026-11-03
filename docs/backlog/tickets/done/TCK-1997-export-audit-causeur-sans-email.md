---
id: TCK-1997
title: "L'export du journal d'audit nomme `user#<id>` un causeur sans e-mail, au lieu de « system »"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#lexport-du-journal-daudit-attribue-au--système--les-gestes-dun-membre-sans-e-mail"
tags: [api, audit, export, pistes]
---

## Contexte

Réf : **P193.03** du fichier de pistes, `validé` (V3 accordé).

`ActivityLogExporter::mapRow` écrivait `causer_email => $causer?->email ?? $absentCauser` : un
causeur chargé sans e-mail tombait dans le repli `system` d'une ligne sans causeur.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : `causer_email` : l'e-mail, sinon `user#<id>`, jamais le téléphone

## Objectif utilisateur

Les gestes d'un membre sans e-mail lui restent attribués dans l'export.

## Delta à produire

- [x] `ActivityLogExporter::mapRow` : causeur présent → e-mail, sinon `user#<id>` ; causeur supprimé
  → `deleted#<id>` et aucun causeur → `system`, inchangés.
- [x] `tests/Feature/Audit/CauseurSansEmailDansLExportTest.php` (export d'agence et de la console).

## Critères d'acceptation

- [x] AC1 — un causeur sans e-mail sort en `user#<id>`, dans les deux exports.
- [x] AC2 — son numéro n'apparaît nulle part dans la ligne.
- [x] AC3 — un causeur à e-mail garde son e-mail.

## Hors périmètre

- La colonne `causer_id` neuve que la `Piste` évoquait : la décision ne la retient pas.

## Notes d'implémentation

- Avant correctif : `system` au lieu de `user#<id>`. Ablation : le même rouge ; remise → vert.
