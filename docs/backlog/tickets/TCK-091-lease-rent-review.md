---
id: TCK-091
title: "Révision annuelle du loyer"
status: todo
phase: P2
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-027, TCK-018]
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#14-lease-
tags: [back, lease, activitylog]
---

## Objectif utilisateur

Permettre à un Agent ou Bailleur de réviser le loyer mensuel d'un bail en
cours via un endpoint dédié, en consignant systématiquement le motif et
en conservant l'historique des révisions, afin de garder une trace
auditable de chaque évolution sans recourir à un nouvel avenant complet.

## Contrat de données

Le modèle `Lease` (§14) expose `monthly_rent` (decimal). Ce ticket
n'introduit **pas** de nouvelle table — l'historique est porté par
`ActivityLog` (TCK-018, basé sur spatie/laravel-activitylog), avec un
event dédié `lease_rent_reviewed` et `properties = {old_rent, new_rent,
reason, effective_date}`.

**Endpoint nouveau** :

- `PATCH /api/leases/{lease}/rent` body
  `{ new_rent, reason, effective_date? }`
  → met à jour `monthly_rent`, log un `ActivityLog`, dispatche
  notification.

Pas de `PATCH /leases/{id}` générique pour `monthly_rent` — la mise à jour
du loyer **doit** passer par cet endpoint dédié pour garantir la
journalisation. Un guard côté `UpdateLeaseRequest` rejette `monthly_rent`
en 422 (`use_dedicated_endpoint`).

**Lecture historique** :

- `GET /api/leases/{lease}/rent-history` → retourne l'historique extrait
  d'`ActivityLog` filtré sur `event = lease_rent_reviewed`, ordonné
  desc.

## Direction UX / Artistique

_Pas de scope frontend dans ce ticket — l'affichage de l'historique des
révisions sera intégré dans la timeline de la fiche bail (TCK-044) lors
d'un ticket UI dédié si nécessaire._

## Contraintes strictes (métier)

- **Statut bail requis** : révision possible uniquement si
  `lease.status in [active, ending_soon]`. 422 sinon.
- **Reason obligatoire** : `reason` non vide (min 5 caractères, max 500).
  422 sinon.
- **Variation max sans surcharge** : si `|new_rent - old_rent| /
  old_rent > Setting('lease.rent_review_max_pct', default=20)`, 422
  (`variation_excessive`) sauf si `force=true` est passé (réservé
  permission `leases.rent_review_force`).
- **Effective_date** : si fournie, doit être >= today. Si non fournie,
  application immédiate. Si > today, le `monthly_rent` est mis à jour
  immédiatement mais l'effet est documenté dans le log et utilisé par
  les jobs de génération de loyers à la bonne date.
- **Permissions** : `leases.rent_review` — réservé Agent / OwnerAgency.
- **Notification** : event `LeaseRentReviewed` → notif email + in-app au
  Locataire (avec ancien et nouveau loyer + motif).
- **ActivityLog** : entrée systématique avec
  `properties = {old_rent, new_rent, reason, effective_date,
  variation_pct, forced}`.
- **Pas de back-dating** : `effective_date < today` → 422.
- **Cohérence avec LeasePayment** : les loyers déjà générés (mois en
  cours / passés) ne sont pas modifiés rétroactivement. Seuls les
  prochains `LeasePayment` créés utilisent le nouveau montant.

## Delta à produire

- [ ] Service: `App\Services\Lease\RentReviewService` (review,
      validateVariation, log, notify)
- [ ] Controller: `App\Http\Controllers\Api\LeaseRentController`
      (`update`, `index` pour history)
- [ ] FormRequest: `ReviewRentRequest` (new_rent decimal, reason 5-500,
      effective_date >= today, force boolean)
- [ ] Routes: `routes/api/leases.php` (PATCH /rent + GET /rent-history)
- [ ] Policy: `LeasePolicy@reviewRent` + `@forceReviewRent`
- [ ] Guard: `UpdateLeaseRequest` rejette `monthly_rent` avec message
      pointant vers l'endpoint dédié
- [ ] Event + Listener: `LeaseRentReviewed` →
      `NotifyTenantOfRentReview`
- [ ] AllowedFilter sur `ActivityLog` côté `LeaseRentHistoryController`
      (event = lease_rent_reviewed, sort desc)
- [ ] Tests: `RentReviewServiceTest` (variation max, force, reason
      requise, statut invalide, back-dating)
- [ ] Tests: `LeaseRentEndpointTest` (200 + 422 + 403 + log créé)
- [ ] Tests: `LeaseRentHistoryEndpointTest` (ordre + sparse fields +
      pagination)
- [ ] Tests: `RejectMonthlyRentInGenericPatchTest` (PATCH /leases avec
      monthly_rent → 422 avec hint)

## Critères d'acceptation

- [ ] AC1 — `PATCH /leases/{id}/rent` avec `new_rent`, `reason` valides
      → 200, monthly_rent mis à jour
- [ ] AC2 — Une entrée `ActivityLog` est créée avec `event =
      lease_rent_reviewed` et properties complètes
- [ ] AC3 — `reason` manquant ou < 5 chars → 422 (`reason_required`)
- [ ] AC4 — Variation > 20% sans `force=true` → 422
      (`variation_excessive`)
- [ ] AC5 — Variation > 20% avec `force=true` et permission
      `leases.rent_review_force` → 200
- [ ] AC6 — `PATCH /leases/{id}` générique avec `monthly_rent` dans le
      body → 422 (`use_dedicated_endpoint`)
- [ ] AC7 — `GET /leases/{id}/rent-history` retourne l'historique
      ordonné desc avec ancien/nouveau loyer et motif
- [ ] AC8 — Locataire reçoit notif email + in-app au moment de la
      révision

## Hors périmètre

- Indexation automatique sur indice INSEE / IRL (P3, futur job
  scheduled distinct).
- Application rétroactive sur les `LeasePayment` déjà émis (V1 — pas
  d'effet rétro).
- Workflow de validation Locataire (signature électronique de l'avenant) —
  pour cela, utiliser TCK-089 renouvellement à la place.
- Plafonnement légal régional (à câbler via `Setting` plus tard).
- UI dédiée d'historique des révisions — sera intégrée dans la fiche
  bail UI au prochain ticket frontend.

## Notes d'implémentation

_(à remplir par implementing-specs)_
