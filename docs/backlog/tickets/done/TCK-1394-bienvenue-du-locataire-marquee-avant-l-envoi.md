---
id: TCK-1394
title: "Bienvenue du locataire : la marque posée avant l'envoi, un écouteur rejoué n'en envoie pas une seconde"
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
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-142--notifications-et-écouteurs-en-file-sans-backoff-ni-failed-hors-codednotification"
tags: [api, notifications, file, pistes]
---

## Contexte

Réf : **P142.06** du fichier de pistes, `validé`.

`SendTenantWelcomeNotification` (en file) envoyait la bienvenue, journalisait, puis posait
`tenant_welcomed_at`. S'il levait entre l'envoi et la marque, le worker le rejouait et une
seconde bienvenue partait.

## Décision du porteur

« validé — porteur (2026-10-22) : la cloche (`database`) ajoutée au `via()` d'`ActivityLogExportReadyNotification` ; `tenant_welcomed_at` posé dans l'écouteur avant l'envoi »

Critère accordé : V7.

## Objectif

Un écouteur de bienvenue rejoué n'envoie pas une seconde bienvenue.

## Delta à produire

- [x] `SendTenantWelcomeNotification` : `tenant_welcomed_at` posé avant `Notification::send()`.
- [x] Test dans `TenantWelcomeNotificationTest` : le journal lève après l'envoi, l'écouteur est
      rejoué → une seule bienvenue.

## Critères d'acceptation

- [x] AC1 — Un écouteur qui lève après l'envoi, puis rejoué, n'envoie qu'une bienvenue.

## Reste à faire

- **La cloche d'`ActivityLogExportReadyNotification`, non faite.** Elle ne donne un second
  chemin vers le fichier qu'en portant le lien signé, donc en le rangeant dans
  `app_notifications` : c'est ce que le porteur a fait retirer en P63.04 (TCK-1143, critère V3,
  `toArray()` sans `download_url`). Sans le lien, la ligne de cloche n'ouvre aucun chemin vers le
  fichier, et il faut encore lui choisir un code, un texte (ADR-0032) et une cible. Le choix
  revient au porteur.

## Hors périmètre

- Le test d'échec de transport sous la file `database` par famille d'envoi (troisième point de
  la `Piste`) : non retenu par la décision.

## Notes d'implémentation

- Le journal d'activité passe par `App\Models\Activity` (`config/activitylog.php`) : un
  `creating` posé sur le modèle de Spatie ne se déclenche pas.
- Ablation : l'écouteur remis à `034d400b2` → 1 rouge (« sent 2 times ») ; correctif remis →
  6 verts.
