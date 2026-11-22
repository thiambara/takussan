---
id: TCK-2681
title: "L'approbation d'un passage en pro pose l'abonnement au plan annoncé, dans la même transaction"
status: done
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2669]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#43-plan-"
    - "docs/models-spec.md#44-agencysubscription-"
    - "docs/models-spec.md#49-agencyupgraderequest-"
tags: [back, billing, agence, passage-pro, audit-ux, app]
---

## Objectif utilisateur

L'hôte qui demande à passer en pro lit un prix (TCK-2671). Quand la plateforme approuve, son agence
est abonnée à **ce** plan, à ce prix : ce que l'écran a promis, l'approbation le tient, sans geste
séparé du super-admin.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `AgencyUpgradeReviewService::approve` (`:44-108`) passe la demande `approved`, bascule l'agence en
  `standard` (`AgencyKindFlipService::flip`) dans une transaction, puis émet `AgencyUpgradeApproved`
  (après commit). **Aucun abonnement n'est posé** (ni là, ni dans `FlipAgencyKindOnUpgradeApproved`).
- `AgencySubscriptionService::assign(Agency, Plan, User $actor, array $data)` (`:16-56`) clôt
  l'abonnement ouvert et en ouvre un neuf (`active`, ou `trialing` si `trial_ends_at` futur), période
  d'un mois, et journalise `super_admin_subscription_assigned`.
- `agency_subscriptions` n'a **pas de colonne de prix** : le prix est celui du plan (`plans.monthly_price_xof`).
- Le plan annoncé à l'hôte est désigné par `billing.upgrade_plan_code` (défaut `pro`), posé par TCK-2669.

**À faire** :

- Dans la transaction de `approve`, après la bascule : résoudre le plan `billing.upgrade_plan_code`
  (actif), puis `AgencySubscriptionService::assign($agency, $plan, $reviewer)` sans essai ni
  dérogation. Plan introuvable ou inactif → la transaction échoue (422 `agency_upgrade.plan_unavailable`)
  et la demande reste `pending`.
- Le journal porte un événement propre, `agency_upgrade_subscription_assigned` (agence, plan,
  demande), en plus de celui d'`assign`.

## Direction UX / Artistique

Sans objet (ticket API). L'écran « Offre » (TCK-2671) peut, une fois ce ticket livré, dire « Votre
abonnement commence à l'approbation » ; il ne le dit pas avant.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0104](../../../adr/0104-l-identite-legale-de-l-agence-n-a-qu-une-source.md) § 6 (décidé par le porteur le 2026-11-10).

- **Sans prélèvement automatique** : l'abonnement est posé, aucun paiement n'est déclenché ni
  programmé par ce ticket.
- **Le prix est celui du plan** au moment où on le lit : l'abonnement n'a pas de colonne de prix, et
  un prix de plan changé vaut pour tous ses abonnés, comme aujourd'hui (ADR-0104 § 6). Figer le prix
  est hors périmètre.
- **Tout ou rien** : si l'abonnement ne peut pas être posé, ni la bascule ni l'approbation ne restent.
- Une agence qui a déjà un abonnement ouvert (posé à la main par le super-admin avant l'approbation)
  le voit clos et remplacé par `assign`, comme tout changement de plan ; le journal le dit.
- Le rejet d'une demande ne touche à aucun abonnement.

## Delta à produire

- [x] `AgencyUpgradeReviewService::approve` : résolution du plan, `assign`, erreur `agency_upgrade.plan_unavailable`.
- [x] Événement de journal `agency_upgrade_subscription_assigned`.
- [x] Tests `AgencyUpgradeApprovalSubscriptionTest` : approbation → un abonnement ouvert au plan `pro`, statut `active`, période d'un mois ; plan inactif → 422, demande `pending`, agence restée `individual`, aucun abonnement ; abonnement préexistant → clos et remplacé ; rejet → aucun abonnement.

## Critères d'acceptation

- [x] AC1 — Après `POST /api/admin/agency-upgrade-requests/{id}/approve` sur la démo, `GET /api/me/subscription` de l'admin de l'agence rend le plan `pro`, statut `active`, et `plan.monthly_price_xof=50000`.
- [x] AC2 — Avec le plan `pro` désactivé, la même approbation rend 422 `agency_upgrade.plan_unavailable` ; la demande est toujours `pending` et l'agence `individual` (ablation : retirer le `assign` fait rougir AC1, pas AC2).
- [x] AC3 — Aucun job de paiement ni aucune facture n'est créé par l'approbation (compte des tables `invoices` et des jobs de paiement inchangé).

## Hors périmètre

- Le prélèvement de l'abonnement, l'essai gratuit, une remise de lancement.
- Figer le prix à l'approbation.
- L'écran (TCK-2671).

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-agence, lot audit UX /app). Prémisse re-mesurée : `approve` ne posait aucun abonnement, ni `FlipAgencyKindOnUpgradeApproved`.

- `AgencyUpgradeReviewService::subscribeToUpgradePlan()`, appelée dans la transaction d'`approve` **après** la bascule et avant l'événement : plan résolu par `App\Services\Billing\UpgradeOffer::plan()` — la **même** résolution que `GET /api/me/upgrade-offer` (TCK-2669), plan actif de code `billing.upgrade_plan_code` — puis `AgencySubscriptionService::assign($agency, $plan, $reviewer)` sans essai ni dérogation. Plan introuvable ou inactif → 422 `agency_upgrade.plan_unavailable` (`errors.php`, fr/en/wo) levée après la bascule : la transaction entière est annulée — demande `pending` sans `reviewed_at`, agence `individual`, aucun journal d'approbation, aucun avis.
- Journal `agency_upgrade_subscription_assigned` sur l'abonnement : `agency_id`, `plan_id`, `agency_upgrade_request_id`, `replaced_subscription_ids` (les abonnements ouverts que `assign` clôt, relevés juste avant), en plus de `super_admin_subscription_assigned` qu'écrit `assign`.
- Aucun paiement : `assign` n'écrit ni facture ni job ; AC3 l'épingle (compte d'`invoices` inchangé, aucun job poussé dont le nom évoque paiement, facture, abonnement ou reversement).
- AC1 : sur la base de démo, le plan résolu est `pro` à 50 000 (relevé par le service le 2026-11-11) ; l'approbation elle-même n'a pas été jouée sur la démo (elle l'aurait modifiée) — elle est éprouvée par `AgencyUpgradeApprovalSubscriptionTest`, jusqu'à `GET /api/me/subscription` de l'admin.
- ⚠ **Conséquence de déploiement** : un environnement sans plan `pro` actif ne peut plus approuver aucun passage. La préproduction est semée par `DatabaseSeeder` → `PlanSeeder` (pro, 50 000) ; la production (phase F) devra l'avoir avant la première approbation.
- Tests : les quatre classes qui approuvent sans parler d'abonnement (`AgencyUpgradeRequestReviewTest`, `AgencyKindFlipTest`, `AgencyUpgradeRequestEncryptionTest`, `AgencyUpgradeReviewSousVerrouTest` — 11 tests rouges sans lui) portent le trait neuf `Tests\Support\PlanDuPassage`, qui pose le plan comme `PlanSeeder`.
- Hors de ce ticket : ADR-0104 § Application « `AgencyKindFlipService` sans recopie implicite » — la recopie « si vide » des champs légaux à l'approbation est toujours là ; aucun ticket ne la porte encore.
