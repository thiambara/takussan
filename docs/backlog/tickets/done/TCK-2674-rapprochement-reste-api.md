---
id: TCK-2674
title: "Rapprochement, côté API : ce qui est déjà confirmé, et le reste à rapprocher paiement par paiement"
status: done
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2675]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
    - "docs/models-spec.md#41-bankstatementline-"
    - "docs/models-spec.md#15-leasepayment-"
tags: [back, finances, reconciliation, audit-ux, app]
---

## Objectif utilisateur

L'admin voit que la plupart de ses encaissements sont déjà confirmés par Wave et Orange Money, et ne rapproche à la main que les espèces et les virements qui restent.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- Rapprochement par relevé (`routes/api/accounting.php`) : import CSV / OFX, mapping, liste, détail, lignes, `match` (POST / DELETE), `ignore`, `finalize`, `payment-search`. La suggestion vit **sur la ligne** (`match_status = suggested`, `matched_payment_type/id`, `match_confidence`).
- Côté paiement : `bank_reconciled_at`, `bank_statement_line_id` (bail, réservation, facture, reversement) ; `LeasePayment::scopeWhereNotReconciled`, `scopeAwaitingBankCredit` (non rapproché et non réglé par la plateforme). La confirmation par une passerelle se lit dans `metadata.gateway.settled_by` (identifiant de transaction, ou `manual`) et `metadata.gateway.provider` ; `payment_method` distingue `cash`, `bank_transfer`, `wave`, `orange_money`…
- **Aucune route** ne compte « confirmés automatiquement » ni ne liste « paiements déclarés à rapprocher » avec leur ligne proposée. **Aucune confirmation groupée**. Aucune recherche de ligne de relevé à l'échelle de l'agence.
- Préréglages Wave Business / Orange Money : absents, par décision (dette D-67).

## Contraintes strictes (métier)

- Capacité `payments.reconcile` (rôle système d'admin, jamais d'agent), comme tout le rapprochement.
- « Confirmé automatiquement » = paiement payé dans la période et réglé par une passerelle (`settled_by` différent de `manual`). « À rapprocher » = paiement payé dans la période, réglé à la main (`marked_paid_at` posé ou `settled_by = manual`) et non rapproché (`bank_reconciled_at` nul). Règle neuve : `spec-delta.md`.
- La confirmation groupée réutilise exactement le geste unitaire `match` (mêmes effets sur la ligne, le paiement et le statut du relevé), dans une transaction ; elle n'accepte que des lignes `suggested` de l'agence.
- Les débits et les reversements gardent leur rapprochement sur le détail d'un relevé : rien n'est retiré.

## Delta à produire

- [x] `GET /api/agencies/{agency}/reconciliation/overview?period=YYYY-MM` → `ReconciliationOverviewController` : `payments_total`, `confirmed_automatically {total, by_provider{}}`, `to_reconcile {total, by_method{}}`, `reconciled_manually`.
- [x] `GET /api/agencies/{agency}/reconciliation/pending-payments?period=&filter[payment_method]=cash,bank_transfer&filter[has_suggestion]=1` → paiements à rapprocher (type, id, référence, payeur, bien, montant, `paid_at`, moyen) et `suggested_line {id, statement_id, date, label, amount, confidence} | null` ; tri `-amount`.
- [x] `GET /api/agencies/{agency}/bank-statement-lines?filter[match_status]=unmatched&filter[amount]=&filter[date_from]=&filter[date_to]=` (recherche d'une ligne pour un paiement donné).
- [x] `POST /api/agencies/{agency}/bank-statement-lines/confirm-batch` (`line_ids[]` ≤ 200) → `BankStatementLineController::confirmBatch`.
- [x] Tests : `ReconciliationOverviewTest`, `ReconciliationPendingPaymentsTest`, `BankStatementLinesSearchTest`, `BankStatementLinesConfirmBatchTest`.

## Critères d'acceptation

- [x] AC1 — Sur une fixture de novembre (540 paiements Wave réglés par webhook, 272 Orange Money, 21 espèces et 13 virements marqués payés), `overview` rend `confirmed_automatically.total = 812`, `by_provider = {wave: 540, orange_money: 272}`, `to_reconcile.total = 34`.
- [x] AC2 — Un paiement en espèces avec une ligne `suggested` à 96 % sort avec `suggested_line.confidence = 96` ; confirmé, il quitte `pending-payments` et `to_reconcile` baisse de 1.
- [x] AC3 — `confirm-batch` avec une ligne `unmatched` dans le lot → 422 et aucune ligne confirmée (relu en base).
- [x] AC4 — Un agent reçoit 403 sur les quatre routes ; une autre agence ne voit aucune de ces lignes.

## Hors périmètre

- L'import guidé avec aperçu des colonnes (approche A, non retenue).
- Les préréglages de banques (D-67).
- L'écran (TCK-2675).

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-agence, lot audit UX /app). Prémisse re-mesurée : aucune route ne comptait ni ne listait par paiement, aucune confirmation groupée, aucune recherche de ligne à l'échelle de l'agence — conforme.

**Deux décisions prises par la session le 2026-11-11 (à relire par le porteur)** :

1. **« À rapprocher » = payé dans le mois, NON réglé par une passerelle, non rapproché** (option b), et non « réglé à la main (`marked_paid_at` ou `settled_by = manual`) » comme écrit plus haut. Mesuré sur la base de démo : les 1 479 échéances payées n'ont ni `metadata.gateway` ni `marked_paid_at`, et un acompte de réservation saisi par le personnel (`BookingPaymentService`) ne porte jamais `settled_by = manual` : la règle littérale laissait tout hors des deux classes. Un paiement sans trace de passerelle n'a été confirmé par rien : il est à rapprocher. L'AC1 tient sous les deux règles.
2. **Les factures sont hors de la vue par paiement** : `invoices` n'a pas de date de paiement (`paid_at`), « payé dans la période » ne s'y lit pas. Elles restent rapprochables depuis le détail d'un relevé, comme les reversements (rien n'est retiré). Suivi possible : une colonne `invoices.paid_at`.

- **Une règle, un endroit** — `App\Services\Accounting\ReconciliationOverviewService::paidInPeriod()` classe chaque encaissement payé du mois (`status = paid`, `paid_at` dans `[1er du mois, 1er du suivant)`, échéances de bail hors cautions rendues, acomptes de réservation, agence du bail ou de la réservation) en UNE colonne SQL `bucket` : `confirmed_automatically` (réglé par passerelle), sinon `reconciled_manually` (`bank_reconciled_at` posé), sinon `to_reconcile`. La synthèse groupe sur cette colonne, la liste filtre sur elle ; un test épingle « compte de la synthèse = total de la liste ».
- **« Réglé par passerelle »** se lit sur UN champ, `metadata.gateway.settled_by` : une chaîne non vide différente de `manual` (`PaymentGatewayService::SETTLED_MANUALLY`) — absent, nul ou vide ne compte pas. Le **fournisseur** est celui de la transaction qui a soldé (l'entrée de `gateway.transactions` dont `transaction_id = settled_by`), à défaut `gateway.provider`, à défaut le moyen de paiement : un checkout Wave ouvert APRÈS un règlement Orange Money réécrit `gateway.provider`, pas l'argent reçu. Un test passe par le vrai chemin (initiation + webhook Wave signé, puis `mark-paid` en espèces).
- **`overview`** : comptes (pas de montants), `by_provider` / `by_method` toujours des objets JSON, `{}` à vide. `period` vaut le mois courant à défaut.
- **`pending-payments`** : tri `-amount` (puis type, id), `per_page` ≤ 100, `filter[payment_method]` en liste à virgules (valeurs de `PaymentMethod`), `filter[has_suggestion]=1|0`. `suggested_line` et `has_suggestion` lisent UNE définition (`suggestedLines()`) : une ligne `suggested`, au crédit, d'un relevé OUVERT de l'agence (`ready_for_review` ou `partially_reconciled`), de la devise du paiement — celle que `match` accepte. Plusieurs lignes proposant le même paiement : la plus haute confiance, puis la plus ancienne.
- **`GET /api/agencies/{agency}/bank-statement-lines`** : seules les lignes des relevés ouverts de l'agence (celles qu'on peut encore confirmer) ; `filter[amount]` au franc près (la tolérance de `payment-search`), dates comptables bornes comprises, `filter[direction]` en plus, tri `-posted_at` par défaut.
- **`confirm-batch`** — `ReconciliationManager::confirmSuggestedBatch()` : une transaction, les lignes verrouillées dans l'ordre des identifiants, toutes vérifiées (connues, de l'agence, relevé ouvert, `suggested` avec un paiement) avant la première confirmation, puis chacune confirmée par `confirmMatch()` lui-même (mêmes gardes, mêmes effets, même journal `matched`). Une ligne libérée par la confirmation d'une précédente du lot (deux lignes sur le même paiement, TCK-1919) ou un refus du geste unitaire → tout est annulé. Code 422 `reconciliation.batch_not_confirmable` (fr/en/wo). ⚠ Le geste unitaire ne change pas le statut du relevé (c'est `finalize` qui le fait) : « mêmes effets sur le statut du relevé » = aucun.
- Autorisation des quatre routes : `BankStatementPolicy::viewAny` (admin de l'agence avec `payments.reconcile`, ou admin principal), jugée dans les FormRequest avant la validation. Pas de 2FA : le geste unitaire n'en exige pas.
- Démo (agence 1, octobre 2026) : `payments_total` 82, `confirmed_automatically` 0, `to_reconcile` 82 (wave 41, orange_money 18, bank_transfer 12, cash 8, free_money 3) — la démo ne sème aucun règlement par passerelle.
- À reporter par `/sync-specs` : la règle des trois classes et des deux décisions ci-dessus (`spec-delta`), les quatre routes.

**Reprise du 2026-11-11 (après le plantage de la machine)** — le code était dans l'arbre, complet ; rien n'a été réécrit. Re-mesuré :

- Les quatre classes (`tests/Feature/Accounting/{ReconciliationOverview,ReconciliationPendingPayments,BankStatementLinesSearch,BankStatementLinesConfirmBatch}Test.php`) : **31 tests verts, 153 assertions** (12 à 15 s), rejouées après les ablations et le correctif ci-dessous. Le temps est figé au 2026-11-20 par `RapprochementFixture` : « sans période, le mois courant » ne dépend pas du jour où la CI tourne.
- Gardes : `RessourceUniqueResolueTest`, `ExistsSurTableASuppressionDouceTest`, `AgencyIdIsIndexedTest` verts (8 tests) ; `LangGroupParityTest` vert (hors de la règle de charge stricte : test unitaire d'une seconde, sur un fichier de langue touché) (le code `reconciliation.batch_not_confirmable` en fr/en/wo) ; `DateInventoryByValueTest --filter=test_le_registre_suit_encore_l_arborescence_des_ressources` vert (la ressource neuve est inscrite au registre ; même remarque). `pint --test` et `php -l` propres sur les 19 fichiers PHP. Le balayage des dates lui-même, `ImpersonationReadSweepTest` et `ValeursEnListeParcoursDesRoutesTest` (routes neuves) : **la CI de la PR** (règle de charge) — mais LUS : le balayage des valeurs en liste relève les noms de filtres dans la source de l'action (`$filter['date_from']`…), et a conduit au correctif suivant ; celui de l'impersonation ne cherche que des secrets durables et des pièces d'identité, que les quatre routes ne rendent pas (payeur par son nom, bien par son titre).
- Gardes racine : `check-pagination-envelope` **vert** (le `->perPage()` de `ReconciliationOverviewController` n'y est plus : la page passe par `$this->paginated()`). Rouges : les cinq gardes des maquettes locales, et `check-design-sync-entry` (`panneau-droit.tsx`, `radio-group.tsx` : primitives front d'un autre ticket).
- **Ablations** (une à une, au premier plan, fichier restauré par `cp`, md5 vérifié) : (1) la liste filtre « non confirmé automatiquement » au lieu de la classe `to_reconcile` partagée → `test_le_compte_de_la_synthese_est_le_total_de_la_liste` rouge sur sa première assertion (`assertSame(8, $listed)` : 9 listés) ; (1b) la synthèse ne compte plus « rapproché à la main » à part (le versant du compte) → la même méthode rouge sur l'assertion de PARITÉ elle-même (4 assertions jouées, 9 comptés pour 8 listés) ; (2) `gatewaySettledSql` sans l'exclusion de `manual` → `test_ac1_…` rouge ; (3) `confirmSuggestedBatch` hors de `DB::transaction` → `test_un_refus_du_geste_unitaire_en_fin_de_lot_annule_tout` rouge (1 ligne confirmée au lieu de 0) ; (4) le fournisseur lu sur `gateway.provider` seul → `test_le_fournisseur_est_celui_de_la_transaction_qui_a_solde` rouge ; (5) `ReconciliationOverviewRequest::authorize()` à `true` → les deux `test_ac4_…` (synthèse et liste) rouges, 200 au lieu de 403.
- **Correctif de la reprise — un 500 sur une valeur en liste** (ADR-0075 § 3) : `filter[date_from][]=…&filter[date_to]=2026-11-30` sur `GET …/bank-statement-lines` levait `TypeError: DateTime::createFromFormat(): Argument #2 must be of type string, array given` (`after_or_equal` lit la borne de départ telle quelle). Rouge d'abord (`test_des_filtres_mal_formes_rendent_422`, 500 au lieu de 422), puis `SearchBankStatementLinesRequest` ne déclare la comparaison que si `date_from` est une chaîne. Le balayage de la CI n'envoie qu'un filtre à la fois : il ne l'aurait pas vu. Assertions de même forme ajoutées sur `pending-payments` (`filter[payment_method][]`, `filter[has_suggestion][]`, `period[]` → 422, vertes sans correctif).
- Relu : `confirm-batch` n'est pas plus large que `match` — même `BankStatementPolicy::viewAny` sur l'agence, et des relevés `ready_for_review` / `partially_reconciled` seulement, plus étroit que le `! isClosed()` de `BankStatementLinePolicy::match` (qui laisse `processing`). Le matcher (`MatchBankStatementLinesJob`) écrit `matched_payment_type` en nom de classe, comme la fixture, et le dépôt n'a pas de `morphMap` : la comparaison de `suggestedLines()` au nom de classe vaut en production.
- L'AC3 a deux gardes : la vérification de tout le lot avant la première confirmation, et la transaction. Par lecture (non mesuré par ablation), chacune suffit seule à tenir le test : défense en profondeur.
- Écart résiduel, laissé tel quel : `LeasePayment::scopeWhereExpectedAmountNear` / `expectedAmount()` tiennent `settled_by = ''` pour un règlement en ligne, la synthèse non (chaîne non vide exigée). Même champ, même valeur de référence (`manual`) ; seul le cas d'une chaîne vide diverge — `PaymentGatewayService` n'écrit dans `settled_by` que l'identifiant non nul de la transaction du webhook (l. ~759) ou `manual` (l. ~1239).
- Reste : `docs/spatie-query-builder.md` ne décrit pas encore les filtres des deux listes neuves (filtres écrits à la main, hors `spatie/laravel-query-builder`) — à reporter avec `/sync-specs`.
