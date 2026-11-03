---
id: TCK-1145
title: "Les exports d'audit nomment le disque `local`, et un export de rapport en échec passe à `failed`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1143]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#62-reportexport-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-77--fichiers-du-disque-local-dans-le-volume-storage"
tags: [back, exports, audit, reporting, docs, pistes]
---

## Objectif utilisateur

Les exports du journal d'activité vont sur le même volume privé que les autres exports, quel que
soit `FILESYSTEM_DISK`, et le super-admin voit un export de rapport en échec comme tel.

## Contexte

Réf : **P77.04** du fichier de pistes, `validé` (critère V5 accordé).

Mesuré avant correctif (test de garde ci-dessous, `pre-dev` cdef5c26f), disque par défaut posé
ailleurs que `local` : le job d'export d'audit et l'export de la console écrivent sur le disque par
défaut (rien sur `local`), la purge des exports d'audit (TCK-1143) ne lit pas `local`, et
`GenerateReportExport` n'a pas de `failed()` (`Error`, méthode absente). `docs/configuration.md`
prescrivait `FILESYSTEM_DISK=s3` en production (l. 138 et 554), contre le plan d'hébergement
(`local`, l. 3532) et ADR-0029 (médias sur R2).

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenus : les quatre points de la `Piste`, sauf la purge des fichiers sans ligne, qui
s'écrit « dans la purge de P77.02 » : P77.02 est revenue au porteur (statut `expired` absent de
`docs/models-spec.md` § 62), ce point reste donc à faire avec elle.

## Hypothèses (mode sans humain)

- Le disque se nomme une fois, `ActivityLogExportController::DISK = 'local'`, lu par les deux
  écrivains, le téléchargement et la purge.
- `failure_reason` reçoit le message de l'exception, borné à 1 000 caractères. Les rapports sont
  des agrégats de plateforme : le message ne porte pas de donnée personnelle.
- `docs/configuration.md` : seules les deux lignes que cite la piste changent ; le reste de la
  section « S3 / Media library » n'est pas réécrit.

## Delta à produire

- [x] `ExportActivityLogJob`, `CrossTenantAuditController::export()`,
  `ActivityLogExportController::download()` et `PurgeExpiredActivityLogExports` sur
  `Storage::disk('local')`.
- [x] `GenerateReportExport::failed()` : statut `failed`, `failure_reason`.
- [x] `docs/configuration.md` l. 138 et 554 : `local`, et R2 pour les médias.
- [x] Test `tests/Feature/Audit/DisqueDesExportsTest.php`.

## Critères d'acceptation

- [x] AC1 — disque par défaut `public` : l'export d'audit asynchrone et celui de la console
  s'écrivent sur `local`, rien sur `public`, et leur lien sert le fichier.
- [x] AC2 — la purge des exports d'audit supprime un fichier échu de `local`.
- [x] AC3 — `failed()` passe l'export à `failed` avec le message de l'exception.

## Hors périmètre

- La purge des fichiers sans ligne après un `migrate:fresh` (reste, avec P77.02).

## Notes d'implémentation

- Ablation : les cinq fichiers de production rendus à leur état d'avant (`cdef5c26f`, ou TCK-1143
  pour la purge et le contrôleur) → 4 rouges ; remis → 4 verts.
