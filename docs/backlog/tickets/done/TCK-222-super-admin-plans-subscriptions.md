---
id: TCK-222
title: "Super-admin — Plans & abonnements plateforme (catalogue + assignation par agence)"
status: done
phase: P2
family: applicatif
estimate: L
wave: 24
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-208]
blocks: [TCK-223]
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#15-transactions--paiements
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#43-plan-
    - docs/models-spec.md#44-agencysubscription-
    - docs/models-spec.md#2-agency
tags: [back, front, super_admin, billing, p2]
---

## Contexte

La spec étend §1.12 avec "Plans d'abonnement et quotas par agence". Aujourd'hui aucune notion économique ne lie une agence à la plateforme — le SaaS n'a ni plan, ni période d'essai, ni quota. Sans ce socle, il est impossible de monétiser, de limiter techniquement les comptes free trial, ni de calculer la commission plateforme (TCK-223 dépend de ce ticket).

## Objectif utilisateur

Un super-admin maintient un catalogue de plans plateforme (`/super-admin/plans`), assigne ou modifie l'abonnement d'une agence depuis sa fiche, applique des overrides négociés (commission, quotas) et lit les souscriptions à expirer. Une agence voit son plan courant et ses limites depuis `/admin/agency/billing`.

## Contrat de données

Endpoints super-admin :

- `GET /api/admin/plans` — catalogue
- `POST /api/admin/plans` — créer
- `PATCH /api/admin/plans/{id}` — éditer (label, prix, frais %, quotas, ordre)
- `DELETE /api/admin/plans/{id}` — refus 409 si une `AgencySubscription` y réfère encore
- `GET /api/admin/agencies/{id}/subscription` — souscription active
- `POST /api/admin/agencies/{id}/subscription` — assigner / changer de plan (`{ plan_id, trial_ends_at?, overrides?: { platform_fee_pct?, limits? } }`) — clôt l'ancienne (`ended_at = now()`) et en ouvre une nouvelle
- `POST /api/admin/agencies/{id}/subscription/cancel` — clôt la souscription active (status → `ended`)

Endpoints agence :

- `GET /api/me/subscription` — lecture seule de la souscription active de l'agence du profil actif

## Direction UX / Artistique

Page catalogue super-admin avec tableau des plans (CRUD inline simple). Sur la fiche agence (TCK-208), nouvel onglet "Abonnement" : plan courant, période, overrides actifs, historique des cycles, action "Changer de plan". Côté agence : page lisible `/admin/agency/billing` avec plan, période, quotas restants ; pas d'édition.

## Contraintes strictes (métier)

- Endpoints `POST/PATCH/DELETE` plans + `POST` subscription → super-admin-only.
- À tout instant, **au plus une** souscription `active`/`trialing` par agence (contrainte applicative + index partiel).
- Les overrides (`platform_fee_pct_override`, `limits_override`) écrasent les valeurs du plan ; absents → fallback plan.
- Le passage en `trialing` requiert `trial_ends_at > now()`. Au-delà, la souscription bascule automatiquement en `active` ou `past_due` selon paiement (job scheduled).
- Les quotas (`max_active_listings`, `max_agents`, `max_branches`) sont **opposables** côté API métier — un endpoint qui crée une listing au-delà du quota retourne 422. Le ticket câble la lecture du quota dans les services métier concernés (au minimum création de bien et invitation d'agent).
- Activity log obligatoire (`super_admin_plan_*`, `super_admin_subscription_*`).

## Delta à produire

- [ ] Migrations : `plans`, `agency_subscriptions` (avec contrainte d'unicité partielle sur `agency_id WHERE ended_at IS NULL`)
- [ ] Modèles `Plan`, `AgencySubscription` + casts, scopes, relations, LogsActivity
- [ ] Service `App\Services\Billing\AgencySubscriptionService` (assign, cancel, transition trial → active)
- [ ] Service `App\Services\Billing\QuotaResolver` (lecture des limites effectives = plan ⊕ overrides)
- [ ] Controllers `Admin\PlanController`, `Admin\AgencySubscriptionController`, `Api\Me\SubscriptionController`
- [ ] FormRequests, Resources (catalogue `Admin\PlanResource`, fiche agence `Admin\AgencySubscriptionResource`)
- [ ] Câblage des quotas dans `PropertyService::create` (refus 422 si listing actif > quota) et invitation d'agent (idem)
- [ ] Job `Billing\ProcessTrialExpirations` (daily) — bascule `trialing` → `active` ou `past_due` selon paiement
- [ ] Activity log événements
- [ ] Seed initial : plan `free` (price=0, fee=0, limits modestes) + plan `pro` exemple
- [ ] Frontend super-admin : `/super-admin/plans` (catalogue) + onglet "Abonnement" dans `/super-admin/agencies/[id]`
- [ ] Frontend agence : `/admin/agency/billing` (lecture seule)
- [ ] Tests backend : exclusivité de souscription active, override > plan, quota opposable, 403 hors super-admin
- [ ] Tests UI : assignation, changement de plan, lecture côté agence

## Critères d'acceptation

- [ ] Une agence ne peut avoir qu'une `AgencySubscription` non terminée à un instant T (test concurrentiel)
- [ ] Créer une listing au-delà du quota actif retourne 422 avec un message explicite
- [ ] Le `platform_fee_pct` effectif vu par les services aval = override OR plan (test direct)
- [ ] Une souscription `trialing` expirée bascule en `active` ou `past_due` au passage du job daily
- [ ] Un agency_admin reçoit 403 sur `POST /api/admin/plans` et `POST /api/admin/agencies/{id}/subscription`
- [ ] Chaque mutation produit une entrée d'audit
- [ ] Supprimer un plan référencé retourne 409

## Hors périmètre

- Intégration paiement abonnement (Stripe Billing, Lemon Squeezy MoR) — out of scope, payé manuellement aujourd'hui, ticket dédié post-V1
- Auto-suspension d'une agence en `past_due` au-delà d'un délai — out of scope, signalé via TCK-220 (alertes)
- Facturation détaillée (lignes, factures plateforme) — out of scope ici, recouvert partiellement par TCK-223 (payouts)
- Self-service de changement de plan par l'agence — out of scope, super-admin-driven uniquement

## Notes d'implémentation

La contrainte "une souscription ouverte par agence" est appliquée par le service sous transaction et par un index partiel sur SQLite/PostgreSQL ; MySQL conserve l'index de recherche `(agency_id, ended_at)` car il ne supporte pas le même SQL partiel.

Sans intégration paiement d'abonnement dans le scope, les trials expirés basculent vers `active` dans le job quotidien.
