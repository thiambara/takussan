---
id: TCK-2778
title: "La pénalité de retard restée due sur une échéance payée : un lien de paiement pour elle seule, et une relance notée"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#84-leasepaymentlink-"
    - "docs/models-spec.md#125-leasepaymentreminder-"
tags: [back, front, paiements, penalite, relance, lien-de-paiement, suite-de-tck-2644, audit-ux, app]
---

## Objectif utilisateur

L'agent qui relance un locataire pour une pénalité de retard restée due, alors que le loyer est déjà payé, lui
envoie un lien qui ne fait payer que la pénalité, et la relance reste notée sur l'échéance comme toute autre.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 20 : « ticket API pénalité ». C'est l'option (c) de la décision
1 de TCK-2644, notée « ticket possible du porteur ».

**Constat, relu sur l'arbre du 2026-11-13.** Dans la démo, 35 des 65 baux « à traiter » le sont pour une pénalité
due sur un loyer déjà payé (relevé de TCK-2644). Pour ces lignes, l'API refuse les deux gestes de la relance :

- `POST /api/lease-payments/{payment}/payment-link` rend 409 `payment.not_payable`.
  `PaymentGatewayService::isPayable()` exclut le statut `paid`.
- `POST /api/lease-payments/{payment}/reminders` rend 409 `lease_payment.not_overdue`.
  `OverdueInstalment::daysLate()` ne retient que les statuts dus (`CollectedPayments::OWED_STATUSES`).
- La pénalité restée due se lit pourtant : `LeasePayment::lateFeeOutstanding()` rend `late_fee_amount` tant que
  `late_fee_paid_at` est nul, hors échéance annulée, remboursée ou caution rendue.
- Le paiement en ligne sait déjà encaisser la pénalité, mais seulement avec le loyer :
  - `PaymentGatewayService::lateFeeIncluded()` l'ajoute au montant quand l'agence encaisse ses pénalités en ligne
    (`Agency::collectsLateFeesOnline()`) ;
  - le webhook pose `late_fee_paid_at` quand `late_fee_included` a été figé à l'initiation.
- Aujourd'hui, côté front, « Relancer » mène à l'échéancier de la fiche du bail, où l'on clique « Marquer la
  pénalité réglée » (TCK-2644, décision 1 b). Aucune trace de la relance ne reste.

**Endpoints touchés (existants) :** `POST|DELETE /api/lease-payments/{payment}/payment-link`,
`GET|POST /api/lease-payments/{payment}/reminders`, la page publique de paiement par lien, et le webhook de
paiement.

## Direction UX / Artistique

Côté front, seul change le geste « Relancer » d'une ligne `late_fee_unpaid` dans « Baux à traiter », dans
« Impayés » et sur l'accueil. Il reprend la feuille de relance de TCK-2660, comme pour un loyer. Le message dit
« pénalité de retard » et son montant, jamais « loyer ». La page publique du lien dit ce qu'elle fait payer : la
pénalité de retard de tel mois, et non le loyer.

## Contraintes strictes (métier)

- **Le lien ne fait payer que la pénalité.** Le montant est `lateFeeOutstanding()`, jamais le loyer. Il est figé à
  l'initiation, comme `late_fee_included` aujourd'hui. Un paiement réussi pose `late_fee_paid_at`, ne touche ni à
  `status` ni à `paid_at` de l'échéance, et ne crée pas de second encaissement du loyer.
- **Montant ×100 à la frontière du driver**, re-divisé par le driver local (principe 3 de CLAUDE.md), comme pour
  tout payable.
- **Une agence qui n'encaisse pas ses pénalités en ligne** (`collectsLateFeesOnline() === false`) ne crée pas de
  lien de pénalité : 409 `payment.late_fee_not_collected_online`. La relance notée reste permise : un message
  sans lien.
- **La relance notée** est admise sur une échéance payée dont la pénalité reste due. Elle porte un champ qui dit ce
  qu'elle relance (`subject` : `rent` | `late_fee`). L'historique de l'échéance (`GET …/reminders`) la rend, et
  « Dernière relance » de « Impayés » la lit.
- **Une échéance sans rien de dû** (payée, pénalité réglée ou nulle) garde ses 409. Une échéance due garde le
  comportement d'aujourd'hui : loyer et pénalité ensemble. On ne crée pas de lien « pénalité seule » sur une
  échéance dont le loyer est encore dû.
- **Autorisation** inchangée : les mêmes capacités que le lien et la relance d'un loyer, dans la même agence.
- Un lien de pénalité déjà ouvert est rendu tel quel (idempotent), comme un lien de loyer. Il devient caduc dès que
  `late_fee_paid_at` est posé, par le webhook ou par « Marquer la pénalité réglée ».

## Delta à produire

- [ ] Migration `add_subject_to_lease_payment_links_and_reminders` : `subject` (string 16, défaut `rent`) sur
  `lease_payment_links` et `lease_payment_reminders`, sans `enum()` SQL (ADR-0007). `down()` retire les deux
  colonnes.
- [ ] Enum `App\Models\Enums\PaymentLinkSubject` (`rent`, `late_fee`).
- [ ] `LeasePaymentLinkService` : le sujet se déduit de l'échéance (loyer dû → `rent` ; payée avec pénalité due
  → `late_fee`). `isPayableByNature` et le contrôleur l'admettent.
- [ ] `PaymentGatewayService` : un payable « pénalité seule », dont le montant est `lateFeeOutstanding()`, et dont
  le webhook pose `late_fee_paid_at` seul. Le doublon de paiement est signalé comme aujourd'hui (`kind:
  late_fee`).
- [ ] `LeasePaymentReminderController::store` : admis quand `OverdueInstalment::daysLate()` est nul et
  `lateFeeOutstanding() > 0`, avec `subject = late_fee`. Sinon, 409 `lease_payment.not_overdue` inchangé.
- [ ] `LeasePaymentResource` : `late_fee_reminder_allowed` et `late_fee_link_allowed`, qui servent au front de
  verdicts.
- [ ] Front : « Relancer » sur une ligne `late_fee_unpaid` ouvre la feuille de relance avec le message de la
  pénalité. La clé `lease.liste.relance.message.penalite`, retirée par TCK-2644, revient sous ce nom ou un autre.
  La page publique du lien dit « pénalité de retard ».
- [ ] Tests : `LienDePaiementPenaliteSeuleTest` (création, montant, webhook, échéance intacte, agence sans
  encaissement en ligne, idempotence, caducité) et `RelancePenaliteSeuleTest` (notée, listée, 409 hors cas).

## Critères d'acceptation

- [ ] AC1 — Sur une échéance `paid` dont `late_fee_amount = 5 000` et `late_fee_paid_at` est nul, avec une agence
  qui encaisse ses pénalités en ligne : `POST …/payment-link` rend 201. Le paiement initié par ce lien porte
  5 000, et non le loyer plus 5 000.
- [ ] AC2 — Le webhook de succès de ce paiement pose `late_fee_paid_at`. Après lui, `status`, `paid_at` et
  `amount` de l'échéance sont identiques à leurs valeurs d'avant, et aucune deuxième ligne d'encaissement du loyer
  n'existe.
- [ ] AC3 — La même échéance, dans une agence qui n'encaisse pas ses pénalités en ligne : `POST …/payment-link`
  rend 409 `payment.late_fee_not_collected_online`, et `POST …/reminders` rend 201.
- [ ] AC4 — `POST …/reminders` sur la même échéance rend 201 avec `subject = late_fee`, et `GET …/reminders` la
  rend.
- [ ] AC5 — Une échéance payée dont la pénalité est réglée ou nulle rend 409 aux deux routes, comme aujourd'hui.
- [ ] AC6 — Une échéance due (`overdue`) avec pénalité garde son lien de loyer, pénalité comprise (`subject =
  rent`) : un test qui l'épingle reste vert.
- [ ] AC7 — « Marquer la pénalité réglée » rend caduc un lien de pénalité ouvert : la page publique ne propose plus
  de payer.
- [ ] AC8 — Front : depuis « Baux à traiter », « Relancer » sur une ligne `late_fee_unpaid` ouvre la feuille de
  relance, dont le message dit la pénalité et son montant. « Ouvrir WhatsApp » crée le lien et note la relance, et
  la ligne affiche ensuite « Dernière relance ».
- [ ] AC9 — Chaque test API ci-dessus est vérifié par ablation. Par exemple, un montant égal au loyer plus la
  pénalité doit rendre AC1 rouge, et un webhook qui pose `paid_at` doit rendre AC2 rouge.

## Hors périmètre

- La relance automatique (`SendOverdueRemindersJob`) des pénalités seules : elle reste celle d'aujourd'hui.
- La relance en lot (TCK-2682) et la relance hors de l'espace admin (TCK-2758) : elles hériteront du sujet
  `late_fee` sans changer ici.
- Le montant réellement payé au checkout (« dont pénalité de retard », liste du soir n° 6, TCK-2650).

## Notes d'implémentation

_(à remplir par implementing-specs)_
