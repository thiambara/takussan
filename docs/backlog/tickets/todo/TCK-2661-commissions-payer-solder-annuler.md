---
id: TCK-2661
title: "Commissions, côté API : payer avec date, moyen et référence, solder un agent, annuler avec motif, lire par agent"
status: todo
phase: P1
family: back
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2662]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#85-commissionentry-"
tags: [back, commissions, adr-0049, audit-ux, app]
---

## Objectif utilisateur

L'admin solde ce qu'il doit à un agent en une fois et le prouve (date, moyen, référence) ; l'agent sait ce qu'on lui doit, ce qu'on lui a payé, et pourquoi une ligne a été annulée.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- `GET /api/commissions` (`CommissionEntryResource`) : `beneficiary_id`, `origin`, `base_amount`, `share_percent`, `amount`, `status` (due, paid, cancelled), `earned_at`, `paid_at`, `paid_by_id`, `cancelled_at`, `cancelled_by_id` ; `include=beneficiary,lease` (référence du bail seulement). **Ni bien, ni moyen, ni référence de paiement, ni motif d'annulation** : ces colonnes n'existent pas. Filtres : `status`, `beneficiary_id`, `lease_id`, `origin` ; aucune période. `meta.totals` par statut.
- `POST /api/commissions/{id}/mark-paid` et `…/cancel` : **aucun corps, aucune FormRequest**, `paid_at = now()` ; annulation sans motif. Journalisées par `Auditable`.
- Aucun agrégat par bénéficiaire, aucun solde groupé. `GET /api/export/commissions` exige `reports.export` (l'agent ne peut pas exporter ses lignes).
- Aucune notification au bénéficiaire quand une commission est payée.

## Contraintes strictes (métier)

- Autorisation inchangée : payer, solder et annuler exigent `payouts.approve` (`CommissionEntryPolicy`) ; l'agent ne lit que ses lignes, l'admin toutes (l'API tranche, ADR-0049).
- Seule une ligne `due` se paie ou s'annule ; un solde groupé est **atomique** (toutes les lignes ou aucune) et ne porte que sur un même bénéficiaire et une même agence.
- `paid_at` ≤ aujourd'hui (heure de Dakar) et ≥ `earned_at` ; moyen requis parmi `wave`, `orange_money`, `free_money`, `cash`, `bank_transfer` ; référence requise sauf pour `cash` (même règle de traçabilité que les décaissements, `features.md` § 1.5).
- Annulation : code de motif requis (`lease_terminated_before_move_in`, `wrong_beneficiary`, `wrong_rate_or_base`, `other`), texte requis si `other` (≤ 500) ; le motif est **visible du bénéficiaire**.
- ⚠ Le registre actuel (`CommissionsLedger`) appelle `mark-paid` et `cancel` **sans corps** : ce ticket ne se fusionne pas seul. Il part dans la même PR que TCK-2662, ou garde ses champs facultatifs jusqu'à TCK-2662 — jamais un `dev` où le bouton d'aujourd'hui rend 422.

## Delta à produire

- [ ] Migration `add_payment_and_cancel_details_to_commission_entries` : `payment_method`, `payment_reference` (100), `cancel_reason_code`, `cancel_reason` (500), tous nullables.
- [ ] `MarkCommissionPaidRequest` (`paid_at`, `payment_method`, `payment_reference`) et `CancelCommissionRequest` (`reason_code`, `reason`) branchées sur les routes existantes.
- [ ] `POST /api/commissions/settle` → `CommissionEntryController::settle`, `SettleCommissionsRequest` (`beneficiary_id`, `entry_ids[]` ≤ 100, `paid_at`, `payment_method`, `payment_reference`), via `CommissionLedgerService::settle` dans une transaction.
- [ ] `GET /api/commissions/summary?year=YYYY&month=YYYY-MM` → par bénéficiaire : `due_amount`, `due_count`, `oldest_due_earned_at`, `paid_month`, `paid_year`, `last_paid {at, method}` ; l'agent n'y voit que lui.
- [ ] Ressource : `payment_method`, `payment_reference`, `cancel_reason_code`, `cancel_reason` ; `include=lease.property` → `property {id, title, quarter}`.
- [ ] Filtres `filter[earned_from|earned_to|paid_from|paid_to]`.
- [ ] Notification `CommissionPaidNotification` (code `commission.paid`) au bénéficiaire : une seule par paiement ou par solde groupé, selon ses préférences de canal.
- [ ] `GET /api/export/commissions` s'ouvre au bénéficiaire pour ses seules lignes, sans `reports.export`.
- [ ] Tests : `CommissionMarkPaidDetailsTest`, `CommissionSettleTest`, `CommissionCancelReasonTest`, `CommissionSummaryTest`, `CommissionExportBeneficiaryTest`.

## Critères d'acceptation

- [ ] AC1 — `mark-paid` sans `payment_method` → 422 sur ce champ ; avec `cash` et sans référence → 200 ; avec `wave` et sans référence → 422.
- [ ] AC2 — Un solde de trois lignes dont une déjà payée → 422, et les deux autres restent `due` (état relu après l'appel).
- [ ] AC3 — Un solde de trois lignes dues → trois lignes `paid` avec la même date, le même moyen et la même référence, et **une** notification au bénéficiaire.
- [ ] AC4 — `cancel` sans `reason_code` → 422 ; avec `other` sans texte → 422 ; le bénéficiaire relit le code et le texte sur sa ligne.
- [ ] AC5 — Un agent qui appelle `summary` ne reçoit qu'une entrée, la sienne ; `settle` par un agent sans `payouts.approve` → 403.
- [ ] AC6 — `filter[paid_from]=2026-11-01` exclut une ligne payée le 31 octobre à 23:30 heure de Dakar.
- [ ] AC7 — L'agent exporte ses lignes et le fichier ne contient aucune ligne d'un autre bénéficiaire.

## Hors périmètre

- Le versement réel de la commission par Wave depuis l'écran (ambition de l'audit).
- La prévision « à venir » (approche C, non retenue).
- Les écrans (TCK-2662).

## Notes d'implémentation

_(à remplir par implementing-specs)_
