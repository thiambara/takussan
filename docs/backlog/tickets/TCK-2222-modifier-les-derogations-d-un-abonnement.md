---
id: TCK-2222
title: "Modifier les dérogations d'un abonnement sans le clore, et les montrer dans le résumé"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#44-agencysubscription-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-214--formulaires-dédition-qui-renvoient-en-entier-une-colonne-json-quils-ne-montrent-quen-partie"
tags: [api, front, super-admin, abonnements, pistes]
---

## Contexte

Réf : **P214.01** du fichier de pistes, `validé` (V1 accordé).

L'onglet « Abonnement » de la fiche d'agence (console super-admin) n'avait qu'un geste d'écriture,
« Assigner », sous « Changer de plan ». Ses champs partaient vides, et l'API
(`AgencySubscriptionService::assign`) clôt l'abonnement ouvert et en crée un neuf avec les seules
dérogations reçues, sans essai, période remise à maintenant. Changer le seul quota de biens
effaçait donc la commission négociée, les quotas d'agents et de succursales dérogés et l'essai en
cours (mesuré par l'explorateur et le mesureur, et re-mesuré par le test de ce ticket).

## Décision du porteur

un geste séparé « Modifier les dérogations » : une route super-admin qui modifie sur place l'abonnement ouvert (commission, trois quotas), sans le clore, période et essai gardés ; « Changer de plan » garde la clôture ; le résumé montre les dérogations actives ; la route est gardée et couverte par `NamespaceAccessGuardTest`

## Objectif utilisateur

L'opérateur plateforme corrige une dérogation d'abonnement d'une agence sans perdre les autres,
ni l'essai, ni la période en cours, et voit dans le résumé quelles valeurs sont dérogées.

## Contrat de données

- `PATCH /api/admin/agencies/{agency}/subscription/overrides` (groupe `auth:sanctum` +
  `super-admin`, comme `POST …/subscription`), nom `admin.agencies.subscription.overrides`.
  Corps : `platform_fee_pct` (`numeric` 0-100, `null` retire la dérogation) et `limits`
  (`max_active_listings`, `max_agents`, `max_branches`, entiers ≥ 0, `null` retire). Une clé absente
  garde la valeur en base ; `limits` se fusionne clé par clé (« merge », spec 44), une liste vide
  rend `limits_override` à `null`. Rend `AgencySubscriptionResource` (200), 404 sans abonnement ouvert.
- Journal : `super_admin_subscription_overrides_updated`, avec l'avant et l'après.

## Contraintes strictes (métier)

- Ni le plan, ni le statut, ni `trial_ends_at`, ni la période ne changent ; aucune ligne neuve.
- « Changer de plan » (`POST …/subscription`) garde la clôture, inchangé.

## Delta à produire

- [x] `AgencySubscriptionService::updateOverrides` (verrou de la ligne ouverte, en transaction).
- [x] `UpdateAgencySubscriptionOverridesRequest`, `AgencySubscriptionController::updateOverrides`, route.
- [x] Front : `updateAdminAgencySubscriptionOverrides`, carte « Modifier les dérogations » dans
  `AdminAgencySubscriptionPanel` (champs pré-remplis, quatre valeurs toujours envoyées, vide → `null`),
  et `SubscriptionSummary showOverrides` qui liste les dérogations actives.
- [x] Clés i18n `billing.agencySubscription.overrides.*`, `toast.overrides*`,
  `billing.subscription.overrides.*`, `billing.subscription.branches` (fr, en ; wo = texte français,
  wolof en pause).
- [x] Tests : `AgencySubscriptionOverridesTest` (5), `AdminAgencySubscriptionPanel.derogations.tck-2222.test.tsx` (6).

## Critères d'acceptation

- [x] AC1 — Abonnement en essai, commission 1 % et 20 agents dérogés ; `PATCH` du seul quota de
  biens à 150 → même ligne, `trialing`, essai et période gardés, commission 1, 20 agents, 150 biens,
  journal écrit.
- [x] AC2 — `platform_fee_pct: null` et `max_agents: null` → la valeur du plan revient ; la
  dernière clé retirée rend `limits_override` à `null`.
- [x] AC3 — Sans abonnement ouvert → 404, rien d'écrit ; commission 101, quota négatif ou clé
  inconnue de `limits` → 422, rien d'écrit ; admin d'agence → 403.
- [x] AC4 — Le formulaire part des dérogations en cours, envoie les quatre valeurs, n'appelle pas
  l'assignation ; un champ vidé envoie `null` ; sans abonnement, le geste n'est pas offert.
- [x] AC5 — Le résumé de la console liste les dérogations actives, ou dit qu'aucune ne s'applique ;
  l'écran de facturation de l'agence n'en montre rien (prop non passée).

## Hors périmètre

- La perte de l'essai et des dérogations lors d'un vrai changement de plan (`assign`) : le porteur
  garde la clôture. L'angle 231 (« Gestes qui modifient en clôturant une ligne ») couvre la famille.
- Montrer les dérogations à l'agence elle-même (`AgencyBillingClient`) : la décision vise le résumé
  de la console, et le montrer à l'agence serait un comportement visible neuf non tranché.
- Le texte wolof des clés neuves (pause du 2026-10-16) : le français est recopié.

## Notes d'implémentation

- Ablation : service, contrôleur, route, panneau et résumé rendus à `pre-dev` → API 4 rouges sur 5
  (route absente, 404 ; seul le cas « sans abonnement → 404 » reste vert, trivialement), front 4
  rouges sur 6 (restent verts les deux cas « rien n'est montré ») ; remis → 5/5 et 6/6.
- `limits` est validé en `array:max_active_listings,max_agents,max_branches` : sans la liste,
  `validated()` rend le tableau entier et une clé libre s'écrirait dans `limits_override`.
- La carte est remontée par une `key` tirée de `id` et `updated_at` : après l'enregistrement,
  l'invalidation recharge l'abonnement et les champs repartent de la ligne.
