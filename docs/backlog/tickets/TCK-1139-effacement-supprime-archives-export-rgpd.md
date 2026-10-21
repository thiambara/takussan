---
id: TCK-1139
title: "L'effacement d'un compte supprime ses archives d'export RGPD"
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
    - "docs/models-spec.md#57-dataexport-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#larchive-dexport-rgpd-survit-à-leffacement-du-compte-et-le-super-admin-qui-la-demandée-la-télécharge-encore"
tags: [back, rgpd, exports, pistes]
---

## Objectif utilisateur

Une personne dont le compte est effacé ne laisse pas derrière elle une archive de ses données en
clair, que le super-admin qui l'a demandée pourrait encore télécharger.

## Contexte

Réf : **P77.01** du fichier de pistes, `validé` (critère V3 accordé).

`AccountDeletionService::anonymize()` ne touchait ni `data_exports` ni le fichier : le compte
n'étant que soft-deleted, la FK `data_exports.user_id` en cascade ne joue pas. Mesuré avant
correctif (test de garde ci-dessous, `pre-dev` cdef5c26f) : export `ready` demandé par un
super-admin, puis `anonymize($sujet, false)` → l'archive existe encore.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la voie unique de la `Piste`, sur le modèle de `PurgeExpiredDataExports` — le
fichier est supprimé, `archive_path` remis à `null`, la ligne reste et passe à `expired`. Le
téléchargement rend alors 404 (statut non `ready`).

## Hypothèses (mode sans humain)

- Sont visés les exports `ready` et tout export qui porte encore un `archive_path`. Un export
  `queued` n'a pas besoin d'être touché : `DataExportBuilder::build()` lit le compte par
  `firstOrFail()`, qui ne voit plus un compte soft-deleted, et l'export passe à `failed`.
- La ligne `data_exports` reste : elle est la trace de la demande (registre des droits).

## Delta à produire

- [x] `AccountDeletionService::anonymize()` : supprime les archives des exports du compte, remet
  `archive_path` à `null` et passe l'export à `expired`.
- [x] Test `AccountDeletionExecuteTest::test_l_effacement_supprime_les_archives_d_export_du_compte`.

## Critères d'acceptation

- [x] AC1 — un export `ready` d'un compte, puis `anonymize()` → fichier absent, statut `expired`,
  `archive_path` nul.
- [x] AC2 — le téléchargement par le super-admin qui l'a demandé rend 404.

## Hors périmètre

- La purge des exports de rapport et d'audit (P77.02, P63.04).

## Notes d'implémentation

- Ablation : `AccountDeletionService.php` rendu à `cdef5c26f` → 1 rouge (`assertMissing`, archive
  présente) ; remis → la classe entière 16/16.
