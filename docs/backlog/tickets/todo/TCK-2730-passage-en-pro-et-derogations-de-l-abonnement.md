---
id: TCK-2730
title: "Le passage en pro ne fait pas disparaître en silence les dérogations négociées de l'abonnement en cours"
status: todo
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2681]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#44-agencysubscription-"
tags: [back, abonnement, passage-en-pro, super-admin, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

Le super-admin qui approuve le passage en pro d'une agence à qui une commission ou des quotas particuliers avaient été
accordés le sait avant de valider, au lieu de découvrir après coup que l'agence a perdu ces conditions.

## Contexte

Suivi de TCK-2681 (ADR-0104 § 6, décidé par le porteur le 2026-11-10 : l'approbation pose l'abonnement au plan annoncé).
`AgencyUpgradeReviewService::subscribeToUpgradePlan()` appelle `AgencySubscriptionService::assign($agency, $plan,
$reviewer)` **sans `overrides`** ; `assign()` clôt tout abonnement ouvert, **y compris un abonnement posé à la main avec
dérogations** (`platform_fee_pct_override`, `limits_override`, TCK-2222), et le nouveau n'en porte aucune. Seuls les
identifiants clos sont journalisés (`replaced_subscription_ids`). Le docblock de TCK-2681 dit « sans essai ni
dérogation ».

Relevé qui pèse sur le choix : `QuotaResolver::effectiveLimits()` fait `array_replace($planLimits, $overrides)` — une
dérogation de quota est une **valeur absolue**. Reporter telle quelle une dérogation accordée sur l'ancien plan peut
**abaisser** un quota du plan pro (illustration, chiffres non relevés : une dérogation « 50 annonces » sur un plan
individuel à 20 deviendrait 50 sous un plan pro à 200).

## Décision

**Décidé par le porteur le 2026-11-11 : (b), la recommandation (« je valide tes recommandations sur les dix points »).**

- **b) (retenu à titre provisoire)** l'approbation est **refusée** tant que l'abonnement ouvert porte une dérogation :
  `409 agency_upgrade.subscription_has_overrides`, avec la liste des dérogations ; le super-admin les retire (ou décide de
  les reposer après coup, TCK-2222), puis approuve. Ne contredit rien d'écrit : « sans dérogation » reste vrai.
- a) les dérogations sont **reportées** sur le nouvel abonnement. Amende le « sans essai ni dérogation » de TCK-2681 et
  demande une règle pour les quotas absolus (reporter seulement ce qui est plus favorable que le plan pro ?).

## Contrat de données

- `POST /api/admin/agency-upgrade-requests/{upgradeRequest}/approve` : `409 agency_upgrade.subscription_has_overrides`
  quand un abonnement ouvert de l'agence a `platform_fee_pct_override` non nul ou `limits_override` non vide ; corps
  `{message, overrides: {platform_fee_pct?, limits?}}`. La demande reste `pending`, l'agence `individual`, rien n'est clos.
- Sans dérogation : inchangé.

## Contraintes strictes (métier)

- Le contrôle court **dans la transaction de l'approbation**, sur l'abonnement relu sous verrou, **avant** la bascule de
  type (`kindFlipService->flip`) : rien n'est écrit à moitié.
- L'ordre des refus existants est gardé (`not_pending`, KYC, suspension avant celui-ci).

## Delta à produire

- [ ] `AgencyUpgradeReviewService::approve()` : contrôle des dérogations avant la bascule.
- [ ] Code `agency_upgrade.subscription_has_overrides` dans `lang/{fr,en,wo}` (wo = français).
- [ ] Console super-admin : le message de l'API affiché, avec les dérogations (aucun écran neuf).
- [ ] Tests : `AgencyUpgradeApprovalOverridesTest`.

## Critères d'acceptation

- [ ] AC1 — Agence `individual` dont l'abonnement ouvert porte `platform_fee_pct_override = 3` : l'approbation rend 409
      `agency_upgrade.subscription_has_overrides` avec `overrides.platform_fee_pct = 3` ; la demande reste `pending`,
      `agencies.kind` reste `individual`, l'abonnement reste ouvert avec sa dérogation.
- [ ] AC2 — Même agence après retrait de la dérogation (`updateOverrides` à `null`) : l'approbation passe, l'abonnement pro
      est posé (comportement de TCK-2681).
- [ ] AC3 — Abonnement ouvert sans dérogation : approbation inchangée (non-régression).

## Hors périmètre

- Le report automatique des dérogations (option a).
- L'ordre « plan résolu après la bascule de type » relevé à la vérification de TCK-2681 : correct aujourd'hui (le 422
  défait la transaction), non traité.

## Notes d'implémentation

- Le contrôle (`AgencyUpgradeReviewService::assertNoNegotiatedOverrides`) court dans la transaction, juste après la relecture sous verrou de la demande (`lockPending`) et avant toute écriture : la mise à jour de la demande, la bascule de type et l'abonnement. Les abonnements ouverts sont relus sous verrou. Les refus existants (`not_pending`, KYC, suspension) passent avant, et c'est épinglé.
- Corps : `{code, message, overrides: {platform_fee_pct?, limits?}}`, par `ApiError::with()`. Une clé n'est présente que si la dérogation existe.
- Front : aucune clé neuve. La modale d'approbation affiche la prose de l'API, et la liste des dérogations se nomme avec les libellés du panneau où le super-admin les retire (`billing.agencySubscription.overrides`).
