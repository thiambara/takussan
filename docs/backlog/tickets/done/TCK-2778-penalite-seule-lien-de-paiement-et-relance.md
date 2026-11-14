---
id: TCK-2778
title: "La pénalité de retard restée due sur une échéance payée : un lien de paiement pour elle seule, et une relance notée"
status: done
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
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
  (amendé le 2026-11-13, décision 1a) Il en va de même quand aucun fournisseur ne l'encaisserait sur une intégration
  DE L'AGENCE : le repli sur l'intégration globale de la plateforme n'est pas proposé pour la pénalité seule. Le cas
  plateforme et le rapprochement de cette part sont l'objet de TCK-2793.
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
- [x] Front : « Relancer » sur une ligne `late_fee_unpaid` ouvre la feuille de relance avec le message de la
  pénalité. La clé `lease.liste.relance.message.penalite`, retirée par TCK-2644, revient sous ce nom ou un autre.
  La page publique du lien dit « pénalité de retard ».
- [ ] Tests : `LienDePaiementPenaliteSeuleTest` (création, montant, webhook, échéance intacte, agence sans
  encaissement en ligne, idempotence, caducité) et `RelancePenaliteSeuleTest` (notée, listée, 409 hors cas).

## Critères d'acceptation

- [ ] AC1 — Sur une échéance `paid` dont `late_fee_amount = 5 000` et `late_fee_paid_at` est nul, avec une agence
  qui encaisse ses pénalités en ligne : `POST …/payment-link` rend 200, la même forme que le lien de loyer, avec
  `subject: late_fee` (amendé le 2026-11-13 : 201 → 200, décision 3 de team-lead). Le paiement initié par ce lien
  porte 5 000, et non le loyer plus 5 000.
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
- [x] AC8 — Front : depuis « Baux à traiter », « Relancer » sur une ligne `late_fee_unpaid` ouvre la feuille de
  relance, dont le message dit la pénalité et son montant. « Ouvrir WhatsApp » crée le lien et note la relance, et
  la feuille, rouverte, affiche « Dernière relance ». (amendé le 2026-11-13, décision 1 a de team-lead : aucune carte
  de « Baux à traiter » n'affiche de dernière relance, loyer compris ; seule la feuille rouverte la montre.)
  Preuve : `liste-des-baux.tck-2644.test.tsx`, cas TCK-2778 « AC8 — lien permis » (en-tête et message de la
  pénalité, `POST …/601/payment-link`, `POST …/601/reminders {channel: whatsapp}`, « Dernière relance le 3 nov. »
  lue sur la ligne d'historique relue à l'ouverture).
- [ ] AC9 — Chaque test API ci-dessus est vérifié par ablation. Par exemple, un montant égal au loyer plus la
  pénalité doit rendre AC1 rouge, et un webhook qui pose `paid_at` doit rendre AC2 rouge.

## Hors périmètre

- La relance automatique (`SendOverdueRemindersJob`) des pénalités seules : elle reste celle d'aujourd'hui.
- La relance en lot (TCK-2682) et la relance hors de l'espace admin (TCK-2758) : elles hériteront du sujet
  `late_fee` sans changer ici.
- Le montant réellement payé au checkout (« dont pénalité de retard », liste du soir n° 6, TCK-2650).

## Notes d'implémentation

### 2026-11-13 — back-4, l'API (lot 2)

**Fait (API seule ; le front — feuille « Relancer » d'une ligne `late_fee_unpaid`, clé de message, page publique — n'est pas fait).**

- Migration `2026_11_13_200000_add_subject_to_lease_payment_links_and_reminders` : `subject` (string 16, défaut `rent`) sur les deux tables, `down()` retire les deux colonnes. Enum `PaymentLinkSubject` (`rent`, `late_fee`).
- `LeasePayment::lateFeeAloneOutstanding()` : loyer `paid` et `lateFeeOutstanding() > 0` — la seule règle de « pénalité seule », lue par la relance, le lien, la ressource et la passerelle.
- Relance notée : le sujet se déduit de l'échéance (`rent` si `OverdueInstalment::daysLate()`, `late_fee` si `lateFeeAloneOutstanding()`, sinon 409 `lease_payment.not_overdue`), jamais du corps. `subject` est fillable, casté, dans `AUDIT_ONLY`, rendu par `GET …/reminders` et par `last_reminder` de `include=reminders` (« Dernière relance ») ; un rappel automatique vaut `rent`.
- Lien : `LeasePaymentLinkService::subjectFor()` ; le contrôleur passe le sujet, rejugé sous le verrou de l'échéance. Sans sujet (quittance, relance automatique), le lien du loyer comme avant. Un lien actif d'un autre sujet est révoqué et remplacé, jamais réaffecté (le SMS du loyer déjà envoyé rend 410). Une agence qui n'encaisse pas ses pénalités en ligne, ou dont aucun fournisseur ne les encaisserait sur une intégration DE L'AGENCE (décision 1a : jamais le repli global ; `lateFeeAloneProviders()`), reçoit 409 `payment.late_fee_not_collected_online` (fr/en/wo, wo = fr). La réponse reste 200 (décision 3) et porte `subject`.
- `effectiveExpiry` : un lien `late_fee` compte ses 30 jours de lecture depuis `late_fee_paid_at`, pas depuis le paiement du loyer (sinon caduc à la naissance sur un loyer payé il y a plus de 30 jours).
- Passerelle : trait `LateFeeAloneCheckout` (utilisé par `PaymentGatewayService`). Le checkout de la pénalité seule ne touche à AUCUN champ du règlement du loyer (`transaction_id`, `payment_method`, `gateway_expected_amount`, `late_fee_included`, `gateway.settled_by|provider|transaction_id|checkout_url`) : il vit dans `gateway.late_fee_checkout` et dans une entrée `subject: late_fee` de `gateway.transactions` (le webhook retrouve l'échéance par cet historique). Montant = `lateFeeOutstanding()` arrondi, figé, ×100 au pilote. Succès : `late_fee_paid_at`, `late_fee_payment_method`, `gateway.late_fee_settled_by` ; rejeu sans effet ; pénalité déjà réglée ou plus due → doublon `kind: late_fee` signalé. Échec : sur son seul checkout. Remboursement : `late_fee_refund_amount`, jamais `status` ni `refund_amount` du loyer (le repli de `isSettledBy` sur `gateway_events` l'aurait pris pour le règlement du loyer). `applyStatusToPayment` aiguille l'événement vers ce chemin avant toute autre règle.
- Refactor mécanique du service, sans changement de comportement (suites voisines vertes) : `initiateWith`, `usableIntegration`, `reserve`, `verifyTransaction`, `liveCheckout` extraits.
- « Marquer la pénalité réglée » (`LateFeeSettlement`) refuse aussi un checkout ouvert de la pénalité seule (409 `payment.checkout_in_progress`), sauf passage outre, qui l'écarte (`superseded_at`).
- Page publique : `subject`, `late_fee_paid_at` ; pour un lien `late_fee`, `amount_due`, `providers`, `late_fee_payable_online`, l'initiation et la vérification sont ceux de la pénalité seule. Pénalité réglée (webhook ou agence) : `amount_due` 0, aucun fournisseur, 200 (AC7).
- `LeasePaymentResource` : `late_fee_reminder_allowed`, `late_fee_link_allowed` (`LeasePaymentResourceContractTest` amendé).
- `PaymentGatewayController::penaliteDuCheckout` (TCK-2650) : le repli sur la dernière entrée saute les entrées `late_fee`.
- `isSettledBy` écarte explicitement une transaction `late_fee`, même si son `paid` est journalisé dans `gateway_events`.

**Décisions de team-lead, 2026-11-13 :** 1a (intégration de l'agence seule ; le cas de la plateforme et le rapprochement de cette part vont dans **TCK-2793**, sous todo/), 2a (le lien du loyer est révoqué : son ancien SMS rend 410, testé), 3 (200 gardé, AC1 amendé), 4 (migrate local ci-dessous).

**Tests.** `LienDePaiementPenaliteSeuleTest` (16) et `RelancePenaliteSeuleTest` (5) : 21 verts. Amendés : `LeasePaymentResourceContractTest` (deux clés), `LeasePaymentReminderTest` (ordre des clés d'une entrée : `subject`). Voisins verts : 198 + 178 + 143 (paiements, liens, webhooks, remboursements, rapprochement, reversements, relances automatiques, gardes de langue `LangGroupParityTest`, `ApiErrorCodeTest`). Les épingles demandées : le remboursement de la pénalité ne touche ni `status` ni `refund_amount` du loyer ; `isSettledBy`, `expectedBankAmount` / `whereExpectedAmountNear`, `isSettledByPlatform` / `whereNotSettledByPlatform` lisent toujours le règlement du loyer (ici un loyer encaissé par la plateforme, une pénalité par l'agence).

**Ablations : 20 sur 20 rouges**, une à la fois, restaurées au md5 (montant = loyer + pénalité → AC1 rouge ; webhook qui pose `paid_at` → AC2 rouge ; remboursement imputé au loyer ; aiguillage de `applyStatusToPayment` retiré ; `transaction_id` du loyer écrasé ; plafond de 30 jours depuis le paiement du loyer ; agence hors ligne admise ; relance sur toute échéance payée ; fournisseurs toujours proposés après règlement ; `subject` absent de « Dernière relance » ; garde du checkout ouvert retirée de « Marquer la pénalité réglée » ; lien du loyer réaffecté ; verdict du lien sans le réglage ; repli de `penaliteDuCheckout` sur l'entrée `late_fee` ; vérification sur le checkout du loyer ; doublon non signalé ; repli global proposé ; `isSettledBy` sans garde ; la pénalité qui pose `settled_by` ; l'initiation qui accepte le fournisseur global). Une première version du test 1a se trompait d'identifiants Orange Money et laissait vert le dernier mutant : corrigé, avec un témoin (`availableProviders` contient bien Orange Money), puis le mutant rejoué rouge.

**Base de démo locale (décision 4).** Migration purement additive. `migrate --path=…` : `subject` présent sur les deux tables, les 34 liens existants valent `rent`. `migrate:rollback --path=…` : les deux colonnes retirées, 34 lignes intactes. `migrate --path=…` : de nouveau présentes (lot 18). Aucun `migrate:fresh`.

**Reste.** Le front (feuille « Relancer » d'une ligne `late_fee_unpaid` à partir de `late_fee_reminder_allowed` et `late_fee_link_allowed`, la clé de message de la pénalité, la page publique qui dit « pénalité de retard » à partir de `subject`) : AC8 ouvert. `/sync-specs` après fusion : `subject` sur `LeasePaymentLink` et `LeasePaymentReminder` (models-spec §84, §125), et le lien de pénalité seule (features §15).

### 2026-11-13 — front (AC8), lot 2

**Fait.**

- « Baux à traiter » : « Relancer » d'une ligne `late_fee_unpaid` (`GesteDuBail`, carte et rangée) ouvre la feuille de TCK-2660. L'échéance vient de l'échéancier du bail (`GET /api/leases/{id}/payments`), dont `LeasePaymentResource` porte les deux verdicts, ajoutés à `LEASE_PAYMENT_FIELDS` et au type `LeasePayment`. On prend l'échéance `late_fee_reminder_allowed` de `attention.due_date`, à défaut la plus ancienne. Sa ligne d'historique (payeur, langue, bien, « Dernière relance ») se lit ensuite, bornée au jour du règlement (`filter[paid_from|paid_to]`). Le lien vers l'échéancier (décision 1 b de TCK-2644) est retiré.
- `useRelanceDUnImpaye(row, actif, { penalite: { lienPermis } })`. Le message dit la pénalité et son montant (`late_fee_outstanding`), jamais le loyer : clés `lease.liste.relance.message.penalite` et `penaliteSansLien`, composées par `composerLaRelanceAction({ sujet: 'penalite', sansLien })` dans la langue du locataire. Si `late_fee_link_allowed` est faux, ou sur un 409 `payment.late_fee_not_collected_online` à l'envoi, la relance part sans lien ni repère : l'écran le dit en clair, aucun `POST …/payment-link`, et la relance est notée. Un autre 409 garde « Cette échéance ne se paie plus en ligne » : rien ne part. Sans numéro : « Copier le lien de paiement » si le lien est permis, sinon un toast qui dit pourquoi.
- La feuille : en-tête « {montant} · Pénalité de retard · {période} » au lieu du retard du loyer, « Lien de paiement de la pénalité ».
- La page publique `/pay/{jeton}` : un lien `subject: late_fee` passe AVANT la branche « réglée » (son loyer est `paid`). Elle a pour titre « Pénalité de retard », l'échéance en dessous, `amount_due` tel quel et sans décomposition, et « Le loyer de cette échéance est déjà réglé ». Trois états : à payer en ligne, à régler à l'agence (aucun fournisseur), ou réglée (`late_fee_paid_at`, AC7). `PayLink` et `PayLinkVerification` gagnent `subject` et `late_fee_paid_at`.

**Tests.**

- `liste-des-baux.tck-2644.test.tsx` : le cas « échéancier » est remplacé par cinq cas TCK-2778 : lien permis, lien non permis, 409 hors ligne puis renvoi, autre 409, bureau. Total : 26 verts.
- `PayLinkReception.test.tsx` : 4 cas. `relance-penalite.tck-2778.test.ts` : 5 cas. Les voisins `admin/finances/impayes`, `AFaireAdmin`, `FicheDuBien` et `relance.tck-2660` restent verts.
- Ablations : 6 sur 6 rouges, restaurées au md5. Le verdict du lien a été ignoré, le code du 409 ignoré, le 409 hors ligne non traité, la branche `late_fee` de la page retirée, le montant du message pris sur le loyer, l'état « réglée » sans `late_fee_paid_at`.

**Écart.** AC8 « la ligne affiche ensuite « Dernière relance » » : la carte de « Baux à traiter » n'affiche de dernière relance pour aucun motif (le loyer non plus). La feuille, rouverte, la lit sur la ligne d'historique relue. Décision 1 a de team-lead (2026-11-13) : AC8 amendé, coché.

- 2026-11-14 — passé done : AC tenus au HEAD (bc10595a6, 46222c58a ; passe de clôture) ; décisions au (intégration de l'agence ; cas plateforme : TCK-2793) et av (ancien lien révoqué et remplacé) confirmées par le porteur le 2026-11-14.
