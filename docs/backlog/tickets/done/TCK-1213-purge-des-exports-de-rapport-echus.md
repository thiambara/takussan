---
id: TCK-1213
title: "Les exports de rapport de la console échus perdent leur fichier et passent à `expired`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#62-reportexport-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-77--fichiers-du-disque-local-dans-le-volume-storage"
tags: [back, exports, reporting, jobs, pistes]
---

## Objectif utilisateur

Un export de rapport de la console ne reste pas sur le volume privé au-delà de son échéance
(J+7) : son fichier disparaît, et la ligne dit qu'il a expiré.

## Contexte

Réf : **P77.02** du fichier de pistes, `validé`.

Mesuré avant correctif (`pre-dev` fbb8fc003) : `grep -rln "ReportExport" app routes` → modèle,
requête, `ReportingController`, `ReportExportDownloadController`, `GenerateReportExport`,
notification, `PlatformReportingService` ; aucun effaceur, et `routes/console.php` ne planifie que
`PurgeExpiredDataExports` (exports RGPD) et `PurgeExpiredActivityLogExports` (audit). Le test de
garde ci-dessous rougit en entier : la classe de purge n'existe pas.

## Décision du porteur

> (a) : `expired` ajouté aux statuts de `report_exports` dans `docs/models-spec.md` § 62 ; la purge planifiée, sur le modèle de `PurgeExpiredDataExports`, retire le fichier des `report_exports` `ready` échus (`archive_path` à `null`) et les passe `expired`, la ligne gardée ; les `exports/audit/*` restent à P63.04 (porteur, 2026-10-22)

## Reste à faire

- **L'ajout d'`expired` aux statuts de `report_exports` dans `docs/models-spec.md` § 62.** Le
  fichier est fermé à l'implémenteur (`check-pistes.mjs`, `PROTEGES_IMPLEMENTEUR`) : la ligne se
  pose au `/sync-specs` qui suit la fusion. La colonne est un `string` sans contrainte (migration
  `2026_05_07_000227`, l. 17) : aucune migration n'est nécessaire.

## Hypothèses (mode sans humain)

- Un job neuf, `App\Jobs\Reporting\PurgeExpiredReportExports`, plutôt qu'une extension de
  `PurgeExpiredDataExports` : chacun reste dans son domaine (`Privacy`, `Reporting`).
- Planifié chaque jour à 02:40, dix minutes après la purge RGPD, `withoutOverlapping()`.
- Les lignes du chemin synchrone (`ready`, sans fichier, `expires_at` à J+7) passent aussi à
  `expired` à l'échéance : la décision vise tout `ready` échu.

## Delta à produire

- [x] `app/Jobs/Reporting/PurgeExpiredReportExports.php`.
- [x] Entrée planifiée dans `routes/console.php`.
- [x] Test `tests/Feature/Reporting/ExportsDeRapportEchusTest.php`.

## Critères d'acceptation

- [x] AC1 — un export `ready` échu : fichier absent, `archive_path` nul, statut `expired`.
- [x] AC2 — un export synchrone `ready` échu, sans fichier : statut `expired`.
- [x] AC3 — un export non échu, `processing` ou `failed` reste tel quel, fichier compris.
- [x] AC4 — la purge est planifiée.

## Hors périmètre

- Les `exports/audit/*` (P63.04, TCK-1143).
- La purge des fichiers sans ligne après un `migrate:fresh` (reste de P77.04).

## Notes d'implémentation

- Ablation : corps de `handle()` vidé et entrée planifiée retirée → 3 rouges (le cas AC3, témoin
  négatif, reste vert par construction) ; remis → 4 verts.
