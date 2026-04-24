---
id: TCK-092
title: "Relance automatique factures en retard"
status: todo
phase: P2
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#25-invoice-
tags: [back, invoices, notifications]
---

## Objectif utilisateur

Permettre à un Agent ou Bailleur de voir les factures en retard relancées
automatiquement par email selon une cadence configurable (J+3, J+7, J+15
après échéance), afin d'accélérer les recouvrements sans charge manuelle
et avec une trace auditable de chaque relance émise.

## Contrat de données

Le modèle `Invoice` (§25) doit exposer `last_reminder_sent_at` (timestamp
nullable) et `reminders_sent_count` (int default 0). Si ces colonnes ne
sont pas présentes après TCK-028, prévoir une migration additive.

La cadence est configurable globalement via `Setting`
`invoice.reminder_offsets_days` (default `[3, 7, 15]`, json array d'ints
positifs).

**Pas de nouveau endpoint de déclenchement manuel** dans ce ticket — la
relance est strictement automatique. Un futur endpoint `POST
/invoices/{id}/remind` peut être ajouté plus tard.

**Lecture côté API** : les nouvelles colonnes sont exposées via les
sparse fieldsets habituels (`fields[invoices]=last_reminder_sent_at,
reminders_sent_count,…`).

**Job scheduled** :

- `App\Jobs\Invoice\SendOverdueRemindersJob` — `daily` à 09:00 (heure
  locale agence si possible, sinon UTC). Pour chaque agence active, le
  job parcourt les invoices `pending` ou `partial` dont `due_date` est
  dépassée et dont `today - due_date` correspond à un des offsets
  configurés ; envoie une notification email + in-app au destinataire de
  l'invoice.

## Direction UX / Artistique

_Pas de scope frontend dans ce ticket. L'affichage des relances envoyées
(date, count) sera intégré au ticket UI factures (TCK-063) au prochain
sprint si demandé._

## Contraintes strictes (métier)

- **Statuts éligibles** : seules les invoices en `pending` ou `partial`
  sont relancées. Les `paid`, `cancelled`, `disputed` sont ignorées.
- **Offsets exact match** : la relance se déclenche uniquement quand
  `today - due_date` est **exactement** dans la liste des offsets
  configurés (pas d'intervalle continu pour éviter le spam si le job
  rate un run).
- **Idempotence par offset** : pour un offset donné, une seule
  notification est envoyée. La détection se base sur
  `reminders_sent_count` et un log applicatif (ActivityLog) — refus de
  rebrouettage du même offset le même jour.
- **Cap dur** : si `reminders_sent_count >= count(offsets)`, plus aucune
  relance auto. Une escalade manuelle prend le relais (hors scope).
- **Préférences notification** : respect strict de
  `App\Services\Notification\PreferenceResolver` — un user qui a opt-out
  des relances factures ne reçoit rien (mais l'invoice est quand même
  marquée comme "relance tentée" pour audit).
- **Locale** : email envoyé dans la locale du destinataire (User.locale,
  fallback agence).
- **Multi-tenant** : le job filtre par `agency_id` et n'expose jamais
  les invoices d'une autre agence.
- **ActivityLog** : entrée `event = invoice_reminder_sent` sur
  l'invoice, `properties = {offset_days, recipient_email, channel}`.
- **Throttle email** : utiliser la rate-limit `notifications` existante
  pour éviter les bursts (>1000 emails/min).

## Delta à produire

- [ ] Migration: `add_reminder_columns_to_invoices`
      (`last_reminder_sent_at`, `reminders_sent_count`)
- [ ] Service: `App\Services\Invoice\OverdueReminderService` (eligible,
      sendOne, recordLog)
- [ ] Job: `App\Jobs\Invoice\SendOverdueRemindersJob` (chunked par
      agence, rate-limited)
- [ ] Schedule dans `routes/console.php` : `daily()->at('09:00')` +
      `withoutOverlapping()`
- [ ] Notification: `App\Notifications\InvoiceOverdueReminder` (email +
      database channels, locale-aware)
- [ ] Setting key `invoice.reminder_offsets_days` (seeder ou migration
      Setting)
- [ ] AllowedField `last_reminder_sent_at`, `reminders_sent_count` dans
      `InvoiceController` (sparse fieldsets)
- [ ] Tests: `OverdueReminderServiceTest` (5 scénarios — eligible,
      paid skip, cap reached, opt-out)
- [ ] Tests: `SendOverdueRemindersJobTest` (multi-agence, idempotence,
      offsets exact match, throttle)
- [ ] Tests: `InvoiceOverdueReminderNotificationTest` (locale, channels,
      pref resolver)

## Critères d'acceptation

- [ ] AC1 — Une invoice `pending` dont `due_date` est il y a 3 jours
      reçoit exactement 1 email de relance après run du job
- [ ] AC2 — Le même run le jour suivant (offset = 4j, non listé)
      n'envoie aucun email
- [ ] AC3 — Un 2e run le même jour (J+3) ne renvoie pas la relance
      (idempotence intra-journée)
- [ ] AC4 — Une invoice `paid` n'est jamais relancée
- [ ] AC5 — Au-delà du dernier offset (J+15 envoyé), `reminders_sent_count
      = 3` et aucune nouvelle relance n'est envoyée
- [ ] AC6 — Un user avec `notification_preferences.invoice_reminders =
      false` ne reçoit pas d'email mais l'invoice est marquée comme tentée
- [ ] AC7 — L'email est envoyé dans la locale du destinataire (fr/en/wo)
- [ ] AC8 — Une entrée ActivityLog est créée par relance avec
      `event = invoice_reminder_sent` + properties détaillées
- [ ] AC9 — `php artisan schedule:list` montre le job daily 09:00 avec
      `withoutOverlapping`

## Hors périmètre

- UI d'édition des offsets de relance (peut être ajoutée à
  TCK-068 admin settings).
- Endpoint manuel `POST /invoices/{id}/remind` (futur ticket).
- Relance par SMS / WhatsApp (P3 — nécessite intégration
  passerelle).
- Escalade automatique vers contentieux (P3).
- Personnalisation du template d'email par agence (utilisera TCK-077
  templates si demandé).
- Génération de courriers papier (hors scope V1).

## Notes d'implémentation

_(à remplir par implementing-specs)_
