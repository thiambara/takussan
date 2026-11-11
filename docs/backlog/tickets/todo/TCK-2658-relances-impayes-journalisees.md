---
id: TCK-2658
title: "Relances d'impayés journalisées : l'agence note qu'elle a relancé, l'écran le relit"
status: todo
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2657]
blocks: [TCK-2660, TCK-2644]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#84-leasepaymentlink-"
    - "docs/models-spec.md#125-leasepaymentreminder-"
tags: [back, finances, relance, whatsapp, audit-ux, app]
---

## Objectif utilisateur

L'admin qui relance un locataire en retard voit, sur la ligne de l'impayé, qui a relancé, quand et par quel canal — y compris les rappels automatiques de Takussan.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- **Aucune** table, aucun modèle, aucune route de relance manuelle (`grep` des routes et des modèles : rien).
- Les rappels automatiques existent : `SendLeasePaymentReminders` (J-3, J+1, J+7, quotidien) pose `metadata.reminder_{étape}_sent_at` sur la `LeasePayment` et met l'URL de paiement dans le message.
- Le lien de paiement d'une échéance existe et se crée par l'agence : `POST /api/lease-payments/{payment}/payment-link` (TCK-602, `LeasePaymentPolicy::update`, 409 si l'échéance n'est plus payable).

**Décision 13 (a) du porteur** : la relance part de WhatsApp, avec un message prérempli, **depuis le téléphone de l'admin** — Takussan n'envoie rien. L'API ne fait que **noter** la relance.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md).
- Takussan n'envoie aucun message dans ce ticket : la route enregistre un fait, elle ne déclenche ni SMS, ni WhatsApp, ni e-mail.
- Canaux enregistrables : `whatsapp`, `call`. Le texte du message n'est **pas** stocké (le front le possède, principe 5) ; une note libre facultative (500 caractères) l'est.
- Une relance ne s'enregistre que sur une échéance de bail **due et non soldée** de l'agence de l'appelant ; autorisation : la même que le lien de paiement (`LeasePaymentPolicy::update`).
- Journalisée par le journal d'audit de l'agence, sans donnée personnelle dans les journaux applicatifs (cf. TCK-613).
- Les rappels automatiques apparaissent dans la lecture avec `source: automatic`, sans auteur.

## Delta à produire

- [ ] Migration `create_lease_payment_reminders_table` : `id`, `agency_id`, `lease_payment_id`, `channel`, `created_by_id`, `note` (nullable), `created_at` ; index `(lease_payment_id, created_at)`.
- [ ] Modèle `LeasePaymentReminder` (trait `Auditable`), enum `App\Models\Enums\ReminderChannel` (`whatsapp`, `call`).
- [ ] `POST /api/lease-payments/{payment}/reminders` → `LeasePaymentReminderController::store`, `StoreLeasePaymentReminderRequest` (`channel` requis, `note` ≤ 500) ; 201 ; 409 `lease_payment.not_overdue` si l'échéance n'est pas due ou est soldée.
- [ ] `GET /api/lease-payments/{payment}/reminders` → relances manuelles et automatiques fusionnées, de la plus récente à la plus ancienne : `{at, source: manual|automatic, channel|null, by {id, name}|null, note|null}`.
- [ ] `GET /api/payments/history` (TCK-2657) : `include=reminders` ajoute sur une ligne de bail `last_reminder {at, source, channel, by}` et `reminders_count`.
- [ ] Point du mois (TCK-2657) : `overdue.never_reminded_count` (échéances en retard sans aucune relance, manuelle ou automatique).
- [ ] Tests : `LeasePaymentReminderTest`, extension de `AgencyFinanceSummaryTest`.

## Critères d'acceptation

- [ ] AC1 — Sur une échéance en retard, `POST … {channel: whatsapp}` rend 201 et une ligne en base ; sur une échéance payée, 409 et aucune ligne (compte avant / après).
- [ ] AC2 — L'admin d'une autre agence reçoit 403 et aucune ligne n'est écrite.
- [ ] AC3 — Une échéance qui a reçu le rappel automatique J+7 puis une relance WhatsApp de l'admin rend deux entrées, dans cet ordre : la manuelle (avec auteur) puis l'automatique (`by: null`).
- [ ] AC4 — `include=reminders` rend `last_reminder.source = manual` et `reminders_count = 2` pour cette échéance ; sans `include`, aucune clé `last_reminder`.
- [ ] AC5 — Aucun envoi n'est déclenché : `Notification::fake()` et le faux du pilote WhatsApp ne voient rien passer pendant le `POST`.
- [ ] AC6 — `never_reminded_count` passe de 1 à 0 quand on relance l'unique échéance en retard jamais relancée.

## Hors périmètre

- L'envoi par Takussan d'un SMS ou d'un e-mail de relance (options b et c de la décision 13, écartées).
- La relance en lot (une conversation WhatsApp s'ouvre une à une).
- L'accusé de lecture : `wa.me` ne le rend pas, rien ne le mesure.
- L'écran (TCK-2660).

## Notes d'implémentation

**Prémisse re-mesurée (2026-11-11).** Aucune table, route ni modèle de relance n'existait. Les rappels
automatiques de `SendLeasePaymentReminders` ne laissent qu'une trace : `lease_payments.metadata.reminder_{jalon}_sent_at`
(`due_soon`, puis un par entrée de `SendLeasePaymentReminders::OVERDUE_DAYS`, aujourd'hui `overdue_1`,
`overdue_7`). La lecture les dérive de la constante du job (`LeasePaymentReminderReader::automaticKeys()`) :
un jalon ajouté là entre dans la lecture et dans `never_reminded_count` sans recopie.

**Écarts délibérés, à relire :**

- **Autorisation resserrée au personnel de l'agence du bail** : `LeasePaymentPolicy::remind` (nouvelle),
  et non `update`. `update` admet aussi le bailleur et le locataire (ils paient par le lien) ; la
  contrainte « échéance … de l'agence de l'appelant » et ADR-0105 (« l'agence note qu'elle a
  relancé ») les excluent. Un bail sans agence : refusé à tous sauf super-admin. Même règle pour
  le `GET`. Le `FormRequest` délègue à la policy (`authorize()`) : l'intrus reçoit 403 avant la
  validation.
- **409** `lease_payment.not_overdue`, comme le ticket (ADR-0105 écrit 422 pour « soldée ») : le
  corps est valide, c'est l'état de la ressource qui refuse. Refusées : payée, annulée, à venir,
  échue aujourd'hui, restitution de caution. La règle « en retard » est une seule classe,
  `App\Services\Reporting\OverdueInstalment` (statuts dus, hors `deposit_refund`, `due_date` avant
  aujourd'hui à Dakar), partagée par le `POST`, `days_late` de l'historique et le point du mois.
- **Le rappel J-3 (`due_soon`) compte comme relance automatique**, dans la lecture comme dans
  `never_reminded_count` : c'est un message réellement reçu par le locataire.
- Chaque entrée porte en plus `milestone` (`due_soon`, `overdue_1`, `overdue_7` ; `null` pour une
  relance notée) — un code, le front écrit le libellé. Le `POST` rend aussi `id`. À instant égal, la
  relance notée passe avant le rappel automatique.
- `include=reminders` sur l'historique : une ligne de réservation rend `last_reminder: null`,
  `reminders_count: 0` ; une requête par page (`LeasePaymentReminderReader::summaries`). Comme tout
  `include`, il déclenche aussi l'émission de `days_late` (TCK-2657).
- Journal d'audit de l'agence (`Auditable`, `AUDIT_ONLY`) : agence, échéance, canal, auteur — **la
  note n'y entre pas** (elle peut porter un numéro de téléphone, TCK-613).
- `never_reminded_count` : `COUNT(*) FILTER (WHERE …)` sur la requête des impayés, `NOT EXISTS` sur
  `lease_payment_reminders` et `jsonb_exists_any` sur `metadata` (l'opérateur `?|` serait lu par PDO
  comme un paramètre).

**Vérification par ablation** (11) : chaque garde retirée rougit son test — le 409, la policy
ramenée à `update` (locataire/bailleur), la policy ouverte (autre agence), la délégation du
`FormRequest` (403 avant 422), l'enum du canal, l'ordre de fusion, la lecture de `metadata`,
l'inclusion conditionnelle, les deux moitiés du SQL de `never_reminded_count`, l'exclusion de la
note du journal.
