---
id: TCK-1414
title: "L'export du journal d'activité ne relit plus les profils de l'auteur à chaque ligne, et son job porte un délai mesuré"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-78--pic-mémoire-et-durée-des-exports-accumulés-en-tableau"
tags: [api, audit, export, perf, pistes]
---

## Contexte

Réf : **P78.01** du fichier de pistes, `validé`. Elle entre dans le lot de l'angle 148 par un
fichier cité en commun (`HasProfiles.php:238-275`, `profileTypes()`).

`ActivityLogExporter::buildPayload()` remplit `causer_role` par `profileTypes()->first()`, qui
interroge `serviceProviderProfile` et les baux du locataire quand ces relations ne sont pas
préchargées : deux requêtes par ligne. Au-delà de 5 000 lignes, l'export part dans
`ExportActivityLogJob`, qui n'a pas de `$timeout` et hérite des 60 s par défaut du worker.

## Décision du porteur

« validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V5 (classement du mesureur : le `$timeout` dépend de `retry_after`, réglage
d'environnement).

**Choix** : la Piste propose deux voies (précharger, ou calculer `causer_role` une fois par
auteur) ; elle recommande la première, retenue ici. Le `$timeout` vaut 85 s : au-dessus des 60 s
du worker, sous les 90 s de `retry_after` par défaut (`config/queue.php`), sans toucher à aucune
variable d'environnement.

## Objectif

Le nombre de requêtes de l'export ne dépend plus du nombre de lignes, et un export asynchrone
n'est plus tué à 60 s.

## Delta à produire

- [x] `buildPayload()` précharge `causer.serviceProviderProfile` et `causer.tenantLeases`
  (restreinte aux baux en cours, comme `AgencyController::listMembers`).
- [x] `ExportActivityLogJob::$timeout = 85`.
- [x] Tests : `ExportAuditRequetesParLigneTest` (requêtes constantes entre 10 et 100 lignes ;
  rôle inchangé), `ExportAuditDelaiDuJobTest` (délai > 60 s et < `retry_after`).

## Critères d'acceptation

- [x] AC1 — 10 et 100 lignes d'un même auteur font le même nombre de requêtes.
- [x] AC2 — `causer_role` reste `profileTypes()->first()`.
- [x] AC3 — Le job porte un délai supérieur à 60 s et inférieur au `retry_after` des files
  `database` et `redis`.

## Hors périmètre

- L'export de la console dans la requête HTTP (P78.02) et le XLSX construit en entier par
  PhpSpreadsheet (P78.03) : un XLSX de 20 000 lignes prend encore 64 s, et au-delà de
  ~25 000 lignes il dépasserait le délai.
- Une méthode `failed()` qui préviendrait le demandeur d'un échec : la Piste ne la demande pas.

## Notes d'implémentation

- Mesuré par un test temporaire (retiré), 20 000 lignes d'un même auteur, charge
  `{ 2.75 2.67 3.04 }` sur 8 cœurs : avant, `buildPayload` 181,1 s, job CSV 133,5 s, XLSX
  244,8 s ; après, 12,4 s, 12,0 s, 64,1 s.
- Piège du test : le journal d'une agence se filtre par `activity_log.agency_id`
  (`AuditScope`), et les factories écrivent leurs propres lignes « system » : le test filtre par
  `causer_id`.
- Ablation : `ActivityLogExporter.php` rendu à `HEAD` → 29 requêtes pour 10 lignes, 209 pour
  100, rouge ; `ExportActivityLogJob.php` rendu à `HEAD` → rouge (pas de `$timeout`). Remis → verts.
