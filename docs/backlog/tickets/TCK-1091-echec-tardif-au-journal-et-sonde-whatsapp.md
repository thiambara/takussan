---
id: TCK-1091
title: "Un accusé `failed` reçu après coup s'écrit au journal, et la santé sonde le taux d'échec WhatsApp sur `updated_at`"
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
    - "docs/features.md#canal-whatsapp-sortant-livré--tck-282--activé-par-défaut-par-tck-588"
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-échec-de-livraison-nest-lisible-nulle-part-et-ceux-de-whatsapp-pas-même-par-la-sonde-de-santé"
tags: [back, notifications, sms, whatsapp, sante, pistes]
---

## Objectif utilisateur

L'équipe de la plateforme voit qu'un SMS ou un message WhatsApp, accepté par le fournisseur, n'est
finalement pas arrivé : une ligne de journal par échec, et une sonde de santé WhatsApp qui compte
les accusés `failed` dans l'heure où ils arrivent.

## Contexte

Réf : **P72.05** du fichier de pistes, `validé` (critère V7 accordé).

Mesuré avant correctif (tests de garde ci-dessous, rouges sur `fc25d5ff5`) : un accusé `failed`
appliqué par `DeliveryAttemptUpdater::applyStatus()` (SMS poussé ou tiré) ou par
`UpdateWhatsappDeliveryStatusJob` n'écrivait rien au journal ; l'instantané de
`HealthcheckService` n'avait pas de clé `whatsapp` (la sonde `sms` écarte `whatsapp%` et compte
sur `created_at`).

## Décision du porteur

> d'abord un `Log::warning` sur tout `failed` tardif (fournisseur, motif, identifiant de tentative, sans numéro) et une sonde WhatsApp comptée sur `updated_at`, au même seuil que celle du SMS ; ce que l'expéditeur voit de l'échec reste une décision à part (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- « Tardif » : tout passage d'une tentative à `failed` par `DeliveryAttemptUpdater`. Ce service
  n'est appelé que par les accusés (webhooks SMS et WhatsApp, tirage Mtarget), donc toujours après
  l'acceptation de l'envoi. Un accusé rejoué sur une tentative déjà `failed` ne réécrit pas.
- La sonde WhatsApp ne compte comme échec que `failed`. `deferred_to_fallback` y dit que WhatsApp
  n'était pas permis (hors fenêtre sans gabarit, contact retiré) et que le message est parti par
  SMS : ce n'est pas un échec de livraison. La sonde SMS, elle, reste inchangée.
- Même seuil que le SMS : 20 % sur un échantillon d'au moins 5 tentatives
  (`SMS_DEGRADED_FAILURE_RATE`, `SMS_MIN_SAMPLE`), même forme (`driver`, `attempts_1h`,
  `failure_rate_1h`).
- La sonde n'est pas affichée par la page Santé du front, comme `scheduler` et `proxies` : elle
  entre dans le statut global et les alertes d'exploitation (`EvaluateOperationalAlerts`).

## Delta à produire

- [x] `DeliveryAttemptUpdater::applyStatus()` : sur le passage à `failed`, après la transaction,
  `Log::warning('[delivery] accusé failed reçu après coup', {provider, failure_reason, attempt_id})`.
- [x] `HealthcheckService` : sonde `whatsapp`, comptée sur `updated_at` de la dernière heure.
- [x] Tests : `LateDeliveryFailureLogTest` (3), `HealthcheckProbesTest` (+2).

## Critères d'acceptation

- [x] AC1 — un `failed` SMS rejoué deux fois → une seule ligne de journal, sans le numéro.
- [x] AC2 — un `failed` WhatsApp par le job → une ligne, avec le motif Meta.
- [x] AC3 — un `delivered` → aucune ligne.
- [x] AC4 — 3 `failed` sur 10 tentatives WhatsApp créées il y a deux heures et mises à jour dans
  l'heure → sonde `whatsapp` `degraded`, taux 0,3.
- [x] AC5 — les échecs SMS, les `deferred_to_fallback` et les accusés vieux de deux heures ne
  comptent pas.

## Reste à faire

ce que l'expéditeur voit de l'échec reste une décision à part

## Hors périmètre

- Ce que l'expéditeur voit de l'échec (décision à part du porteur).
- L'affichage de la sonde dans la page Santé du front.

## Notes d'implémentation

- Ablation : `DeliveryAttemptUpdater` et `HealthcheckService` remis à `fc25d5ff5` → 4 rouges sur 20
  (les deux lignes de journal, les deux sondes) ; correctif remis → 20 verts.
- Le journal s'écrit hors de la transaction : une ligne n'est écrite que pour un passage validé.
