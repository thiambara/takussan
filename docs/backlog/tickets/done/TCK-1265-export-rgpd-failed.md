---
id: TCK-1265
title: "Export RGPD : un job en échec passe l'export encore en préparation à `failed`"
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
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-111--jobs-à-statut-de-suivi-sans-failed"
tags: [api, rgpd, export, jobs, pistes]
---

## Contexte

Réf : **P111.01** du fichier de pistes, `retenu · autonome` (A1).

`ProcessDataExport` n'a pas de `failed()`. Le passage à `failed` n'existe que dans le `catch` de
`DataExportBuilder::build()`. Un processus tué pendant la construction (mémoire, délai du worker,
arrêt de l'hôte) n'exécute pas ce `catch` : le worker n'appelle que le `failed()` du job. L'export
restait `processing` (ou `queued`) pour toujours, et l'écran « Mes données » relançait la liste
toutes les 10 s. `docs/features.md` § 2.1 promet un « statut suivi jusqu'à la fin de la
préparation ».

## Objectif

Un export dont le job échoue sort de la préparation.

## Delta à produire

- [x] `ProcessDataExport::failed()` passe à `failed` l'export encore `queued` ou `processing`, sur
      le modèle de `GenerateReportExport::failed()` (TCK-1145).

## Critères d'acceptation

- [x] AC1 — `failed()` sur un export `queued` ou `processing` le rend `failed`.
- [x] AC2 — `failed()` sur un export `ready` le laisse `ready`.

## Hypothèses

- La table `data_exports` n'a pas de colonne de motif : rien n'est écrit d'autre que le statut.
- La mort réelle du worker n'est pas rejouée : le test appelle `failed()` comme le worker le fait.

## Notes d'implémentation

- Ablation : sans l'écriture, AC1 rougit ; sans la condition sur le statut, AC2 rougit ; remis → vert.
