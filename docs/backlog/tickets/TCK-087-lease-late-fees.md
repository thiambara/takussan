---
id: TCK-087
title: "Pénalités de retard automatiques sur loyers"
status: review
phase: P1
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-25
depends_on: [TCK-027, TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#14-lease-
tags: [back, lease, payments]
---

## Objectif utilisateur

Permettre à un Bailleur ou Agent de voir des pénalités de retard appliquées
automatiquement sur les loyers impayés selon les conditions du bail, sans
intervention manuelle, afin de fiabiliser la facturation et le calcul des
arriérés.

## Contrat de données

Le modèle `Lease` (§14) doit exposer les champs de configuration :
`late_fee_percent` (decimal, % du loyer impayé) et `late_fee_grace_days`
(int, jours de tolérance après `due_date`). Le modèle `LeasePayment` (§15)
doit exposer `late_fee_amount` (decimal, calculé) et `late_fee_applied_at`
(timestamp). Si une de ces colonnes manque par rapport à TCK-027/TCK-028,
prévoir une migration additive.

**Endpoints à ajouter / modifier** :

- `PATCH /api/leases/{lease}` accepte désormais `late_fee_percent` et
  `late_fee_grace_days` (FormRequest existant à étendre).
- `GET /api/lease-payments?include=lateFee` expose la pénalité calculée
  et la date d'application.

**Job scheduled** :

- `App\Jobs\Lease\ApplyLateFeesJob` — détecte les `LeasePayment` au statut
  `pending` ou `partial` dont `due_date + grace_days < today` et qui n'ont
  pas encore eu `late_fee_applied_at` set, applique la pénalité et logge
  via ActivityLog.
- Cadence : `daily` à 02:00 (configurable via `Setting`
  `late_fees.cron_hour`).

## Direction UX / Artistique

_Pas de scope frontend dans ce ticket — l'affichage des pénalités est
attendu comme un champ supplémentaire dans le ticket UI loyers
(TCK-063 / TCK-044). Aucune nouvelle page n'est créée._

## Contraintes strictes (métier)

- **Idempotence** : la pénalité ne s'applique qu'une seule fois par
  `LeasePayment`. Une fois `late_fee_applied_at` set, le job ne recalcule
  plus.
- **Calcul** : `late_fee_amount = round(amount_due * late_fee_percent /
  100, 2)`. Si `late_fee_percent` est `null` ou `0` sur le bail, aucune
  pénalité n'est appliquée.
- **Période de grâce** : si `today <= due_date + grace_days`, ne rien
  faire. Le grace est inclusif (egal autorisé).
- **Paiement partiel** : la pénalité est calculée sur le montant **restant
  dû** (`amount_due - amount_paid`), pas sur le total initial.
- **Notification** : un évènement `LeasePaymentLateFeeApplied` est dispatch
  pour permettre l'envoi d'un email au locataire (utilise
  `PreferenceResolver` + canal email).
- **ActivityLog** : chaque application de pénalité crée une entrée
  ActivityLog liée au `LeasePayment` avec `event = late_fee_applied`,
  `properties = {amount, percent, base}`.
- **Plafond optionnel** : si `Setting('late_fees.cap_percent')` est défini,
  la pénalité totale ne dépasse jamais ce % du loyer (clamp).
- **Tenant-scoped** : le job filtre par agence active et applique les
  pénalités agence par agence.

## Delta à produire

- [ ] Migration: `add_late_fee_columns_to_leases` (`late_fee_percent`,
      `late_fee_grace_days` si absents)
- [ ] Migration: `add_late_fee_columns_to_lease_payments`
      (`late_fee_amount`, `late_fee_applied_at` si absents)
- [ ] Service: `App\Services\Lease\LateFeeCalculator` (compute, isApplicable)
- [ ] Job: `App\Jobs\Lease\ApplyLateFeesJob` (chunked par agence)
- [ ] Schedule dans `routes/console.php` : `daily()->at('02:00')`
- [ ] Event: `App\Events\Lease\LeasePaymentLateFeeApplied`
- [ ] Listener: `App\Listeners\Lease\NotifyTenantOfLateFee` (notification
      email respectant `PreferenceResolver`)
- [ ] FormRequest: `UpdateLeaseRequest` étend pour accepter
      `late_fee_percent` (0–50) et `late_fee_grace_days` (0–30)
- [ ] AllowedInclude `lateFee` (alias) ou exposition directe via
      `fields[lease_payments]=late_fee_amount,late_fee_applied_at`
- [ ] Tests: `LateFeeCalculatorTest` (5 scénarios — happy, grace,
      partial, percent zero, cap)
- [ ] Tests: `ApplyLateFeesJobTest` (idempotence, multi-agences, no-op
      si percent zero)
- [ ] Tests: `LeasePaymentLateFeeNotificationTest` (event → notification
      respectant prefs)

## Critères d'acceptation

- [ ] AC1 — Un loyer en retard de `grace_days + 1` jours avec
      `late_fee_percent = 5` reçoit une pénalité = `5% × amount_due`
- [ ] AC2 — Le même loyer ne reçoit pas une seconde pénalité au prochain
      run du job (idempotence via `late_fee_applied_at`)
- [ ] AC3 — Un loyer dont le bail a `late_fee_percent = null` n'est pas
      modifié par le job
- [ ] AC4 — Un loyer payé partiellement reçoit une pénalité calculée sur
      le restant dû, pas sur le total initial
- [ ] AC5 — L'application d'une pénalité crée une entrée ActivityLog avec
      `event = late_fee_applied` + properties détaillées
- [ ] AC6 — L'évènement `LeasePaymentLateFeeApplied` déclenche une
      notification email au locataire (respect prefs)
- [ ] AC7 — Si `Setting('late_fees.cap_percent')` est set à 10 et le
      cumul dépasse, la pénalité est clamp à 10% du loyer
- [ ] AC8 — Le job est scheduled `daily` et apparaît dans `php artisan
      schedule:list`

## Hors périmètre

- UI d'édition des paramètres de pénalités (à inclure dans TCK-044
  édition bail).
- Calcul d'intérêts composés / progressifs (P3).
- Annulation manuelle d'une pénalité par l'agent (peut être ajouté plus
  tard via PATCH dédié).
- Génération de courriers de mise en demeure (ticket dédié si demandé).

## Notes d'implémentation

**Implémentation 2026-04-25** :

- Migrations additives : `add_late_fee_columns_to_leases_table` (`late_fee_percent`
  decimal 5,2 + `late_fee_grace_days` smallint, nullables) ;
  `add_late_fee_columns_to_lease_payments_table` renomme `late_fee` → `late_fee_amount`
  (clé canonique du spec) et ajoute `late_fee_applied_at` timestamp nullable
  (drapeau d'idempotence). L'ancien champ `late_fee` du scaffolding TCK-027 est
  ainsi unifié sous le nom du spec — pas de double colonne.
- `App\Services\Lease\LateFeeCalculator` remplace l'ancien `LeaseLateFeeService` :
  `compute()` (sans persister), `isApplicable()`, `apply()` (persiste +
  ActivityLog `event=late_fee_applied` + `LeasePaymentLateFeeApplied::dispatch`).
  Base de calcul = `remaining_amount` (partial pay correct) ; cap optionnel via
  `Setting('late_fees.cap_percent')` clamp en pourcentage de `amount`.
- `App\Jobs\Lease\ApplyLateFeesJob` parcourt agence par agence (chunk 200) en
  filtrant `late_fee_percent IS NOT NULL AND > 0` et `late_fee_applied_at IS NULL`
  — idempotence stricte. Schedule `dailyAt('02:00')` dans `routes/console.php`
  (remplace l'ancien `06:00` du scaffolding).
- `App\Events\Lease\LeasePaymentLateFeeApplied(payment, amount, percent, base)`
  + listener `App\Listeners\Lease\NotifyTenantOfLateFee` (queued, ShouldQueue) →
  envoie `LeasePaymentLateFeeNotification` au `lease.tenant.user` ; channels
  filtrés par `PreferenceResolver` sur l'event existant `lease_payment_overdue`
  (réutilisation du toggle UI de TCK-070).
- `LeaseController::update(UpdateLeaseRequest)` : nouveau PATCH `/api/leases/{lease}`
  ne validant que `late_fee_percent` (0–50) et `late_fee_grace_days` (0–30).
  Pas de leak sur les autres champs cycle de vie (terminate/renew restent dédiés).
- `LeasePaymentResource` expose `late_fee_amount` + `late_fee_applied_at` ; les
  champs sont déjà filtrables via `fields[lease_payments]=…` côté client (pas
  besoin d'AllowedInclude `lateFee` — sparse fieldsets directs).
- Tests : `LateFeeCalculatorTest` (5 — happy/grace/partial/percent zéro/cap),
  `ApplyLateFeesJobTest` (3 — idempotence/multi-agences/no-op percent zéro),
  `LeasePaymentLateFeeNotificationTest` (3 — event→notif/email-off/default-on).
  Tous verts. 1046 tests backend globaux toujours verts.
- Suppressions : `App\Jobs\ApplyLatePaymentPenalties`,
  `App\Services\Model\LeaseLateFeeService` et son test (remplacés par les
  nouveaux artefacts du spec). `lang/{en,fr}/notifications.php` :
  bloc `lease_late_fee_applied` (4 clés). `wo` non traduit (cohérent avec les
  autres entrées).

