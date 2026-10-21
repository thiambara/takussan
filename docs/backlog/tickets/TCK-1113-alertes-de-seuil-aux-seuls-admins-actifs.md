---
id: TCK-1113
title: "Alertes de seuil envoyées aux seuls admins d'agence au profil actif"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#65-thresholdalert-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-93--indicateurs-des-tableaux-de-bord-et-du-relevé--valeurs-fausses-sur-des-données-réelles"
tags: [back, dashboard, notifications, pistes]
---

## Contexte

Réf : **P93.04** du fichier de pistes, `retenu · autonome` (A1 : `HasProfiles::isAgencyAdminAt` et
`MessagingReach` tiennent déjà qu'un admin d'agence est un profil `active`).

`dashboard:check-alerts` choisissait ses destinataires parmi les utilisateurs ayant un profil
`AgencyAdminProfile` dans l'agence, quel qu'en soit le statut : un admin suspendu ou archivé
recevait encore `ThresholdAlertTriggered`.

## Objectif utilisateur

Seuls les admins dont le rôle dans l'agence est en cours reçoivent les alertes de seuil de cette
agence.

## Delta à produire

- [x] `CheckThresholdAlertsCommand` : `->active()` dans le `whereHas('agencyAdminProfiles', …)` des
      destinataires.
- [x] Test dans `tests/Feature/Dashboard/ThresholdAlertTest.php`.

## Critères d'acceptation

- [x] AC1 — Trois admins de l'agence, un `active`, un `suspended`, un `archived`, et une alerte qui
      se déclenche : la notification va au seul admin actif.

## Hors périmètre

- Les comptes `blocked` (angle 88).
- La valeur des indicateurs eux-mêmes (P93.03, P93.05).

## Notes d'implémentation

- Ablation : test écrit avant le correctif, rouge sur `assertNotSentTo($suspended)` ; `->active()`
  ajouté → 11/11 sur la classe.
