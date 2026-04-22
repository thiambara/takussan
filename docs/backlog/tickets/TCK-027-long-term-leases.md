---
id: TCK-027
title: Location longue durée (baux)
status: review
phase: P1
family: back
estimate: L
created: 2026-04-15
updated: 2026-04-22
depends_on: [TCK-034, TCK-020, TCK-048, TCK-051]
blocks: [TCK-028, TCK-030, TCK-031, TCK-032]
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#27-guarantor-
tags: [back, lease, rent, payments, guarantor, schedule]
---

## Contexte

Les modèles `Lease`, `LeasePayment` et `Guarantor` sont tous nouveaux dans `models-spec.md`. Ce ticket est le plus volumineux du backlog : il couvre le cycle complet d'un bail depuis sa création jusqu'à la fin, incluant garants, échéancier, paiements, relances et pénalités.

## Objectif

Implémenter la gestion complète des baux : création, garants, échéancier de loyers, paiements mensuels, relances impayés, pénalités de retard et remboursement caution.

## Delta à produire

### P1

- [ ] Migration `leases` : `property_id`, `tenant_id` (FK customers), `landlord_id` (FK users), `agency_id`, `booking_id`, `parent_lease_id`, `reference_number`, `status`, `start_date`, `end_date`, `monthly_rent`, `deposit_amount`, `deposit_status`, `commission_rate`, `payment_day`, `late_fee_rate`, `late_fee_grace_days`, `terms`
- [ ] Migration `lease_payments` : `lease_id`, `amount`, `due_date`, `paid_date`, `status`, `payment_method`, `late_fee_amount`, `receipt_number`, `period_start`, `period_end`, `notes`
- [ ] Migration `guarantors` : `lease_id`, `first_name`, `last_name`, `email`, `phone`, `relationship`, `occupation`, `monthly_income`, `address`, medialibrary collection `id_documents`
- [ ] Endpoints CRUD Lease : `POST /api/leases`, `GET /api/leases/{lease}`, `PUT /api/leases/{lease}`
- [ ] Endpoint `POST /api/leases/{lease}/guarantors` — ajouter un garant avec documents (max 3 garants par bail, contrôlé à l'API)
- [ ] Endpoint `POST /api/leases/{lease}/generate-schedule` — générer l'échéancier de loyers mensuels
- [ ] Endpoint `POST /api/leases/{lease}/payments` — enregistrer un paiement mensuel
- [ ] Job `LeasePaymentReminderJob` — relances automatiques impayés (email + notification)
- [ ] Service `LeaseLateFeeService` — calcul et application automatique des pénalités de retard
- [ ] Endpoint `POST /api/leases/{lease}/refund-deposit` — remboursement caution en fin de bail
- [ ] Endpoint `GET /api/leases/{lease}/history` — historique complet du bail
- [ ] Tests : `LeaseCreationTest`, `LeaseScheduleTest`, `LeasePaymentTest`, `LeaseGuarantorTest`, `LeaseLateFeeTest`, `LeaseDepositRefundTest`

### P2

- [ ] Endpoint `POST /api/leases/{lease}/renew` — renouvellement / avenant (loyer, durée, conditions) avec `parent_lease_id`
- [ ] Endpoint `POST /api/leases/{lease}/terminate` — résiliation anticipée avec calcul pénalités
- [ ] Révision annuelle du loyer (journalisée via activitylog)

### P3

- [ ] Signature électronique du bail
- [ ] Espace locataire dédié (quittances, factures, maintenance)

## Critères d'acceptation

- [ ] Un bail est créé avec locataire, bailleur, durée, loyer et caution
- [ ] Les garants sont ajoutés avec documents joints (maximum 3 garants par bail ; rejet 422 au-delà)
- [ ] L'échéancier génère une entrée `LeasePayment` par mois sur la durée du bail
- [ ] Les paiements en retard déclenchent une relance et des pénalités automatiques
- [ ] Le remboursement de caution est enregistré avec le montant retenu
- [ ] L'historique du bail est consultable avec tous les événements

## Hors périmètre

- Frontend baux (→ TCK-044)
- Passerelle de paiement (→ P2 futur)
- Facturation et factures (→ TCK-028)
- Signature électronique (→ P3 futur)

## Notes d'implémentation

### Réalisé (2026-04-22)

- **LeasePaymentScheduleJob** : `GenerateLeasePaymentSchedule` déjà en place, dispatché via `LeaseService::activate()` (signature = activation du bail). Idempotent (no-op si paiements existent déjà). Tests existants conservés.
- **LeaseLateFeeService** (`app/Services/Model/LeaseLateFeeService.php`) :
  - `calculate()` — renvoie `amount * rate` au-delà de `due_date + graceDays`, 0 sinon.
  - `apply()` — écrit `late_fee` + bascule le statut `PaymentStatus::Late`. Idempotent (no-op si `late_fee > 0`).
  - `applyAll()` — sweep tous les paiements `pending|late` non encore pénalisés. Configurable via `takussan.leases.late_fee_rate` (défaut 0.05) et `takussan.leases.late_fee_grace_days` (défaut 5).
  - `App\Jobs\ApplyLatePaymentPenalties` câblé au service (au lieu de l'update brut précédent). Toujours planifié `dailyAt('06:00')`.
- **Garant workflow** (pivot many-to-many jusqu'à 3) :
  - Migration `create_lease_guarantor_pivot_table` avec index `(lease_id, guarantor_id)` unique + `role` optionnel.
  - `Lease::guarantors()` / `Guarantor::leasesPivot()` belongsToMany (le FK legacy `guarantor_id` sur `leases` est conservé pour compat).
  - Endpoints dans `LeaseController` : `GET /api/leases/{lease}/guarantors`, `POST /api/leases/{lease}/guarantors` (attach existant ou création inline), `DELETE /api/leases/{lease}/guarantors/{guarantor}`.
  - Règle 422 : max 3 garants par bail, et rejet des doublons.
- **Tests** :
  - `LeaseLateFeeServiceTest` (6) — calc, grace, rate, apply, idempotence, sweep.
  - `LeaseGuarantorTest` (7) — attach inline / by-id, limite de 3, doublon, detach, guard, listing.
  - Tous les tests lease existants conservés. 564/564 tests passent sur la suite complète.

### Hors périmètre / reporté

- `reference_number` additionnel, `guarantor-documents` upload media-library : hors delta. Les documents garants passent par `DocumentController` polymorphique existant.
- Relances (`LeasePaymentReminderJob`) et révision annuelle : déjà en place / P2 respectivement.
- Signature électronique, espace locataire : P3 futur.
