---
id: TCK-1084
title: "Une écriture d'export refusée par le disque lève, au lieu d'annoncer un fichier qui n'existe pas"
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
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#62-reportexport-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-écriture-refusée-par-le-disque-local-passe-pour-un-succès--lexport-est-annoncé-prêt-et-son-lien-rend-404"
tags: [back, exports, audit, reporting, pistes]
---

## Objectif utilisateur

Quand le disque refuse l'écriture d'un export (disque plein, droit refusé), le super-admin ou
l'admin ne reçoit pas un lien qui rend 404 : le job échoue (et se voit dans `failed_jobs`), la
console rend une erreur.

## Contexte

Réf : **P77.03** du fichier de pistes, `validé (délégué)` (critère V7 accordé : voie (a)).

Le disque `local` est déclaré `'throw' => false` : `put()` rend `false` au lieu de lever.
`GenerateReportExport`, `ExportActivityLogJob` et `CrossTenantAuditController::export()`
ignoraient ce retour. Mesuré avant correctif (test de garde ci-dessous, `pre-dev` 3eff8de82),
dossier d'écriture en lecture seule (sonde : `put()` → `false`) :
- `GenerateReportExport::handle()` ne lève pas, l'export passe à `ready` ;
- `ExportActivityLogJob::handle()` envoie une `ActivityLogExportReadyNotification` ;
- `GET /api/admin/audit/export` → 200, avec un lien.

## Décision du porteur (déléguée)

> (a) : lever dans les trois écrivains (`GenerateReportExport`, `ExportActivityLogJob`, `CrossTenantAuditController::export()`) quand `put()` ne rend pas `true`, comme `ErasureLedger::record()` ; le disque `local` garde `'throw' => false` ; test : `put()` refusé → le job échoue, l'export n'est pas `ready` et aucune notification ne part ; reste : le `failed()` du job (statut `failed`, `failure_reason`), qui suit P77.04

## Reste à faire

> le `failed()` du job (statut `failed`, `failure_reason`), qui suit P77.04

## Hypothèses (mode sans humain)

- L'exception est une `RuntimeException` qui nomme le chemin, comme `ErasureLedger` ; le chemin
  ne porte qu'un identifiant d'utilisateur et un nom opaque (TCK-1054), aucune donnée saisie.
- La console rend le 500 de l'enveloppe globale (`bootstrap/app.php`) : aucun code d'erreur neuf
  n'est émis, la décision ne le demande pas. L'export n'est alors pas journalisé
  (`audit_exported`), puisque rien n'a été exporté.

## Delta à produire

- [x] `GenerateReportExport::handle()` lève quand `put()` ne rend pas `true`, avant `ready` et la
  notification.
- [x] `ExportActivityLogJob::handle()` de même, avant le lien signé et la notification.
- [x] `CrossTenantAuditController::export()` de même, avant le lien et le journal.
- [x] Test `tests/Feature/Audit/EcritureRefuseeDesExportsTest.php`, un cas par écrivain.

## Critères d'acceptation

- [x] AC1 — export de rapport, écriture refusée : le job lève, l'export n'est pas `ready`
  (`ready_at` nul), aucune notification.
- [x] AC2 — export d'audit, écriture refusée : le job lève, aucune notification de lien.
- [x] AC3 — export de l'audit de la console, écriture refusée : 5xx, aucun `data.url`.

## Hors périmètre

- Le `failed()` du job de rapport (statut `failed`, `failure_reason`) : reste du porteur, avec
  P77.04. D'ici là, un export de rapport en échec reste `processing`.
- Le passage du disque `local` à `'throw' => true` (voie non retenue).

## Notes d'implémentation

- Ablation : les trois fichiers de production remis à leur état d'origine → 3 rouges ; remis →
  3 verts.
- Le refus se provoque par un dossier en lecture seule (`chmod 0555`, rendu en `tearDown`). Un
  fichier posé à la place d'un dossier ne convient pas : `UnableToCreateDirectory` traverse
  `FilesystemAdapter::put()` et lève même sous `'throw' => false`, ce qui faisait passer les deux
  tests d'audit sans correctif. Le test sonde donc que `put()` rend bien `false` avant d'agir.
- `$this->fail()` de PHPUnit lève une `AssertionFailedError`, qui est une `RuntimeException` : ne
  pas l'appeler dans un `try` qui attrape `RuntimeException`.
