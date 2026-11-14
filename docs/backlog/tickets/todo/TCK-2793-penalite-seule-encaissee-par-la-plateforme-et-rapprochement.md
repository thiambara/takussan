---
id: TCK-2793
title: "La pénalité seule payée en ligne : l'encaisser par l'intégration de la plateforme, et la rapprocher sur le relevé de l'agence"
status: todo
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2778]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#84-leasepaymentlink-"
tags: [back, paiements, penalite, comptabilite, rapprochement, reversement, suite-de-tck-2778]
---

## Objectif utilisateur

L'agence dont les paiements en ligne passent par la plateforme peut, elle aussi, envoyer un lien pour une pénalité
de retard restée due sur un loyer payé. Et une pénalité payée seule en ligne se retrouve, au centime, sur le relevé de
qui l'a reçue : le rapprochement bancaire de l'agence, ou le reversement de la plateforme.

## Contrat de données

**Décision.** Porteur, via team-lead, 2026-11-13, réponse 1a sur TCK-2778 : « le lien de pénalité seule n'existe
que si l'encaissement passe par l'intégration de l'agence […]. Le cas plateforme et le rapprochement de cette part
vont dans un ticket de suite (comptabilité). »

**Constat, relu sur l'arbre du 2026-11-13, après TCK-2778.**

- Le checkout de la pénalité seule est enregistré à part : `metadata.gateway.late_fee_checkout`, une entrée
  `subject: late_fee` de `metadata.gateway.transactions` (avec son `integration_id`), et à son succès
  `gateway.late_fee_settled_by` et `late_fee_paid_at`. Il ne touche ni `gateway.settled_by`, ni
  `gateway_expected_amount`, ni `transaction_id` : ce sont eux que lisent les lecteurs ci-dessous, qui décrivent
  donc toujours le règlement du LOYER (épinglé par `LienDePaiementPenaliteSeuleTest`).
- `PaymentGatewayService::lateFeeAloneProviders()` n'offre que les fournisseurs dont l'intégration résolue appartient
  à l'agence du bail. Sans elle, le lien rend 409 `payment.late_fee_not_collected_online`.
- Rien ne lit l'entrée `late_fee` pour l'argent :
  - `LeasePayment::expectedBankAmount()` / `scopeWhereExpectedAmountNear()` (rapprochement, TCK-715, TCK-833) ;
  - `PlatformPayoutService::isSettledByPlatform()`, `lateFeeSettledByPlatform()` et
    `HasPaymentAttributes::scopeWhereNotSettledByPlatform()` (qui détient l'argent) ;
  - `PayoutCalculator::lateFees()`, qui reverse la pénalité au mois de `late_fee_paid_at`, quel qu'en soit
    l'encaisseur ;
  - `ObservedRefundPayout`, `PayoutClawbacks`, `NotifyPartiesOfRentRefund`. TCK-2778 n'appelle pas ces trois-là pour
    un remboursement de la pénalité seule : il écrit seulement `late_fee_refund_amount`.
- Le dépôt de la pénalité seule sur le compte de l'agence (un versement Wave ou Orange Money distinct de celui du
  loyer) n'a donc aucun pendant attendu dans le rapprochement. Et `expectedBankAmount()` ajoute au loyer la pénalité
  réglée le même jour que lui (TCK-833), même quand elle a été payée en ligne à part.

## Direction UX / Artistique

Aucune.

## Contraintes strictes (métier)

- L'encaisseur de la pénalité seule se lit sur l'intégration de son entrée `late_fee`, jamais sur celle du loyer.
- Une pénalité seule encaissée par la plateforme entre dans le net du `PlatformPayout` de l'agence, au même titre
  qu'un loyer (ADR-0039). Rien ne la compte deux fois, ni ne la reverse avant qu'elle soit reçue.
- Le rapprochement de l'agence attend la pénalité seule encaissée par SON intégration comme une ligne à part, à son
  montant figé (`amount` de l'entrée), et ne l'ajoute plus au loyer.
- Un remboursement de la pénalité seule produit les mêmes effets comptables qu'un remboursement de loyer (constaté,
  reprise sur reversement, avis aux parties), à hauteur de la pénalité, sans toucher au loyer.
- Écrire l'ADR qui étend ADR-0039 avant l'implémentation, si la forme du reversement change.

## Delta à produire

- [x] ADR (ou amendement d'ADR-0039) : l'encaisseur et le rapprochement d'une pénalité payée seule — amendement du 2026-11-14 d'ADR-0039.
- [x] `lateFeeAloneProviders()` admet l'intégration globale, une fois les lecteurs ci-dessous prêts.
- [x] Rapprochement : la pénalité seule encaissée en ligne est un montant attendu distinct.
- [x] Reversement de la plateforme : la pénalité seule qu'elle a encaissée entre dans le net, une seule fois.
- [x] Remboursement de la pénalité seule : constaté, reprise et avis, à hauteur de la pénalité.

## Critères d'acceptation

- [x] AC1 — Une agence sans intégration propre, servie par une intégration globale, émet un lien de pénalité seule. Le
  webhook pose `late_fee_paid_at`, et la pénalité entre au net du `PlatformPayout` suivant, une seule fois.
  *Preuve : `tests/Feature/Payments/PenaliteSeuleComptabiliteTest.php`, `test_ac1_…_entre_une_fois_au_net`, `test_loyer_par_la_plateforme_et_penalite_par_l_agence`,
  `test_la_penalite_seule_attend_son_propre_reversement_de_la_plateforme`, `test_une_penalite_seule_rendue_avant_la_cloture_n_est_pas_prise`,
  `test_la_cloture_globale_la_prend_et_un_remboursement_bloque_l_approbation`.*
- [x] AC2 — Une pénalité seule encaissée par l'intégration de l'agence se rapproche d'une ligne de relevé à son montant.
  Le loyer garde son montant attendu.
  *Preuve : `tests/Feature/Payments/PenaliteSeuleComptabiliteTest.php`, `test_ac2_…_le_loyer_garde_son_montant`, `test_la_penalite_seule_de_la_plateforme_ne_se_rapproche_pas`,
  `test_la_confirmation_en_lot_rapproche_la_penalite_et_pas_le_loyer`.*
- [x] AC3 — Le remboursement de la pénalité seule crée un `Payout` constaté de la pénalité quand l'agence l'a encaissée,
  aucun quand la plateforme l'a encaissée, et ne touche jamais `status` ni `refund_amount` du loyer.
  *Preuve : `tests/Feature/Payments/PenaliteSeuleComptabiliteTest.php`, les trois tests `test_ac3_…` (constaté, aucun constaté + signal, reprise `late_fee`).*
- [x] AC4 — Chaque test ci-dessus est vérifié par ablation. *Preuve : 24 ablations, une à la fois, toutes rouges
  (clôture, encaisseur, une seule fois, net nul, annulation, clôture globale, approbation, commission, métriques,
  attente du reversement, montant PHP et SQL, TCK-1919 par part, lot, candidats du matcher, gardes plateforme du
  rapprochement, constaté agence et plateforme, reprise, signal, avis, repli global) ; fichiers restaurés au md5.*

## Hors périmètre

- Le lien et la relance de la pénalité seule eux-mêmes (TCK-2778).

## Notes d'implémentation

- **Schéma** (migration `2026_11_14_100000_add_late_fee_alone_accounting_to_lease_payments`, additive, `down()` juste) :
  `lease_payments.late_fee_platform_payout_id`, `late_fee_bank_reconciled_at`, `late_fee_bank_statement_line_id`
  (unique partiel), `bank_statement_lines.matched_part`. **À reporter dans `docs/models-spec.md` par `/sync-specs`.**
- **Encaisseur** : `LeasePayment::lateFeeAloneSettlement()` (et sa forme SQL `lateFeeAloneEntrySql()`) lit l'entrée de
  `gateway.late_fee_settled_by` ; `PlatformPayoutService::lateFeeAloneSettledByPlatform()`.
  `lateFeeSettledByPlatform()` garde le sens « réglée avec le loyer » ; `platformSettledLateFees()` (métriques) compte
  les deux.
- **Rapprochement** : type d'API `lease_payment_late_fee` (matcher, recherche, `match`, lot, levée, ressource), et +1
  valeur au type front `MatchedPaymentType` (badge, libellé fr/en/wo, champ `matched_part` demandé). La liste « reste à
  rapprocher » ne montre que les lignes proposées sur un loyer (`matched_part` nul).
- **Avis** : deux codes neufs, `lease_payment.late_fee_refunded` et `…_landlord` (textes fr/en/wo, API et front).
- **Reprise** : `PayoutClawbacks::recordRefund` ne compte plus que ses reprises `part = payment` dans le déjà-repris.
- Le texte du 409 `payment.late_fee_not_collected_online` ne parle plus du « propre compte de paiement » de l'agence.
