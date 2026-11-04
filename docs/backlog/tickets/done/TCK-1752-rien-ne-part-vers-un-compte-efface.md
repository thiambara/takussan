---
id: TCK-1752
title: "Rien ne part vers un compte effacé : un avis en file relu au worker sur un compte supprimé n'est pas livré"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-166--modèles-portés-en-file-par-serializesmodels-supprimés-entre-lenvoi-et-le-worker"
tags: [api, notifications, file, rgpd, compte, pistes]
---

## Contexte

Réf : **P166.02** du fichier de pistes, `validé`.

Le destinataire d'une notification en file est sérialisé par son identifiant et relu au worker
sans portée. Un compte supprimé en douceur et anonymisé entre la mise en file et le worker est
relu avec l'adresse `deleted-<id>@takussan.local`, et le courriel part (mesuré par le mesureur).
`BuildUserDigestJob` lit de même `$this->user->email` au worker.

## Décision du porteur

« validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket »

Critère accordé : V3. La Piste n'a qu'une voie, et l'entrée ne porte pas de recommandation du
délégué.

## Objectif

Aucun canal ne livre à un `User` `trashed()`, et le résumé par courriel ne lui part pas.

## Delta à produire

- [x] `App\Listeners\Notifications\RienPourUnCompteEfface` : écouteur `NotificationSending` (découvert
  par Laravel) qui rend `false` pour un `User` `trashed()`.
- [x] `BuildUserDigestJob::handle()` sort sur `trashed()`.
- [x] Test : `RienPourUnCompteEffaceTest`.

## Critères d'acceptation

- [x] AC1 — Avis en file, compte anonymisé avant le worker → aucun canal ne livre, file vide,
  aucune ligne `failed_jobs`.
- [x] AC2 — Un compte actif reçoit toujours l'avis.
- [x] AC3 — Le résumé d'un compte supprimé ne part pas.

## Hypothèses (mode sans humain)

- « Aucune ligne in-app » : la ligne `app_notifications` d'un avis par code est écrite en
  synchrone par `NotificationService::send()` avant la mise en file, donc avant l'effacement ;
  l'écouteur arrête aussi le canal `database` s'il est joué au worker. Le test le vérifie sur le
  canal `mail`, celui du constat.
- `AccountDeletionExecutedNotification`, seul avis voulu vers le compte effacé, part en synchrone
  avant l'anonymisation : le compte n'est pas encore `trashed()`, il n'est pas touché
  (`AccountDeletionExecuteTest` vert).

## Hors périmètre

- Le refus du transport `resend` sur l'adresse effacée, non rejoué (le constat le laisse à
  vérifier).

## Notes d'implémentation

- Avant correctif : 2 rouges sur 3 (le courriel part vers l'adresse effacée ; le résumé part).
- Ablation : écouteur retiré et job remis à `HEAD` → les 2 mêmes rouges ; remis → 3/3.
