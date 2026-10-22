---
id: TCK-1267
title: "Exports RGPD et de rapport : un courriel « prête » qui échoue ne fait plus lever le job, et `failed()` ne touche plus un rapport `ready`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1265]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-111--jobs-à-statut-de-suivi-sans-failed"
tags: [api, rgpd, reporting, export, jobs, pistes]
---

## Contexte

Réf : **P111.03** du fichier de pistes, `retenu · autonome` (A1).

Les deux notifications « prête » (`DataExportReadyNotification`, `ReportExportReadyNotification`)
partent dans le job, après l'écriture du statut `ready`. Quand le transport lève, le job lève : le
worker le rejoue jusqu'à `--tries=3`. L'export RGPD repasse à `processing` et reconstruit son
archive à chaque essai ; le rapport passe par `GenerateReportExport::failed()`, qui le met `failed`
sans condition, alors que son fichier est écrit. Le téléchargement refuse tout statut autre que
`ready` : le fichier reste sur le disque, inaccessible.

## Objectif

Un export prêt reste prêt, quel que soit le sort du courriel qui l'annonce.

## Choix de l'implémenteur

La `Piste` offre de mettre la notification en file (`ShouldQueue`, avec `backoff`), ou d'attraper
l'échec du courriel après `ready`. Retenu : attraper, et signaler par `report()`. C'est la voie la
plus étroite : ni notification en file, ni réglage de reprise neuf. Le statut `ready` est lu par
l'écran « Mes données » et par la console, qui servent le fichier sans le courriel.

## Delta à produire

- [x] `ProcessDataExport::handle()` et `GenerateReportExport::handle()` : la notification « prête »
      dans un `try`, l'échec signalé par `report()`.
- [x] `GenerateReportExport::failed()` ne touche qu'un export encore `queued` ou `processing`
      (celui de l'export RGPD le fait déjà, TCK-1265).

## Critères d'acceptation

- [x] AC1 — Canal `mail` qui lève : `ProcessDataExport::handle()` ne lève pas, l'export est `ready`.
- [x] AC2 — Canal `mail` qui lève : `GenerateReportExport::handle()` ne lève pas, le rapport est
      `ready` et son fichier existe.
- [x] AC3 — `GenerateReportExport::failed()` sur un rapport `ready` le laisse `ready`, sans motif.

## Hypothèses

- Un courriel perdu n'est pas renvoyé : il est signalé au gestionnaire d'exceptions. Le renvoi
  (notification en file avec `backoff`) reste possible plus tard, sans revenir sur ce ticket.

## Notes d'implémentation

- Ablations, chacune seule : sans le `try` de l'export RGPD → AC1 rougit (`smtp down`) ; sans celui
  du rapport → AC2 rougit ; sans la condition de `failed()` → AC3 rougit ; remis → vert.
- Le canal qui lève est un double de `MailChannel` dans le conteneur : le `ChannelManager` le
  résout par `make()`.
