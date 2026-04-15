---
id: TCK-027
title: Location longue durée (baux)
status: todo
phase: P1
family: applicatif
estimate: XL
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-019, TCK-020]
blocks: [TCK-028, TCK-030, TCK-031, TCK-032]
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#27-guarantor-
tags: [back, front, lease, rent, payments, guarantor, schedule]
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
- [ ] Endpoint `POST /api/leases/{lease}/guarantors` — ajouter un garant avec documents
- [ ] Endpoint `POST /api/leases/{lease}/generate-schedule` — générer l'échéancier de loyers mensuels
- [ ] Endpoint `POST /api/leases/{lease}/payments` — enregistrer un paiement mensuel
- [ ] Job `LeasePaymentReminderJob` — relances automatiques impayés (email + notification)
- [ ] Service `LeaseLateFeeService` — calcul et application automatique des pénalités de retard
- [ ] Endpoint `POST /api/leases/{lease}/refund-deposit` — remboursement caution en fin de bail
- [ ] Endpoint `GET /api/leases/{lease}/history` — historique complet du bail
- [ ] Pages Angular : création bail, fiche bail, échéancier, enregistrement paiement, garants
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
- [ ] Les garants sont ajoutés avec documents joints
- [ ] L'échéancier génère une entrée `LeasePayment` par mois sur la durée du bail
- [ ] Les paiements en retard déclenchent une relance et des pénalités automatiques
- [ ] Le remboursement de caution est enregistré avec le montant retenu
- [ ] L'historique du bail est consultable avec tous les événements

## Hors périmètre

- Passerelle de paiement (→ TCK-002)
- Facturation et factures (→ TCK-028)
- Signature électronique (→ P3 futur)

## Notes d'implémentation

_(à remplir par implementing-specs)_
