---
id: TCK-593
title: "Le locataire télécharge son contrat et ses quittances et paie ce qu'il doit vraiment, et l'agence rapproche ses relevés, Wave et Orange Money compris"
status: todo
phase: P1
family: full
estimate: L
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#15-transactions--paiements
    - docs/features.md#110-documents--contrats
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#28-payout-
    - docs/models-spec.md#40-bankstatement-
    - docs/models-spec.md#41-bankstatementline-
    - docs/models-spec.md#2-agency
tags: [back, front, paiements, quittances, pdf, penalites, rapprochement, wave, orange-money, mobile, analyse-par-acteur]
---

## Objectif utilisateur

- **Locataire** : depuis son téléphone, il télécharge son contrat de bail, le reçu de son acompte et la
  quittance de chaque loyer payé, puis paie en ligne le montant réellement dû (loyer et pénalité de
  retard compris), et rien de plus.
- **Admin d'agence** : il importe un relevé bancaire, Wave Business ou Orange Money, valide les
  rapprochements proposés pour les encaissements comme pour les reversements, puis clôt le relevé.

## Contexte

Ce ticket vient de l'analyse par acteur du 2026-10-06 (vague 73) : points C1, C2 et C3 du rapport
client, AD10 du rapport admin d'agence. Chaque constat a été remesuré sur `e3ab4a4e`.

### 1. Les téléchargements du contrat et du reçu aboutissent sur un 404 de Next (C1)

- `takussan-web/src/components/leases/LeaseDetail.tsx:218-224` : un `<Link href={`/api/leases/${leaseId}/contract/pdf`}>`
  est montré hors surface agent. `takussan-web/src/components/bookings/BookingDetail.tsx:364-369` : un
  `<a href={`/api/booking-payments/${p.id}/receipt`}>`.
- Ces deux chemins sont relatifs, donc servis par l'origine Next. `src/app/api/` ne contient aucun relais
  `leases/…` ni `booking-payments/…`. `next.config.ts:183-190` ne déclare que `headers()`, sans aucun
  `rewrites`. Le `matcher` de `src/proxy.ts:195-197` exclut `api(?:/|$)`. Le résultat est un 404 Next.
  Même relayé, un lien nu ne porterait pas le Bearer exigé par `auth:sanctum`
  (`routes/api/leases.php:13`, `routes/api/bookings.php:8`).
- Le dépôt contient déjà deux motifs corrects :
  - `components/inventory/InventoryPdfButton.tsx:41-68` fait un `fetch` sur l'origine de l'API avec
    `Authorization: Bearer`, puis télécharge un blob en nommant lui-même le fichier ;
  - le relais same-origin `src/app/api/data-exports/[id]/download/route.ts` passe du cookie httpOnly
    au Bearer et recopie `content-type`/`content-disposition`.
- ⚠ `config/cors.php:32` vaut `exposed_headers => []`. Un `fetch` cross-origin **ne lit donc pas**
  `Content-Disposition`, et le nom du fichier doit venir d'ailleurs.

### 2. Le locataire n'a ni quittance ni vue Paiements à lui, et une quittance d'impayé peut sortir (C2)

- L'API sert la quittance d'une échéance (`routes/api/leases.php:60-61`, `DocumentPdfController::receipt`),
  mais aucun appelant front n'existe (`grep -rn "receipts/" takussan-web/src` → 0).
- **Défaut nouveau, relevé à la remesure :** `DocumentPdfController.php:28-45` ne contrôle **aucun statut**.
  Le gabarit `resources/views/pdf/receipts/rent.blade.php` date le document de `paid_at ?? due_date`
  (l.14), affiche le statut brut (l.75) et certifie : « Cette quittance atteste du règlement du loyer »
  (l.80). Une échéance `pending` produit donc un PDF qui atteste un paiement qui n'a pas eu lieu.
  L'équivalent réservation refuse correctement (`BookingPaymentController.php:73-77`, 422 hors `Paid`).
  `ReceiptPdfTest` ne teste que des échéances `->paid()` (l.37, l.89).
- `/app/payments` rend à tous `PaymentsTabs` (`app/(dashboard)/app/payments/page.tsx`), avec ses trois
  onglets de gestionnaire (`PaymentsTabs.tsx:76-80`). L'onglet « Reversements » (l.110-112) reste
  toujours vide pour un client : `PayoutController.php:26-34` filtre sur `landlord_id`, `issued_by_id`
  et `agency_id`.
- `LeaseSchedule.tsx:72-80` est un tableau de **cinq** colonnes `whitespace-nowrap` dans un
  `overflow-x-auto`. Le seul bouton « Payer » (l.122-130) est dans la dernière, donc hors écran sur un
  téléphone. Il s'affiche aussi pour une échéance annulée ou remboursée : la condition est
  `st !== 'paid'`, l.123.
- `PaymentController::leaseRow` (l.299-325) n'expose pas `late_fee_amount` : l'historique ne peut pas
  montrer la pénalité.

### 3. La pénalité de retard n'est ni affichée ni encaissée, et une échéance payée peut l'être deux fois (C3)

- Le contrat est rompu entre l'API et le front. `LateFeeCalculator.php:130-134` écrit `late_fee_amount`
  et `LeasePaymentResource.php:29` l'expose sous ce nom. Le front attend `late_fee`
  (`types/lease.ts:93`) et le lit (`LeaseSchedule.tsx:103-107`) : le « +X FCFA » ne s'affiche jamais.
  Le type déclare aussi `transaction_id` et `updated_at`, absents de la ressource, et ignore
  `paid_amount`, `remaining_amount` et `late_fee_applied_at`, qu'elle envoie (l.27-30).
- `PaymentGatewayService::paymentAmount` (`app/Services/Payments/PaymentGatewayService.php:556-561`) ne
  rend que `amount`. Il est utilisé pour l'initiation (l.82) comme pour la garde de sous-paiement
  (l.325-337). Le locataire en retard paie donc le loyer seul, l'échéance passe `paid`, et la pénalité
  appliquée à 02:00 (`routes/console.php:30`) disparaît sans bruit. Il en avait pourtant été averti par
  `Listeners/Lease/NotifyTenantOfLateFee`. Le sélecteur de fournisseur (`PaymentProviderPicker.tsx`)
  n'affiche aucun montant.
- **Défaut nouveau, relevé à la remesure :** `PaymentGatewayController::initiate` (l.27-33) n'a aucune
  garde de statut, et `LeasePaymentPolicy::update` non plus. Un checkout peut donc s'ouvrir sur une
  échéance déjà `paid` ou `refunded`, et seul le bouton masqué côté front l'empêche.
  `PaymentGatewayInitiateTest` ne couvre pas ce cas.

### 4. Le rapprochement est codé mais n'a pas d'écran, ignore les débits et ne sait lire qu'un format (AD10)

- Le back existe : **9 routes** (`routes/api/accounting.php:11-22`, et non 11 comme le disait le
  rapport), les parseurs `StatementParser/{CsvDriver,OfxDriver}`, le matcher, le gestionnaire, la policy
  et quatre tests `tests/Feature/Api/Accounting/*`. Le front n'a rien :
  `grep -rniE "bank[-_ ]?statement|rapprochement|reconcil" takussan-web/src` → 0, et 0 clé dans
  `messages/fr.json`. TCK-109 (`done`) prévoyait cette page sans jamais la livrer, et renvoyait les
  `Payout` à « un ticket dédié ».
- Les débits sont ignorés (`ReconciliationMatcher.php:37-39`). Les types appariables valent
  BookingPayment, LeasePayment et Invoice à trois endroits : `ReconciliationMatcher.php:24-28`,
  `BankStatementLineController.php:18-22` + `MatchBankStatementLineRequest`, et
  `ReconciliationManager.php:22-26`. `payouts` n'a ni `bank_reconciled_at` ni `bank_statement_line_id` :
  seules les migrations `2026_04_28_00000{3,4,5}` les posent, sur les trois autres tables.
- Le mapping CSV n'est réglable par personne. `Agency.bank_csv_mapping` (`Agency.php:34,49`) n'est écrit
  par aucune route (`grep -rn bank_csv_mapping app/Http` → 0), et seul le défaut
  `CsvDriver.php:12-24` (`date`/`amount`/`label`, `d/m/Y`, virgule) est utilisable. C'est en outre **un**
  mapping par agence, alors qu'une agence reçoit des relevés de sa banque, de Wave et d'Orange Money.
- Les échecs sont muets :
  - une ligne illisible est sautée avec un simple `Log::warning` (`CsvDriver.php:50-55`) ;
  - un relevé dont l'analyse échoue reste `processing` à vie (`ParseBankStatementJob.php:107-114`), et
    `BankStatementStatus` (l.7-11) n'a pas d'état d'échec ;
  - `parseAmount` (l.122-141) n'enlève pas l'espace insécable (U+00A0/U+202F) des milliers français, et
    lit `150,000` comme 150. C'est un risque d'erreur ×1000 sur un export au format anglo-saxon
    (*inféré : à confirmer sur un vrai fichier*).
- Les formats d'export Wave Business et Orange Money **ne sont pas connus du dépôt**, et personne ne les
  a relevés sur un vrai fichier. `StoreBankStatementRequest.php:20` n'accepte que `csv,txt,ofx`.
- Le lien avec la partie 3 : si la pénalité est encaissée en ligne, la ligne Wave vaut
  `amount + late_fee_amount`, et le matcher par montant exact (`ReconciliationMatcher.php:83`) ne
  retrouvera plus l'échéance.

## Contrat de données

- **Lus tels quels (existants)** : `GET /api/leases/{lease}/contract/pdf`,
  `GET /api/leases/{lease}/receipts/{payment}/pdf`, `GET /api/booking-payments/{payment}/receipt`,
  `GET /api/leases/{lease}/payments`, `GET /api/payments/history`,
  `POST /api/{paymentType}/{paymentId}/initiate`, les 9 routes de `routes/api/accounting.php`.
- **`LeasePaymentResource`** : le front s'aligne sur la ressource (`late_fee_amount`, `paid_amount`,
  `remaining_amount`, `late_fee_applied_at`). Elle gagne `amount_due`, le montant que le paiement en
  ligne demandera, calculé par la même méthode que la passerelle, ainsi que `receipt_available`
  (bool : `status === paid`).
- **`PaymentController::leaseRow`** ajoute `late_fee_amount` et `amount_due`. `filter[status]` accepte
  une liste séparée par des virgules (`pending,late`), ce qui permet au locataire d'obtenir « ce que je
  dois » sans filtrer côté client.
- **Rapprochement (nouveau)** :
  - `GET /api/agencies/{agency}/bank-statements/csv-presets` rend les préréglages : `default`,
    `wave_business` et `orange_money`, chacun avec `verified: bool` ;
  - `GET|PUT /api/agencies/{agency}/bank-statements/csv-mapping` lit et écrit le mapping propre à
    l'agence ;
  - `POST /api/agencies/{agency}/bank-statements` accepte en plus `csv_preset`
    (`default|wave_business|orange_money|agency`) ;
  - `BankStatementResource` expose `status` (dont `failed`), `skipped_lines_count` et `csv_preset` ;
  - `payment_type` de `match` accepte `payout`.
- **Front** : appels vers l'origine de l'API (`apiFetch`, ou `apiRequest`/`useApiQuery` **avec**
  `/api` écrit par l'appelant). Seul `agencies/*` passe par le relais BFF existant
  (`src/app/api/agencies/[[...path]]/route.ts`). `bank-statements/*` et `bank-statement-lines/*` n'ont
  **pas** de relais : un chemin relatif y reproduirait le 404 de la partie 1. Les lectures passent
  `fields[…]`, `filter[…]` et `include=`.

## Direction UX / Artistique

- **Locataire, mobile d'abord.** La vue Paiements s'ouvre sur la prochaine somme due, avec son montant
  total décomposé (loyer, puis pénalité s'il y en a une) et une action principale « Payer par Wave /
  Orange Money » visible sans défilement. L'historique se lit en cartes sur un écran étroit, sans aucun
  défilement horizontal. Chaque échéance payée porte « Quittance PDF ». Le vocabulaire est celui d'un
  locataire : pas de « reversement », pas de « facturer », et pas d'onglet vide.
- Le montant affiché avant paiement est **exactement** celui que la passerelle demandera
  (`amount_due`) : aucun calcul côté client.
- Un téléchargement en cours se voit, et un échec se dit dans la langue de l'utilisateur. On ne quitte
  jamais la page pour un onglet blanc.
- **Rapprochement** : une interface comptable sobre et dense, mais lisible (le ton de TCK-109 tient).
  On y trouve l'import avec le choix du format (banque, Wave, Orange Money), puis la liste des relevés
  avec le ratio « X / Y rapprochées ». Chaque ligne affiche son sens (encaissement ou décaissement), sa
  suggestion et sa confiance, et se valide en un geste. Une recherche manuelle existe, ainsi que la
  clôture. Un relevé en échec ou des lignes ignorées à la lecture se **voient**, avec leur nombre. Un
  préréglage non vérifié porte une mention honnête (« format à confirmer »).
- Le rapprochement est un écran d'admin d'agence sur ordinateur, mais sans casse sur tablette.

## Contraintes strictes (métier)

1. **Pas de quittance pour un loyer non acquitté.** `GET leases/{lease}/receipts/{payment}/pdf` rend
   422 hors `paid`, comme le reçu de réservation. Une quittance atteste un paiement, et en délivrer une
   pour un impayé crée une preuve contre le bailleur.
2. **Une seule définition de « combien est dû »** : `PaymentGatewayService::amountDue()` (renommage de
   `paymentAmount`). L'initiation, `amount_due` de la ressource et le sélecteur l'utilisent tous. Le
   montant demandé est **figé à l'initiation** dans `metadata.gateway_expected_amount` (avec
   `late_fee_included`), et la garde de sous-paiement compare le webhook à ce montant figé. Sinon, une
   pénalité appliquée entre l'ouverture du checkout et le webhook ferait refuser un paiement légitime.
3. **Règle produit retenue (option recommandée, à confirmer par le porteur)** : une pénalité appliquée
   est due et encaissée avec le loyer, soit `amountDue = remaining_amount + late_fee_amount` pour un
   `LeasePayment`. La règle s'écrit dans `docs/features.md` §1.4 avant le code (ligne fournie à la
   session). Si le porteur tranche l'inverse, la pénalité cesse d'être affichée comme due et
   `NotifyTenantOfLateFee` ne doit plus l'annoncer.
4. **On ne paie pas deux fois.** `initiate` refuse (409, code `payment_not_payable`) une échéance
   `paid` ou `refunded`, ou dont `amountDue <= 0`. La garde vit dans le service et **pas** dans
   `LeasePaymentPolicy` (territoire TCK-587).
5. **Le sens d'une ligne borne ses candidats** : un crédit ne s'apparie qu'à un encaissement
   (BookingPayment, LeasePayment, Invoice), et un débit qu'à un `Payout` `completed` de la même agence,
   sur `net_amount`. Un paiement ou un reversement n'est rapproché qu'une fois, garanti par un index
   unique partiel.
6. **Préréglages honnêtes.** Un préréglage Wave ou OM non relevé sur un vrai fichier est livré avec
   `verified: false`, n'est jamais proposé par défaut et le dit à l'écran. Le mapping utilisé est
   **figé sur le relevé** à l'import (instantané) : modifier le mapping de l'agence ne ré-interprète
   aucun relevé passé.
7. **Aucune perte silencieuse à la lecture** : le nombre de lignes sautées est compté et exposé, et un
   échec d'analyse passe le relevé en `failed` au lieu de le laisser `processing`.
8. Accès au rapprochement : la `BankStatementPolicy` actuelle (admin d'agence) est inchangée. Une
   capacité dédiée relèverait de TCK-587.
9. Aucun littéral de prose dans l'API : chaque nouvelle erreur passe par une clé `__()`, et les clés
   `reconciliation.*` et `payments.*` s'ajoutent dans un bloc propre au ticket.
10. **Coordination vague 73** :
    - `LeaseDetail` est partagé avec TCK-596, qui ajoute le bouton préavis : seul le bloc du contrat
      bouge ici ;
    - le modèle `Payout` et `PayoutResource` appartiennent à TCK-594 : on n'y fait qu'un ajout
      `fillable`/`casts`/champ en lecture, en lignes voisines ;
    - `PaymentGatewayService` est partagé avec TCK-602 (webhooks, après TCK-293) : seules
      `amountDue`, la garde d'initiation et la comparaison au montant figé bougent ici, jamais la
      réception ;
    - les actions de `PayoutDetailDialog` appartiennent à TCK-587 ;
    - la prose de `LeasePaymentService` et `LeasePaymentLateFeeNotification` relève de TCK-588 ;
    - `roles.ts` est lu sans être modifié (TCK-586) ;
    - `DocumentPdfController::receipt`, `PaymentController::history/leaseRow` et
      `PaymentGatewayController::initiate` ne sont revendiqués par aucun ticket et sont pris ici.

## Delta à produire

### Partie 1 — Téléchargements (C1)

- [ ] Front : le contrat (`LeaseDetail`) et le reçu d'acompte (`BookingDetail`) se téléchargent
      authentifiés depuis l'API, sur l'un des deux motifs existants. Une seule mécanique est réutilisée
      pour le contrat, le reçu et les quittances.
- [ ] Tests Vitest : l'URL appelée est celle de l'API (et non l'origine Next), elle porte le Bearer, et
      un 403/422 affiche un message localisé.

### Partie 2 — Quittances et vue Paiements du locataire (C2)

- [ ] `DocumentPdfController::receipt` : `abort_unless($payment->status === PaymentStatus::Paid, 422, __('payments.receipt_unpaid'))`.
- [ ] `rent.blade.php` : date = `paid_at`, statut libellé et non brut, pénalité en ligne distincte
      quand `metadata.late_fee_included` vaut vrai.
- [ ] `PaymentController::history` : `filter[status]` en liste, et `leaseRow` + `late_fee_amount`,
      `amount_due`.
- [ ] Front : vue Paiements dédiée au client seul (`isCustomerOnly`), avec prochaine somme due,
      historique en cartes, quittance par échéance payée et onglet Reversements masqué. Un profil pro
      garde la vue actuelle.
- [ ] Front : `LeaseSchedule` reste utilisable sur téléphone (« Payer » atteignable sans défilement
      horizontal) et n'offre « Payer » que pour `pending`, `late` ou `partially_paid`, plus une
      quittance par échéance payée.
- [ ] Tests : `ReceiptPdfTest::test_quittance_refusee_pour_une_echeance_impayee`, et
      `PaymentHistoryTest` (liste de statuts, `late_fee_amount` présent).

### Partie 3 — Ce qui est dû (C3)

- [ ] `PaymentGatewayService` : `paymentAmount` → `amountDue` (`remaining_amount + late_fee_amount`
      pour `LeasePayment`, inchangé ailleurs). Montant figé dans `recordInitiation`, et
      `assertReportedAmountCoversPayment` compare au montant figé.
- [ ] `PaymentGatewayService::initiate` : garde `payment_not_payable` (409).
- [ ] `LeasePaymentResource` : `amount_due` et `receipt_available`.
- [ ] Front : `types/lease.ts` aligné champ par champ sur `LeasePaymentResource` (`late_fee` →
      `late_fee_amount`, champs fantômes retirés), et le sélecteur de fournisseur affiche le montant dû
      décomposé.
- [ ] Tests :
  - `PaymentGatewayInitiateTest::test_le_montant_initie_inclut_la_penalite` ;
  - `…::test_initiation_refusee_sur_une_echeance_deja_payee` ;
  - `…::test_webhook_compare_au_montant_fige_a_l_initiation` ;
  - `LeasePaymentResourceContractTest` (clés exactes de la ressource) ;
  - un test Vitest qui échoue si le type réintroduit `late_fee`.

### Partie 4 — Rapprochement (AD10)

- [ ] Migration `add_bank_reconciliation_to_payouts_table` : `bank_reconciled_at`,
      `bank_statement_line_id` (FK `payouts_bank_line_fk`, `nullOnDelete`) et unique partiel
      `payouts_bank_line_unique` `WHERE bank_statement_line_id IS NOT NULL`, avec un `down()` réel.
- [ ] Migration `add_parse_outcome_to_bank_statements_table` : `csv_preset` (string, nullable),
      `csv_mapping` (jsonb, nullable, instantané) et `skipped_lines_count` (unsignedInteger, défaut 0).
      `BankStatementStatus::Failed = 'failed'` (chaîne, pas d'`enum()` SQL, ADR-0007).
- [ ] `ReconciliationMatcher` : branche débit → `Payout` `completed`, même agence, même devise,
      `net_amount` exact, fenêtre sur `processed_at`. Côté crédit, le montant comparé à une
      `LeasePayment` est le montant figé à l'initiation quand il existe, `amount` sinon.
- [ ] `ReconciliationManager::ALLOWED_PAYMENT_TYPES`, `BankStatementLineController::PAYMENT_TYPE_MAP`,
      `MatchBankStatementLineRequest` et `PaymentSearchService` : ajouter `payout`, avec une garde de
      sens (crédit ↔ encaissement, débit ↔ reversement, 422 `reconciliation.validation.direction_mismatch`).
- [ ] `config/reconciliation.php` : préréglages `default`, `wave_business` et `orange_money`, ces deux
      derniers avec `verified => false` tant qu'aucun fichier réel n'a été relevé. Contrôleur
      `BankCsvMappingController` (`presets`, `show`, `update`) + `UpdateBankCsvMappingRequest`
      (colonnes, `date_format`, `delimiter`, `sign_convention`, `decimal_separator`,
      `thousands_separator`), autorisés par `BankStatementPolicy::create`.
- [ ] `StoreBankStatementRequest` : `csv_preset` ; le contrôleur fige `csv_mapping` sur le relevé, et
      `ParseBankStatementJob` lit cet instantané, puis l'agence en repli.
- [ ] `CsvDriver` : séparateurs décimal et de milliers explicites dans le mapping, espaces insécables
      retirés, lignes sautées **comptées** (`skipped_lines_count`) ; `ParseBankStatementJob` passe
      `failed` sur exception.
- [ ] Front : écran de rapprochement sous les finances de l'agence (import avec choix du format,
      relevés, lignes, suggestions, recherche manuelle, ignorer, clôturer, réglage du mapping), en
      fr/en/wo.
- [ ] Tests :
  - `BankReconciliationTest::test_un_debit_est_suggere_sur_le_reversement_emis` ;
  - `…::test_un_credit_ne_s_apparie_pas_a_un_reversement` ;
  - `…::test_un_reversement_n_est_rapproche_qu_une_fois` ;
  - `BankReconciliationCrossAgencyTest` (+ cas `payout`) ;
  - `StatementParserTest` (espace insécable, `150 000`, `150,000` avec `thousands_separator=','`,
    lignes sautées comptées) ;
  - `BankStatementPipelineTest::test_echec_d_analyse_passe_le_releve_en_failed` ;
  - `BankCsvMappingTest` (403 hors admin, instantané non ré-interprété).

## Critères d'acceptation

- [ ] **AC1** — Connecté comme locataire du bail, « Télécharger le contrat » produit un fichier PDF non
      vide, de même pour le reçu d'un acompte payé. Le test front vérifie que la requête vise l'origine
      de l'API avec le Bearer : il **rougit** si on remet le lien relatif.
- [ ] **AC2** — `GET /api/leases/{l}/receipts/{p}/pdf` sur une échéance `pending` → **422**, alors que
      le même appel sur une échéance `paid` rend un PDF. Ce test rougit sur le code actuel (200 sur
      `pending`) et redevient rouge si la garde est retirée.
- [ ] **AC3** — Sur une échéance de 150 000 XOF avec `late_fee_amount = 7 500`, `initiate` transmet au
      pilote Wave **157 500** (×100 à la frontière, puis re-divisé par le pilote). `amount_due` vaut
      `157500` dans la ressource et dans l'historique, et le sélecteur affiche 157 500. Rouge sur le
      code actuel (150 000).
- [ ] **AC4** — Un checkout est ouvert à 150 000 **avant** l'application de la pénalité, et son webhook
      `success` de 150 000 arrive **après** (`late_fee_amount` vaut alors 7 500) : l'échéance est soldée
      sans 422 de sous-paiement, puisque la comparaison porte sur le montant figé. Un webhook de 140 000
      sur ce même checkout reste refusé.
- [ ] **AC5** — `initiate` sur une échéance `paid` → **409** `payment_not_payable`, aucun appel au
      pilote (pilote simulé avec zéro appel attendu). Rouge sur le code actuel.
- [ ] **AC6** — `types/lease.ts` ne contient plus `late_fee:`. Une échéance à `late_fee_amount = 7500`
      affiche « +7 500 FCFA » dans l'échéancier, vérifié sur la valeur rendue et pas seulement sur la
      présence d'un nœud.
- [ ] **AC7** — Un compte client seul ne voit pas d'onglet Reversements sur `/app/payments`, et voit en
      tête la prochaine somme due avec l'action de paiement. Un admin d'agence voit toujours les trois
      onglets. Sur une largeur de 360 px, « Payer » et « Quittance PDF » sont atteignables sans
      défilement horizontal (`scrollWidth === clientWidth` sur le conteneur de la liste).
- [ ] **AC8** — Un relevé contenant un débit de 285 000 XOF à J+1 d'un `Payout` `completed` de
      `net_amount = 285 000` de la même agence produit une suggestion `payout` de confiance ≥ 70.
      Confirmer pose `bank_reconciled_at` sur le reversement, et une seconde ligne ne peut plus s'y
      apparier (422, index unique). Un `Payout` d'une autre agence n'est jamais proposé (403 en
      confirmation forcée).
- [ ] **AC9** — Un crédit ne peut pas être confirmé sur un `Payout`, ni un débit sur une `LeasePayment`
      (422 `direction_mismatch`).
- [ ] **AC10** — Un CSV dont un montant vaut `150 000` (espace insécable) donne une ligne à 150 000,
      et non 150 ni rien. Un fichier à 10 lignes dont 2 illisibles finit `ready_for_review` avec
      `lines_count = 8` et `skipped_lines_count = 2`. Un fichier qui fait lever le parseur finit
      `failed`.
- [ ] **AC11** — Un relevé importé avec le préréglage `wave_business` garde son `csv_mapping`. Modifier
      ensuite le mapping de l'agence ne change pas `csv_mapping` sur ce relevé. Un agent (non admin)
      reçoit 403 sur `PUT csv-mapping`.
- [ ] **AC12** — Les préréglages Wave et OM sont rendus avec `verified: false` tant que le porteur n'a
      pas fourni de fichier réel. L'écran l'affiche, et aucun n'est sélectionné par défaut.

## Hors périmètre

- Le paiement sans compte (`/pay/{token}`), le journal et le rejeu des webhooks : TCK-602, après
  TCK-293. Le cloisonnement du secret de webhook par agence : TCK-293.
- La remise (abandon) d'une pénalité par l'agent, et la déclaration de pénalité lors d'un
  `mark-paid` manuel (question au porteur).
- Les actions sur un reversement (`PayoutDetailDialog`), son calcul et ses quatre yeux :
  TCK-587 / TCK-594.
- La prose des notifications de paiement et de pénalité : TCK-588. Le tableau de bord locataire : TCK-595.
- La vue Paiements d'un compte à la fois bailleur et locataire : il garde la vue gestionnaire, et ses
  quittances restent accessibles depuis le détail du bail.
- Un lecteur XLSX, et la connexion directe aux API Wave et Orange Money (relevés tirés
  automatiquement).
- Les écritures comptables (journaux, FEC) : TCK-595.

## Notes d'implémentation

_(à remplir par implementing-specs)_
