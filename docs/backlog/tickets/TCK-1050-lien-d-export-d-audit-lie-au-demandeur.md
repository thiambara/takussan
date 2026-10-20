---
id: TCK-1050
title: "L'export d'audit asynchrone se nomme d'un identifiant opaque, et son lien est lié au demandeur"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-63--exports-asynchrones-liens-signés-et-fichiers-déposés"
tags: [api, audit, export, lien-signe, rgpd, pistes]
---

## Contexte

Réf : **P63.01** du fichier de pistes, `validé` par le porteur (V3, V2). Au-delà de 5 000 lignes,
`ExportActivityLogJob` écrivait `exports/audit/audit-trail-{agence}-{from}-{to}.{format}`, où
`{agence}` est le nom d'agence réduit à `[a-z0-9-]` (ou `platform`), et le lien signé ne portait
que ce chemin. Deux agences homonymes, ou une agence nommée « Platform » et un super-admin,
écrivaient le même fichier : le lien de l'un servait le journal de l'autre. Re-mesuré le
2026-10-20 sur `pre-dev` 96392a9cb par les tests ci-dessous, rouges avant correctif (le lien de
« Immo Dakar » rend le témoin de « Immo-Dakar » ; celui de « Platform » rend une agence tierce).

## Décision du porteur

> validé — (b) nommer le fichier d'un identifiant opaque (le nom lisible pour le seul `Content-Disposition`) et lier la signature au demandeur, vérifié au téléchargement ; test : deux agences de même nom, chaque lien ne rend que la sienne, et la variante « Platform » (porteur, 2026-10-20)

## Objectif

Un lien d'export d'audit ne sert que le fichier écrit pour son demandeur.

## Delta à produire

- [x] `ExportActivityLogJob` : fichier `exports/audit/{user_id}/{uuid}.{format}`, lien signé sur
      `user`, `file` et `name` (le nom lisible).
- [x] `ActivityLogExportController::download` : signature, puis `file` au format du nom opaque,
      demandeur existant, fichier cherché dans le seul dossier du demandeur signé ;
      `Content-Disposition` au nom lisible. `storagePath()` partagé.
- [x] `CrossTenantAuditController::export` (console, même route de téléchargement) : même
      rangement et même lien.
- [x] Tests dans `tests/Feature/Audit/AgencyAuditScopeTest.php` ; tests existants adaptés
      (`allFiles`, falsification de `file=` au lieu de `path=`).

## Critères d'acceptation

- [x] AC1 — Deux agences « Immo Dakar » et « Immo-Dakar » : chaque lien ne rend que son journal,
      sous le nom lisible `audit-trail-immo-dakar-….csv`.
- [x] AC2 — Une agence nommée « Platform » puis un super-admin : le lien de l'admin ne rend pas
      le journal de la plateforme.
- [x] AC3 — Le fichier d'un demandeur, signé pour un autre demandeur : 404.
- [x] AC4 — Un lien falsifié reste refusé en 403.

## Hypothèses (mode sans humain)

- « Vérifié au téléchargement » : la route reste hors `auth:sanctum` (le lien part par courriel),
  et la vérification porte sur le demandeur signé : il existe, et le fichier est dans son dossier.
  Les droits du demandeur au moment du clic ne sont pas rejugés.
- Les liens envoyés avant ce changement (paramètre `path`, 24 h au plus) rendent 404.

## Hors périmètre

- P63.04 (retrait de `download_url` de `toArray()`, purge des fichiers à l'échéance) et P63.02
  (route du courriel « export de rapport prêt ») : hors du lot.

## Notes d'implémentation

- Ablations : `storagePath()` sans le dossier du demandeur → rouge sur AC3 (le lien détourné rend
  200) ; job et contrôleurs remis à l'origine → 3 rouges ; remis → 37 verts sur `tests/Feature/Audit`
  et `ActivityLogExporterTest`.
- L'export de la console écrivait sous `exports/audit/` et passait par la même route : le laisser
  sur `path=` l'aurait cassé.
