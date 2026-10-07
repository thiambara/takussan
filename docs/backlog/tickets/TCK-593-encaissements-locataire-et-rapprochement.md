---
id: TCK-593
title: "Le locataire télécharge son contrat et ses quittances et paie ce qu'il doit vraiment, et l'agence rapproche ses relevés, reversements compris"
status: done
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-07
depends_on: []
blocks: [TCK-602]
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
tags: [back, front, paiements, quittances, pdf, penalites, rapprochement, reglages-agence, mobile, analyse-par-acteur]
---

## Objectif utilisateur

- **Locataire** : depuis son téléphone, il télécharge son contrat de bail, le reçu de son acompte et la
  quittance de chaque loyer payé. Il paie en ligne exactement ce que l'écran lui annonce : le loyer
  restant, plus la pénalité de retard si son agence a choisi de l'encaisser en ligne. Sinon, la
  pénalité lui est montrée à part, « à régler auprès de l'agence ». Il ne peut pas payer deux fois.
- **Admin d'agence** : il choisit si les pénalités de retard s'encaissent avec le paiement en ligne
  (non par défaut) et enregistre une pénalité réglée à l'agence. Il règle le mapping CSV de ses
  relevés, importe un relevé, voit les lignes ignorées, valide les rapprochements des encaissements
  comme des reversements, puis clôt le relevé.

## Contexte

Ce ticket vient de l'analyse par acteur du 2026-10-06 (vague 73) : points C1, C2 et C3 du rapport
client, AD10 du rapport admin d'agence. Chaque constat a été remesuré sur `e3ab4a4e`. La passe de
correction du 2026-10-06 en a ajouté trois (§ 3, échéance `failed` ; § 5, réglages d'agence écrasés ;
§ 4, lignes vides non comptées).

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
- **Défaut :** `DocumentPdfController.php:28-45` ne contrôle **aucun statut**. Le gabarit
  `resources/views/pdf/receipts/rent.blade.php` date le document de `paid_at ?? due_date` (l.14),
  affiche le statut brut, en anglais (`pending`, l.75), et certifie : « Cette quittance atteste du
  règlement du loyer » (l.80). Une échéance `pending` produit donc un PDF qui atteste un paiement qui
  n'a pas eu lieu. L'équivalent réservation refuse correctement (`BookingPaymentController.php:73-77`,
  422 hors `Paid`). `ReceiptPdfTest` ne teste que des échéances `->paid()` (l.37, l.89). Le gabarit
  n'affiche que `amount` (l.57) : une pénalité, réglée ou non, n'y figure jamais.
- `/app/payments` rend à tous `PaymentsTabs` (`app/(dashboard)/app/payments/page.tsx`), avec ses trois
  onglets de gestionnaire (`PaymentsTabs.tsx:76-80`). L'onglet « Reversements » (l.110-112) reste
  toujours vide pour un client : `PayoutController.php:26-34` filtre sur `landlord_id`, `issued_by_id`
  et `agency_id`.
- `LeaseSchedule.tsx:72-80` est un tableau de **cinq** colonnes `whitespace-nowrap` dans un
  `overflow-x-auto`. Le seul bouton « Payer » (l.122-130) est dans la dernière, donc hors écran sur un
  téléphone. Il s'affiche aussi pour une échéance remboursée : la condition est `st !== 'paid'`, l.123.
- `PaymentController::leaseRow` (l.299-325) n'expose pas `late_fee_amount` : l'historique ne peut pas
  montrer la pénalité.

### 3. La pénalité de retard n'est ni affichée ni réglée, une échéance payée peut l'être deux fois, et un échec de paiement fige l'échéance (C3)

- Le contrat est rompu entre l'API et le front. `LateFeeCalculator.php:130-134` écrit `late_fee_amount`
  et `LeasePaymentResource.php:29` l'expose sous ce nom. Le front attend `late_fee`
  (`types/lease.ts:93`) et le lit (`LeaseSchedule.tsx:103-107`) : le « +X FCFA » ne s'affiche jamais.
  Le type déclare aussi `transaction_id` et `updated_at`, absents de la ressource, et ignore
  `paid_amount`, `remaining_amount` et `late_fee_applied_at`, qu'elle envoie (l.27-30).
- **Sémantique actuelle, remesurée** : `status` décrit **le loyer**, pas la pénalité.
  `LateFeeCalculator::apply` (l.130-134) pose `late_fee_amount`, `late_fee_applied_at` et
  `status = late`. Les deux chemins qui soldent l'échéance — la passerelle
  (`PaymentGatewayService.php:262-273`) et le `mark-paid` manuel (`LeasePaymentService.php:35-48`) —
  écrivent `status = paid` sans jamais lire `late_fee_amount`. `remaining_amount` est dérivé de
  `amount - paid_amount` (`Concerns/HasPaymentAttributes.php:19`, l.237-243) et ignore la pénalité.
  **Rien n'enregistre qu'une pénalité a été réglée** : il n'existe ni colonne ni clé de métadonnée
  pour cela.
- `PaymentGatewayService::paymentAmount` (`app/Services/Payments/PaymentGatewayService.php:556-561`) ne
  rend que `amount`. Il sert à l'initiation (l.82) comme à la garde de sous-paiement (l.306-337).
  Le locataire en retard paie donc le loyer seul, l'échéance passe `paid`, et la pénalité appliquée à
  02:00 (`routes/console.php:30`) disparaît de tous les écrans. Il en avait pourtant été averti par
  `Listeners/Lease/NotifyTenantOfLateFee`, dont le texte (`lang/fr/notifications.php:104-109`) ne dit
  ni comment ni où la régler. Le sélecteur de fournisseur (`PaymentProviderPicker.tsx`) n'affiche
  aucun montant.
- **Défaut :** `PaymentGatewayController::initiate` (l.27-33) n'a aucune garde de statut, et
  `LeasePaymentPolicy::update` non plus. Un checkout peut donc s'ouvrir sur une échéance déjà `paid`
  ou `refunded`, et seul le bouton masqué côté front l'empêche. `PaymentGatewayInitiateTest` ne
  couvre pas ce cas.
- **Défaut (passe de correction) : un paiement en ligne échoué sort l'échéance de tous les circuits.**
  Un webhook ou un `verify` en échec écrit `status = failed` sur le loyer
  (`PaymentGatewayService.php:275-279`). Or `failed` n'est lu comme « ouvert » nulle part : les
  pénalités ne s'appliquent qu'à `pending|partially_paid|late` (`LateFeeCalculator.php:80-87`,
  `Jobs/Lease/ApplyLateFeesJob.php:80-84`), les relances ne lisent que `pending` et `late`
  (`Jobs/SendLeasePaymentReminders.php:23,43`), et le `mark-paid` manuel refuse tout ce qui n'est
  pas `pending|late` (422, `LeasePaymentService.php:37-41`). Un locataire dont le checkout Wave
  expire n'est donc plus relancé, n'a jamais de pénalité, et l'agent ne peut plus enregistrer son
  paiement en espèces.

### 4. Le rapprochement est codé mais n'a pas d'écran, ignore les débits et ne lit que le mapping par défaut (AD10)

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
  `CsvDriver.php:12-24` (`date`/`amount`/`label`, `d/m/Y`, virgule) est utilisable.
- Les échecs sont muets :
  - une ligne illisible est sautée avec un simple `Log::warning` (`CsvDriver.php:50-55`) ;
  - **(passe de correction)** une ligne dont la colonne de date ou de montant est vide — ou
    **introuvable**, parce que le fichier ne porte pas les noms de colonnes du mapping — est sautée
    sans même un journal (`CsvDriver.php:64-66`, `return null`). Un export dont les colonnes
    s'appellent `Date` et `Montant` donne un relevé `ready_for_review` à **zéro ligne**, sans erreur ;
  - un relevé dont l'analyse échoue reste `processing` à vie (`Jobs/Accounting/ParseBankStatementJob.php:107-114`),
    et `BankStatementStatus` (l.7-11) n'a pas d'état d'échec ;
  - `parseAmount` (`CsvDriver.php:122-141`) n'enlève que l'espace ASCII (l.124), pas l'espace insécable
    (U+00A0/U+202F) des milliers français : `150 000` donne 150. Et le séparateur décimal est
    **deviné** (l.135-138) : `150,000` est lu 150. C'est un risque d'erreur ×1000 sur un export au
    format anglo-saxon.
- **Défaut (consolidation, relevé par TCK-601) : les deux journaux d'échec recopient le contenu du
  relevé bancaire.**
  - `ParseBankStatementJob.php:108-111` journalise `$e->getMessage()` et `$e->getTraceAsString()`.
    Quand l'insertion par paquets de 500 (`l.92-93`, `BankStatementLine::insert`) échoue — par
    exemple une contrepartie de plus de 255 caractères (`counterparty` est un `string`,
    `2026_04_28_000002_create_bank_statement_lines_table.php:20`, d'où `SQLSTATE[22001]`) —, le
    message de la `QueryException` contient le SQL **avec ses valeurs liées** : les libellés, les
    contreparties, les références et les montants de toutes les lignes du paquet.
  - `CsvDriver.php:51-54` journalise `'record' => array_slice($record, 0, 5)`, soit les cinq
    premières colonnes de la ligne bancaire, plus `getMessage()`. Or le seul `throw` du pilote
    (`l.71`) met la valeur dans le message : `"Invalid date: {$rawDate}"`.
- **Défaut (consolidation) : une date impossible est acceptée et décalée.** `CsvDriver.php:68`
  appelle `CarbonImmutable::createFromFormat($mapping['date_format'], $rawDate)` sans contrôle de
  débordement. Mesuré sur le `vendor` du dépôt : `31/13/2026` donne **`2027-01-31`** et `32/01/2026`
  donne `2026-02-01`, sans erreur. Seul un texte non numérique lève (`InvalidFormatException`), et le
  `if (! $postedAt)` de `l.70-72` n'est jamais atteint. Une ligne au jour et au mois inversés (export
  `m/d/Y` lu en `d/m/Y`) entre donc avec une date fausse, ce qui fausse la période du relevé et la
  fenêtre du matcher.
- Les formats réels des exports Wave Business et Orange Money ne sont pas connus du dépôt : c'est la
  dette **D-67** (`docs/ardoise.md`), hors de ce ticket.
- Le lien avec la partie 3 : quand l'agence encaisse la pénalité en ligne, la ligne bancaire vaut
  `amount + late_fee_amount`, et le matcher par montant exact (`ReconciliationMatcher.php:83`) ne
  retrouve plus l'échéance.

### 5. Le réglage d'agence, et un enregistrement qui efface les autres (passe de correction)

- **Comment l'agence porte ses réglages aujourd'hui** : deux motifs coexistent. Les colonnes dédiées
  (`moderation_required`, `currency`, `commission_rate`), et la colonne `settings` jsonb
  (`2026_04_18_000002_add_settings_to_agencies_table.php:12`, cast `array` `Agency.php:47`), dont les
  clés sont validées une à une dans `AgencyUpdateRequest.php:37-40` et lues avec un défaut **écrit
  dans le code** : `watermark_enabled` (`AgencyWatermarkContext.php:24-31,52-54`),
  `tenant_onboarding_enabled` (`TenantOnboardingService.php:37`, `data_get(…, true)`),
  `booking_pending_expiry_hours` (`BookingExpirationService.php:33-34`). C'est le motif des
  **interrupteurs de comportement**, et TCK-589 le suit (`settings.require_team_two_factor`). Le
  réglage de ce ticket le suit aussi.
- **Défaut :** `AgencyController::update` (l.84-86) fait `$agency->fill($request->validated())`. La
  règle `'settings' => ['sometimes', 'nullable', 'array']` (`AgencyUpdateRequest.php:37`) laisse
  passer le tableau entier, qui **remplace** la colonne. Or l'écran de configuration de l'agence
  envoie un `settings` qui ne contient que `default_commission_rate`, `currency` et `timezone`
  (`takussan-web/src/lib/schemas/agency.ts:98-106,117`). Chaque enregistrement de cet écran efface
  donc les autres clés. Une agence qui a désactivé son filigrane (`watermark_enabled = false`) le voit
  **réactivé** au premier enregistrement de son téléphone, puisque le défaut vaut `true`
  (`AgencyWatermarkContext.php:27`). Sans correctif, le réglage de pénalité serait de même remis à
  « non » sans bruit. TCK-594 a relevé le même écrasement et l'a contourné par une colonne
  (`payout_approval_threshold`) ; personne ne le corrige.

## Contrat de données

- **Lus tels quels (existants)** : `GET /api/leases/{lease}/contract/pdf`,
  `GET /api/leases/{lease}/receipts/{payment}/pdf`, `GET /api/booking-payments/{payment}/receipt`,
  `GET /api/leases/{lease}/payments`, `GET /api/payments/history`,
  `POST /api/{paymentType}/{paymentId}/initiate`, les 9 routes de `routes/api/accounting.php`.
- **Réglage d'agence** : `settings.late_fee_online_collection` (bool). **Absent = `false`.** Écrit par
  `PATCH /api/agencies/{agency}` (existant), lu par `Agency::collectsLateFeesOnline(): bool`. Une
  agence neuve n'a pas la clé, donc vaut « non ». Un bail sans agence (`leases.agency_id` nullable,
  `2026_04_17_160011_create_leases_table.php:16`) vaut « non ».
- **`PATCH /api/agencies/{agency}`** : `settings` se **fusionne** clé par clé avec l'existant. Une clé
  envoyée à `null` est retirée (retour au défaut du code). `settings: null` au premier niveau rend 422.
- **`lease_payments.late_fee_paid_at`** (datetime, nullable, nouveau) : la pénalité est réglée.
  Dérivé : `late_fee_outstanding = late_fee_amount` si `late_fee_amount > 0` et
  `late_fee_paid_at IS NULL`, sinon `0`.
- **`POST /api/lease-payments/{payment}/late-fee/mark-paid`** (nouveau) : l'agence enregistre une
  pénalité réglée chez elle. Corps : `paid_at` (date, optionnel), `payment_method` (optionnel).
  200 + `LeasePaymentResource`, 409 `late_fee_not_due` s'il n'y a pas de pénalité restant due.
- **`LeasePaymentResource`** : le front s'aligne sur la ressource (`late_fee_amount`, `paid_amount`,
  `remaining_amount`, `late_fee_applied_at`). Elle gagne :
  - `amount_due` : le montant que le paiement en ligne demandera (`PaymentGatewayService::amountDue`),
    `0` si l'échéance n'est pas payable ;
  - `late_fee_outstanding` ;
  - `late_fee_paid_at` ;
  - `late_fee_payable_online` (bool) : la pénalité restant due est **incluse** dans `amount_due` ;
  - `receipt_available` (bool : `status === paid`).
- **`PaymentController::leaseRow`** ajoute `late_fee_amount`, `late_fee_outstanding`,
  `late_fee_payable_online` et `amount_due`. `filter[status]` accepte une liste séparée par des
  virgules (`pending,late,failed`), ce qui permet au locataire d'obtenir « ce que je dois » sans
  filtrer côté client.
- **Rapprochement (nouveau)** :
  - `GET|PUT /api/agencies/{agency}/bank-statements/csv-mapping` lit et écrit le mapping de l'agence
    (`bank_csv_mapping`). La lecture rend le mapping effectif (défaut du code fusionné) ;
  - `BankStatementResource` expose `status` (dont `failed`) et `skipped_lines_count` ;
  - `payment_type` de `match` accepte `payout`.
- **Front** : appels vers l'origine de l'API (`apiFetch`, ou `apiRequest`/`useApiQuery` **avec**
  `/api` écrit par l'appelant). Seul `agencies/*` passe par le relais BFF existant
  (`src/app/api/agencies/[[...path]]/route.ts`). `bank-statements/*`, `bank-statement-lines/*` et
  `lease-payments/*` n'ont **pas** de relais : un chemin relatif y reproduirait le 404 de la partie 1.
  Les lectures passent `fields[…]`, `filter[…]` et `include=`.

## Direction UX / Artistique

- **Locataire, mobile d'abord.** La vue Paiements s'ouvre sur la prochaine somme due et une action
  principale « Payer par Wave / Orange Money » visible sans défilement. Le montant affiché est
  décomposé : loyer, puis pénalité **si elle est incluse**. Une pénalité restant due mais non incluse
  s'affiche **à part**, sous l'action de paiement, avec « à régler auprès de l'agence » : elle n'est
  ni additionnée au bouton ni présentée comme payable en ligne. L'historique se lit en cartes sur un
  écran étroit, sans aucun défilement horizontal. Chaque échéance payée porte « Quittance PDF ». Le
  vocabulaire est celui d'un locataire : pas de « reversement », pas de « facturer », pas d'onglet vide.
- Le montant affiché avant paiement est **exactement** celui que la passerelle demandera
  (`amount_due`) : aucun calcul côté client, aucune addition de la pénalité par l'écran.
- Un téléchargement en cours se voit, et un échec se dit dans la langue de l'utilisateur. On ne quitte
  jamais la page pour un onglet blanc.
- **Réglage d'agence** : dans l'écran des paramètres de l'agence, un interrupteur « Encaisser les
  pénalités de retard avec le paiement en ligne », éteint par défaut. Son explication dit les deux
  conséquences en une phrase chacune : allumé, le locataire paie loyer et pénalité ensemble ; éteint,
  il paie le loyer seul et la pénalité lui est annoncée à régler auprès de l'agence. L'enregistrer ne
  touche à aucun autre réglage.
- **Gestionnaire** : sur une échéance dont la pénalité reste due, une action « Pénalité réglée » à côté
  du montant de la pénalité.
- **Rapprochement** : une interface comptable sobre et dense, mais lisible (le ton de TCK-109 tient).
  On y trouve le réglage du mapping des colonnes (avec le séparateur décimal choisi, pas deviné), puis
  l'import, la liste des relevés avec le ratio « X / Y rapprochées ». Chaque ligne affiche son sens
  (encaissement ou décaissement), sa suggestion et sa confiance, et se valide en un geste. Une
  recherche manuelle existe, ainsi que la clôture. Un relevé en échec ou des lignes ignorées à la
  lecture se **voient**, avec leur nombre et l'invitation à vérifier le mapping.
- Le rapprochement est un écran d'admin d'agence sur ordinateur, mais sans casse sur tablette.

## Contraintes strictes (métier)

1. **Pas de quittance pour un loyer non acquitté.** `GET leases/{lease}/receipts/{payment}/pdf` rend
   422 hors `paid`, comme le reçu de réservation. Une quittance atteste un paiement, et en délivrer une
   pour un impayé crée une preuve contre le bailleur.
2. **Une seule définition de « combien est dû »** : `PaymentGatewayService::amountDue()` (renommage de
   `paymentAmount`). L'initiation, `amount_due` de la ressource, l'historique et le sélecteur
   l'utilisent tous. Le montant demandé est **figé à l'initiation** dans
   `metadata.gateway_expected_amount`, avec `metadata.late_fee_included` (bool). La garde de
   sous-paiement compare le webhook à ce montant figé. Sinon, une pénalité appliquée — ou un réglage
   changé — entre l'ouverture du checkout et le webhook ferait refuser un paiement légitime.
3. **Tranché par le porteur le 2026-10-06 : la pénalité au paiement en ligne est configurable par
   l'agence, et par défaut non.** Réglage `settings.late_fee_online_collection`, absent = `false`.
   - **Désactivé** : `amountDue(LeasePayment) = remaining_amount`. La pénalité restant due n'entre
     jamais dans le checkout ; elle s'affiche à part, « à régler auprès de l'agence ».
   - **Activé** : `amountDue(LeasePayment) = remaining_amount + late_fee_outstanding`.
   - Dans les deux cas, le montant est **figé à l'initiation** (point 2). Le réglage lu est celui de
     l'agence du bail **au moment de l'initiation** ; un changement ultérieur ne touche pas un
     checkout ouvert.
   - `amountDue` ne s'applique qu'aux échéances payables (point 4) : une échéance `paid` dont la
     pénalité reste due rend `amount_due = 0`. Ce ticket ne livre pas le paiement en ligne d'une
     pénalité seule : elle se règle à l'agence.
4. **Statut de l'échéance — sans ambiguïté, sur la sémantique existante : `status` décrit le loyer.**
   - Loyer soldé, pénalité non réglée → `status = paid`, `paid_at` posé, `late_fee_amount` **inchangé**,
     `late_fee_paid_at = NULL`. L'échéance **n'est ni `late` ni `partially_paid`** : la pénalité
     restant due se lit dans `late_fee_outstanding`, jamais dans `status`.
   - Loyer et pénalité réglés ensemble en ligne (`metadata.late_fee_included = true`) →
     `status = paid` **et** `late_fee_paid_at` posés dans la même sauvegarde que `paid_at`.
   - Pénalité réglée à l'agence → `late_fee_paid_at` seul ; `status` ne change pas (`paid` si le loyer
     l'est, sinon il reste `late`).
   - Aucune nouvelle valeur de `PaymentStatus`. Tout ce qui lit `paid` aujourd'hui (reversements,
     frais de plateforme, tableaux de bord) continue de lire le loyer.
5. **On ne paie pas deux fois.** La garde vit dans le service, et **pas** dans `LeasePaymentPolicy`
   (territoire TCK-587). `PaymentGatewayService::initiate` refuse (409, code `payment_not_payable`) :
   un `LeasePayment` ou un `BookingPayment` `paid` ou `refunded` ; une `Invoice` hors `sent|overdue` ;
   tout payable dont `amountDue <= 0`. Une échéance `failed` (données antérieures au point 6) reste
   payable : réessayer après un échec est le cas nominal.
6. **Un échec de paiement en ligne ne change pas l'état du loyer.** Sur un `LeasePayment`, la branche
   `FAILED` de `applyStatusToPayment` n'écrit plus `status = failed` : l'échéance garde son statut
   ouvert (`pending`/`late`/`partially_paid`), et l'échec est tracé dans
   `metadata.gateway.last_failed_at`. Les `BookingPayment` et `Invoice` ne changent pas. Les lignes
   `lease_payments` déjà `failed` repassent `pending` par migration, et le calculateur les reprend à
   02:00 s'il y a lieu.
7. **Ce que disent la notification et la quittance est ce que dit l'écran.**
   `LeasePaymentLateFeeNotification` porte `late_fee_payable_online` (même lecture du réglage) et dit
   l'une des deux phrases : « elle sera ajoutée au montant de votre paiement en ligne » ou « elle est
   à régler auprès de votre agence ; elle ne sera pas demandée lors du paiement en ligne ». La
   quittance montre la pénalité sur une ligne distincte : « acquittée » si `late_fee_paid_at` est
   posé, sinon « restant due, à régler auprès de l'agence ». Elle ne l'additionne jamais au loyer
   acquitté.
8. **Un réglage enregistré n'en efface aucun autre.** `settings` se fusionne clé par clé (§ 5 du
   contexte). La règle vaut pour toutes les clés, pas seulement celle de ce ticket.
9. **Le sens d'une ligne borne ses candidats** : un crédit ne s'apparie qu'à un encaissement
   (BookingPayment, LeasePayment, Invoice), et un débit qu'à un `Payout` `completed` de la même agence,
   sur `net_amount`. Un paiement ou un reversement n'est rapproché qu'une fois, garanti par un index
   unique partiel.
10. **Aucune perte silencieuse à la lecture** : toute ligne sautée — illisible, **ou à date ou
    montant vide** — est comptée et exposée. Un fichier non vide dont aucune ligne n'est lue, et un
    échec d'analyse, passent le relevé en `failed` au lieu de le laisser `processing` ou
    `ready_for_review` à zéro ligne. Le séparateur décimal est **déclaré** dans le mapping, jamais
    deviné. Le mapping utilisé est **figé sur le relevé** à l'import : modifier ensuite le mapping de
    l'agence ne ré-interprète aucun relevé passé.
11. **Option retenue par défaut (non tranchée) — qui rapproche** : l'admin d'agence seul, par la
    `BankStatementPolicy` actuelle, inchangée. Une capacité dédiée (`payments.reconcile`) relèverait de
    TCK-587.
12. Aucun littéral de prose dans l'API : chaque nouvelle erreur passe par une clé `__()`, et les clés
    `reconciliation.*`, `payments.*` et `notifications.lease_late_fee_applied.*` s'ajoutent dans un
    bloc propre au ticket, en fr/en/wo.
13. **Coordination vague 73** :
    - `LeaseDetail` est partagé avec TCK-596, qui ajoute le bouton préavis : seul le bloc du contrat
      bouge ici ;
    - le modèle `Payout` et `PayoutResource` appartiennent à TCK-594 : on n'y fait qu'un ajout
      `fillable`/`casts`/champ en lecture, en lignes voisines. 594 calcule les pénalités reversées au
      bailleur : la pénalité **encaissée** se lit dans `late_fee_paid_at` (posé ici) ;
    - `PaymentGatewayService` est partagé avec TCK-602 (webhooks, après TCK-293). Ici bougent
      seulement : `amountDue`, la garde d'initiation, `recordInitiation` (montant figé), la
      comparaison au montant figé, et dans `applyStatusToPayment` les deux blocs `SUCCESS` (pose de
      `late_fee_paid_at`) et `FAILED` (point 6, `LeasePayment` seul). 602 garde la réception, le
      journal et le rejeu. L'ordre de fusion avec 602 est fixé au point suivant ;
    - `AgencyController::update` et `AgencyUpdateRequest` sont touchés aussi par TCK-589
      (`settings.require_team_two_factor`) et TCK-594 (colonnes légales) : ici, seulement la fusion de
      `settings` dans `update` et une règle `settings.late_fee_online_collection`. Ordre de fusion
      indifférent ; la fusion profite aux clés de 589 ;
    - l'écran des paramètres de l'agence (`/admin/agency`) : ajout de l'interrupteur et correction de
      l'envoi de `settings`, sans toucher aux autres champs ;
    - les actions de `PayoutDetailDialog` appartiennent à TCK-587. `LeasePaymentPolicy` (587) est
      utilisée telle quelle (`update`) pour la nouvelle route de pénalité ;
    - la prose de `LeasePaymentService` et la mise en forme de `LeasePaymentLateFeeNotification`
      relèvent de TCK-588 (montant par `CurrencyFormatter`). Ici, on ajoute seulement le paramètre
      `late_fee_payable_online` et les deux phrases du point 7, dans un bloc de clés à nous ; si 588 a
      déjà converti la notification en `codes.*`, les deux phrases deviennent une variante de son code ;
    - `SendLeasePaymentReminders` (588) n'est pas modifié : le point 6 suffit à y faire revenir les
      échéances `failed` ;
    - **TCK-602 lit trois changements de ce ticket, donc 593 fusionne avant 602.** Le renommage
      `paymentAmount` → `amountDue` : 602 cite `paymentAmount`, qui n'existera plus. Un
      `LeasePayment` ne passe plus `failed` (point 6) : le comptage des échecs de 602 lit
      `metadata.gateway.last_failed_at`. Enfin, une pénalité non incluse s'affiche « à régler
      auprès de l'agence », et la page publique de 602 doit la montrer de même ;
    - **TCK-601 crée `App\Support\Logging\SafeExceptionContext`, et ce ticket l'utilise dans
      `ParseBankStatementJob` et `CsvDriver`** (Partie 4) : **601 fusionne d'abord**, et ce ticket
      n'en crée aucune copie. 601 laisse ces deux blocs à 593. Le rapporteur global de 601
      (`bootstrap/app.php`) ne les couvre pas : l'un est un `Log::warning` sans relance, et l'autre
      journalise **avant** de relancer ;
    - `roles.ts` est lu sans être modifié (TCK-586) ;
    - `DocumentPdfController::receipt`, `PaymentController::history/leaseRow`,
      `PaymentGatewayController::initiate`, `LeasePaymentController` (nouvelle action) et
      `LeasePayment` (colonne `late_fee_paid_at`) ne sont revendiqués par aucun autre ticket et sont
      pris ici.

## Delta à produire

### Partie 1 — Téléchargements (C1)

- [x] Front : le contrat (`LeaseDetail`) et le reçu d'acompte (`BookingDetail`) se téléchargent
      authentifiés depuis l'API, sur l'un des deux motifs existants. Une seule mécanique est réutilisée
      pour le contrat, le reçu et les quittances.
- [x] Tests Vitest : l'URL appelée est celle de l'API (et non l'origine Next), elle porte le Bearer, et
      un 403/422 affiche un message localisé.

### Partie 2 — Quittances et vue Paiements du locataire (C2)

- [x] `DocumentPdfController::receipt` : `abort_unless($payment->status === PaymentStatus::Paid, 422, __('payments.receipt_unpaid'))`.
- [x] `rent.blade.php` : date = `paid_at` ; statut libellé en français (« Acquitté »), jamais la valeur
      brute ; ligne « Pénalité de retard » distincte quand `late_fee_amount > 0`, avec « acquittée »
      si `late_fee_paid_at` est posé, sinon « restant due, à régler auprès de l'agence ». Le montant
      acquitté du loyer reste `amount` ; la pénalité ne s'y additionne que si elle est acquittée, sur
      une ligne « Total acquitté » à part.
- [x] `PaymentController::history` : `filter[status]` en liste, et `leaseRow` + `late_fee_amount`,
      `late_fee_outstanding`, `late_fee_payable_online`, `amount_due`.
- [x] Front : vue Paiements dédiée au client seul (`isCustomerOnly`), avec prochaine somme due,
      pénalité non incluse montrée à part, historique en cartes, quittance par échéance payée et onglet
      Reversements masqué. Un profil pro garde la vue actuelle.
- [x] Front : `LeaseSchedule` reste utilisable sur téléphone (« Payer » atteignable sans défilement
      horizontal) et n'offre « Payer » que si `amount_due > 0` (donc jamais pour `paid` ni `refunded`,
      et toujours pour `failed`), plus une quittance par échéance payée. Côté gestionnaire, l'action
      « Pénalité réglée » sur une échéance à `late_fee_outstanding > 0`.
- [x] Tests : `ReceiptPdfTest::test_quittance_refusee_pour_une_echeance_impayee`,
      `ReceiptPdfTest::test_quittance_dit_la_penalite_restant_due` (rendu de la vue), et
      `PaymentHistoryTest` (liste de statuts, `late_fee_amount` et `late_fee_outstanding` présents).

### Partie 3 — Ce qui est dû (C3)

- [x] Migration `add_late_fee_paid_at_to_lease_payments_table` : `late_fee_paid_at` (datetime,
      nullable), `down()` réel. `LeasePayment` : `fillable`, `casts`, et
      `lateFeeOutstanding(): float`.
- [x] `Agency::collectsLateFeesOnline(): bool` = `(bool) data_get($this->settings, 'late_fee_online_collection', false)`.
- [x] `PaymentGatewayService` : `paymentAmount` → `amountDue`. Pour `LeasePayment` :
      `remaining_amount + (collectsLateFeesOnline ? lateFeeOutstanding : 0)`, `0` hors statut payable ;
      inchangé pour `BookingPayment` et `Invoice`. `recordInitiation` fige
      `metadata.gateway_expected_amount` et `metadata.late_fee_included`.
      `assertReportedAmountCoversPayment` compare au montant figé quand il existe, à `amountDue` sinon.
- [x] `PaymentGatewayService::initiate` : garde `payment_not_payable` (409) du point 5 des contraintes,
      **avant** tout appel au pilote.
- [x] `PaymentGatewayService::applyStatusToPayment` : bloc `SUCCESS` — sur un `LeasePayment` dont
      `metadata.late_fee_included` est vrai, poser `late_fee_paid_at` avec `paid_at`. Bloc `FAILED` —
      sur un `LeasePayment`, ne plus écrire `status = failed` ; tracer `metadata.gateway.last_failed_at`.
- [x] Migration `reopen_failed_lease_payments` (données) : `lease_payments.status = 'failed'` →
      `'pending'`, avec le marqueur `metadata.reopened_from_failed_at` ; `down()` restaure les seules
      lignes marquées.
- [x] Route `POST lease-payments/{payment}/late-fee/mark-paid` (`lease-payments.late-fee.mark-paid`),
      `LeasePaymentController::markLateFeePaid`, `MarkLateFeePaidRequest`, autorisée par
      `LeasePaymentPolicy::update` telle quelle *(écart : la règle du `mark-paid` du loyer, sans clause
      locataire — sinon l'AC5 « le locataire → 403 » est inatteignable ; voir Notes)*. Pose `late_fee_paid_at`, journalise
      `late_fee_paid` ; 409 `late_fee_not_due` si `lateFeeOutstanding() <= 0`.
- [x] `LeasePaymentResource` : `amount_due`, `late_fee_outstanding`, `late_fee_paid_at`,
      `late_fee_payable_online`, `receipt_available`.
- [x] `LeasePaymentLateFeeNotification` / `NotifyTenantOfLateFee` : le paramètre
      `late_fee_payable_online` (lu sur l'agence du bail à l'envoi) entre dans `toArray` et choisit
      l'une des deux phrases du point 7 (`notifications.lease_late_fee_applied.pay_online` /
      `.pay_at_agency`).
- [x] Front : `types/lease.ts` aligné champ par champ sur `LeasePaymentResource` (`late_fee` →
      `late_fee_amount`, champs fantômes retirés, nouveaux champs ajoutés), et le sélecteur de
      fournisseur affiche `amount_due` décomposé ; une pénalité non incluse y est rappelée à part.
- [x] Tests :
  - `PaymentGatewayInitiateTest::test_penalite_exclue_quand_l_agence_ne_l_encaisse_pas_en_ligne` ;
  - `…::test_penalite_incluse_quand_l_agence_l_encaisse_en_ligne` ;
  - `…::test_agence_neuve_n_encaisse_pas_la_penalite_en_ligne` ;
  - `…::test_initiation_refusee_sur_une_echeance_deja_payee` (+ `refunded`, + `BookingPayment` payé) ;
  - `…::test_initiation_acceptee_sur_une_echeance_en_echec` ;
  - `…::test_webhook_compare_au_montant_fige_a_l_initiation` ;
  - `PaymentWebhookTest::test_succes_avec_penalite_incluse_pose_late_fee_paid_at` et
    `…::test_echec_en_ligne_laisse_l_echeance_ouverte` ;
  - `LeasePaymentLateFeeMarkPaidTest` (200, 409 `late_fee_not_due`, 403 locataire) ;
  - `LeasePaymentLateFeeNotificationTest` (les deux phrases selon le réglage) ;
  - `LeasePaymentResourceContractTest` (clés exactes de la ressource) ;
  - un test Vitest qui échoue si le type réintroduit `late_fee`.

### Partie 4 — Rapprochement (AD10)

- [x] Migration `add_bank_reconciliation_to_payouts_table` : `bank_reconciled_at`,
      `bank_statement_line_id` (FK `payouts_bank_line_fk`, `nullOnDelete`) et unique partiel
      `payouts_bank_line_unique` `WHERE bank_statement_line_id IS NOT NULL`, avec un `down()` réel.
- [x] Migration `add_parse_outcome_to_bank_statements_table` : `csv_mapping` (jsonb, nullable,
      instantané) et `skipped_lines_count` (unsignedInteger, défaut 0).
      `BankStatementStatus::Failed = 'failed'` (chaîne, pas d'`enum()` SQL, ADR-0007).
- [x] `ReconciliationMatcher` : branche débit → `Payout` `completed`, même agence, même devise,
      `net_amount` exact, fenêtre sur `processed_at`. Côté crédit, le montant comparé à une
      `LeasePayment` est `metadata.gateway_expected_amount` quand il existe, `amount` sinon.
- [x] `ReconciliationManager::ALLOWED_PAYMENT_TYPES`, `BankStatementLineController::PAYMENT_TYPE_MAP`,
      `MatchBankStatementLineRequest` et `PaymentSearchService` : ajouter `payout`, avec une garde de
      sens (crédit ↔ encaissement, débit ↔ reversement, 422 `reconciliation.validation.direction_mismatch`).
- [x] Contrôleur `BankCsvMappingController` (`show`, `update`) + `UpdateBankCsvMappingRequest`
      (colonnes, `has_header`, `date_format`, `delimiter`, `sign_convention`, `direction_column`,
      `decimal_separator` **requis** `in:.,,`, `thousands_separator` `nullable|in:.,,, ,'`),
      autorisés par `BankStatementPolicy::create`. Routes `GET|PUT agencies/{agency}/bank-statements/csv-mapping`.
- [x] `BankStatementController::store` fige `csv_mapping` (mapping effectif de l'agence) sur le relevé,
      et `ParseBankStatementJob` lit cet instantané, puis l'agence en repli.
- [x] `CsvDriver` : `parseAmount` retire U+0020, U+00A0 et U+202F, puis applique les séparateurs
      **déclarés** (`decimal_separator`, `thousands_separator`) ; le défaut du code déclare
      `decimal_separator => ','` (comportement actuel des fichiers à virgule). Toute ligne sautée —
      exception **ou** `return null` (l.64-66) — est comptée et rendue au job.
- [x] `ParseBankStatementJob` : écrit `skipped_lines_count` ; passe `failed` sur exception, et sur un
      fichier dont au moins une ligne est sautée et aucune n'est lue.
- [ ] Journaux sans contenu de relevé (après TCK-601, qui crée `SafeExceptionContext`) :
      → raccord transféré à TCK-601 (ParseBankStatementJob.php:131, CsvDriver.php:70), qui pose
      SafeExceptionContext. *Décision de la session, 2026-10-07 : cette case ne bloque plus le
      passage à `done`. Contexte sûr déjà posé EN LIGNE (classe + `sqlstate`, ni message ni trace
      ni contenu), voir Notes.*
  - `ParseBankStatementJob`, le `catch` (`l.107-114`) :
    `Log::error('bank_statement_parse_failed', ['statement_id' => $this->statementId] + SafeExceptionContext::of($e))`.
    Ni `getMessage()` ni `getTraceAsString()`. La relance (`throw $e`) et le passage en `failed`
    restent ;
  - `CsvDriver`, le `catch` (`l.50-54`) :
    `Log::warning('bank_statement_line_skipped', ['line' => $lineNumber, 'columns' => count($record)] + SafeExceptionContext::of($e))`.
    `record` est retiré ;
  - `CsvDriver.php:70-72` : la date est refusée si `! $postedAt` **ou**
    `$postedAt->format($mapping['date_format']) !== $rawDate` (débordement), par
    `throw new \RuntimeException('Invalid date')`, **sans la valeur**. Sinon, le `message` que
    `SafeExceptionContext` garde pour une exception autre que `QueryException` la réintroduirait.
    La ligne refusée est comptée comme sautée, comme toute autre.
- [x] Front : écran de rapprochement sous les finances de l'agence (réglage du mapping, import,
      relevés, lignes, suggestions, recherche manuelle, ignorer, clôturer), en fr/en/wo.
- [x] Tests :
  - `BankReconciliationTest::test_un_debit_est_suggere_sur_le_reversement_emis` ;
  - `…::test_un_credit_ne_s_apparie_pas_a_un_reversement` ;
  - `…::test_un_reversement_n_est_rapproche_qu_une_fois` ;
  - `…::test_un_credit_penalite_incluse_est_suggere_sur_l_echeance` ;
  - `BankReconciliationCrossAgencyTest` (+ cas `payout`) ;
  - `StatementParserTest` (espace insécable, `150 000`, `150,000` avec `decimal_separator='.'` et
    `thousands_separator=','`, lignes sautées comptées, colonnes introuvables,
    date débordante `31/13/2026` sautée) ;
  - `BankStatementPipelineTest::test_echec_d_analyse_passe_le_releve_en_failed` et
    `…::test_aucune_ligne_lue_passe_le_releve_en_failed` ;
  - `BankStatementPipelineTest::test_le_journal_ne_porte_aucune_valeur_du_releve` (AC19) ;
  - `BankCsvMappingTest` (403 hors admin, 422 sans `decimal_separator`, instantané non ré-interprété).

### Partie 5 — Réglage d'agence (décision du porteur)

- [x] `AgencyUpdateRequest` : `'settings' => ['sometimes', 'array']` (plus `nullable`) et
      `'settings.late_fee_online_collection' => ['sometimes', 'nullable', 'boolean']`.
- [x] `AgencyController::update` : `settings` fusionné avec l'existant —
      `array_replace($agency->settings ?? [], $data['settings'])`, puis retrait des clés valant `null` —
      avant `fill()`. Rien d'autre ne bouge dans la méthode.
- [x] Front : l'écran des paramètres de l'agence porte l'interrupteur, éteint par défaut, avec son
      explication (Direction UX) ; l'enregistrement de l'écran n'envoie que les clés de `settings`
      qu'il gère et n'en efface aucune autre. fr/en/wo.
- [x] Tests :
  - `AgencySettingsMergeTest::test_un_patch_de_settings_n_efface_pas_les_autres_cles` ;
  - `…::test_une_cle_a_null_revient_au_defaut` ;
  - `…::test_settings_null_est_refuse` ;
  - un test Vitest du formulaire : l'interrupteur se lit et s'envoie, et le reste de `settings` n'est
    pas envoyé à vide.

### Partie 6 — Corrections après vérification adverse (ajoutée le 2026-10-07)

Cases ajoutées après la vérification adverse (refus : 1 bloquant, 5 majeurs, 9 mineurs). Détail,
tests et ablations dans les Notes, section « Corrections après vérification adverse ».

- [x] **V1** — montant arrondi à l'unité de la devise (`Currency::decimalPlacesOf`, moitié vers le
      haut) dans `LateFeeCalculator` et `PaymentGatewayService::amountDue`, avant d'être figé et
      transmis (c24d34a6).
- [x] **V2** — un checkout ouvert depuis moins de `payments.checkout_reuse_minutes` (30) est rendu
      au second clic, sous verrou ; un autre fournisseur → 409 ; historique
      `metadata.gateway.transactions[]` cherché par les webhooks ; webhook orphelin journalisé
      (`payment_webhook_unmatched`, identifiants seulement) (57ccbbc2).
- [x] **V3** — encaissement en ligne sur une échéance déjà `paid` : rien n'est soldé,
      `metadata.gateway_duplicate_payment[]` est posé et les admins actifs sont notifiés ;
      `gateway.settled_by` distingue le rejeu du doublon ; `mark-paid` → 409 tant qu'un checkout vit
      (57ccbbc2).
- [x] **V4** — `late-fee/mark-paid` → 409 quand le checkout ouvert inclut la pénalité (57ccbbc2).
- [x] **R1 / R2** — `CsvDriver` : un `.` ou une `,` non déclaré fait sauter la ligne ; le sens par
      colonne reconnaît `debit/débit/d/dr` et `credit/crédit/c/cr`, toute autre valeur fait sauter
      la ligne, montant en `abs()` (0c88313e).
- [x] **R9** — `confirmMatch` refuse un reversement non `completed` (422
      `reconciliation.validation.payout_not_completed`) (630c4bf3).
- [x] **R8** — l'échec d'analyse relance une exception ASSAINIE (classe + SQLSTATE, sans
      `previous`) : ni le rapporteur du worker ni `failed_jobs` ne recopient le relevé. Remplace la
      relance `throw $e` prévue à la Partie 4 (a4bf7271).
- [x] **R6** — un CSV non UTF-8 est refusé à l'import (422 `file_not_utf8`, fr/en/wo) (a4bf7271).
- [x] **V7** — `late-fee/mark-paid` : `paid_at` `before_or_equal:now` (a4bf7271).
- [x] **Preuves renforcées** — AC8 (acompte remboursé intégralement), AC17 (agence sans mapping),
      AC3 (paiement partiel) (f543f433) ; AC18 (détail du relevé) (7a8782ba).
- [x] **Vue client** — pénalité rappelée sur les loyers payés de l'historique, `partially_paid`
      parmi les dus (7a8782ba).

## Critères d'acceptation

- [x] **AC1** — Connecté comme locataire du bail, « Télécharger le contrat » produit un fichier PDF non
      vide, de même pour le reçu d'un acompte payé. Le test front vérifie que la requête vise l'origine
      de l'API avec le Bearer : il **rougit** si on remet le lien relatif.
- [x] **AC2** — `GET /api/leases/{l}/receipts/{p}/pdf` sur une échéance `pending` → **422**, alors que
      le même appel sur une échéance `paid` rend un PDF. Ce test rougit sur le code actuel (200 sur
      `pending`) et redevient rouge si la garde est retirée.
- [x] **AC3 — même échéance, deux réglages.** Échéance de 150 000 XOF, `late_fee_amount = 7 500`,
      `late_fee_paid_at = NULL`, statut `late` :
      - réglage **désactivé** : `initiate` transmet au pilote Wave **15 000 000** (150 000 ×100),
        `amount_due = 150000`, `late_fee_outstanding = 7500`, `late_fee_payable_online = false` dans la
        ressource et l'historique ;
      - réglage **activé** : le pilote reçoit **15 750 000** (157 500 ×100), `amount_due = 157500`,
        `late_fee_payable_online = true`.
      Le cas activé rougit sur le code actuel (150 000), le cas désactivé aussi (`late_fee_outstanding`
      absent). Retirer la lecture du réglage fait rougir l'un des deux.
- [x] **AC4 — défaut d'une agence neuve.** Une agence créée par `POST /api/agencies` n'a pas la clé
      `late_fee_online_collection` et `collectsLateFeesOnline()` vaut `false` ; sur un bail de cette
      agence, l'échéance de l'AC3 s'initie à **150 000**. L'écran des paramètres de cette agence montre
      l'interrupteur éteint.
- [x] **AC5 — statut après paiement, réglage désactivé.** Sur l'échéance de l'AC3, réglage désactivé, un
      webhook `success` de 150 000 laisse : `status = paid`, `paid_at` posé, `late_fee_amount = 7500`,
      `late_fee_paid_at = NULL`, `late_fee_outstanding = 7500`. La quittance rendue contient « restant
      due » et « 7 500 » sur la ligne de pénalité, et le loyer acquitté vaut 150 000. Puis
      `POST /api/lease-payments/{p}/late-fee/mark-paid` par l'agent → 200, `late_fee_paid_at` posé,
      `status` toujours `paid` ; un second appel → **409** `late_fee_not_due` ; le locataire → 403.
- [x] **AC6 — statut après paiement, réglage activé.** Même échéance, réglage activé : un webhook
      `success` de 157 500 laisse `status = paid` **et** `late_fee_paid_at` posé, `late_fee_outstanding
      = 0` ; la quittance dit la pénalité « acquittée ». Un webhook de 150 000 sur ce checkout est
      refusé (422 de sous-paiement).
- [x] **AC7 — montant figé.** Un checkout est ouvert à 150 000 (réglage activé) **avant**
      l'application de la pénalité, et son webhook `success` de 150 000 arrive **après**
      (`late_fee_amount` vaut alors 7 500) : l'échéance est soldée sans 422, puisque la comparaison
      porte sur le montant figé ; `late_fee_paid_at` reste `NULL` (`late_fee_included = false`). Un
      webhook de 140 000 sur ce même checkout reste refusé. De même, désactiver le réglage après
      l'ouverture d'un checkout à 157 500 ne fait pas refuser un webhook de 157 500.
- [x] **AC8 — on ne paie pas deux fois.** `initiate` sur une échéance `paid` → **409**
      `payment_not_payable`, idem `refunded` et `BookingPayment` `paid`, avec **zéro** appel au pilote
      (pilote simulé). Sur une échéance `failed`, `initiate` répond 200. Rouge sur le code actuel
      (200 sur `paid`).
- [x] **AC9 — un échec ne fige pas l'échéance.** Une échéance `late` reçoit un webhook `failed` : elle
      reste `late`, `metadata.gateway.last_failed_at` est posé, et `POST lease-payments/{p}/mark-paid`
      réussit ensuite (200). Rouge sur le code actuel (`status = failed`, puis 422). Après la
      migration, une ligne `failed` existante est `pending` et `ApplyLateFeesJob` la pénalise si elle
      est en retard.
- [x] **AC10 — notification = écran.** À l'application d'une pénalité, la notification du locataire
      (`toArray`) porte `late_fee_payable_online` égal à celui de la ressource de la même échéance, et
      son courriel contient la phrase « à régler auprès de votre agence » quand le réglage est
      désactivé, « ajoutée au montant de votre paiement en ligne » quand il est activé.
- [x] **AC11 — un réglage n'en efface aucun autre.** Agence avec `settings = {watermark_enabled: false,
      timezone: 'Africa/Dakar'}` : `PATCH /api/agencies/{a}` avec
      `settings = {late_fee_online_collection: true}` → `watermark_enabled` vaut toujours `false` et
      `timezone` est conservé. Rouge sur le code actuel (clés effacées, filigrane réactivé). Un
      `settings.late_fee_online_collection = null` retire la clé ; `settings: null` → 422.
- [x] **AC12** — `types/lease.ts` ne contient plus `late_fee:`. Une échéance à `late_fee_amount = 7500`
      affiche « +7 500 FCFA » *(rendu réel : « +7 500 F CFA », format `Intl`)* dans l'échéancier, vérifié sur la valeur rendue et pas seulement sur la
      présence d'un nœud. Avec `late_fee_payable_online = false`, le montant du bouton de paiement vaut
      150 000 et la pénalité figure à part avec « à régler auprès de l'agence ».
- [x] **AC13** — Un compte client seul ne voit pas d'onglet Reversements sur `/app/payments`, et voit en
      tête la prochaine somme due avec l'action de paiement. Un admin d'agence voit toujours les trois
      onglets. Sur une largeur de 360 px, « Payer » et « Quittance PDF » sont atteignables sans
      défilement horizontal (`scrollWidth === clientWidth` sur le conteneur de la liste). « Payer »
      n'apparaît pas pour une échéance `refunded`.
- [x] **AC14** — Un relevé contenant un débit de 285 000 XOF à J+1 d'un `Payout` `completed` de
      `net_amount = 285 000` de la même agence produit une suggestion `payout` de confiance ≥ 70.
      Confirmer pose `bank_reconciled_at` sur le reversement, et une seconde ligne ne peut plus s'y
      apparier (422, index unique). Un `Payout` d'une autre agence n'est jamais proposé (403 en
      confirmation forcée). Un crédit de 157 500 est suggéré sur l'échéance de l'AC6.
- [x] **AC15** — Un crédit ne peut pas être confirmé sur un `Payout`, ni un débit sur une `LeasePayment`
      (422 `direction_mismatch`).
- [x] **AC16** — Un CSV dont un montant vaut `150 000` (espace insécable) donne une ligne à 150 000, et
      non 150. Avec `decimal_separator = '.'` et `thousands_separator = ','`, `150,000` donne 150 000.
      Un fichier à 10 lignes dont 2 illisibles finit `ready_for_review` avec `lines_count = 8` et
      `skipped_lines_count = 2`. Un fichier de 5 lignes dont les colonnes ne portent pas les noms du
      mapping finit `failed` avec `skipped_lines_count = 5` (rouge sur le code actuel :
      `ready_for_review`, 0 ligne). Un fichier qui fait lever le parseur finit `failed`. Une ligne
      datée `31/13/2026` (format `d/m/Y`) est sautée et comptée. Le code actuel l'importe au
      `2027-01-31`, et le test rougit si l'on retire la comparaison `format() !== $rawDate`.
- [x] **AC17** — `PUT csv-mapping` sans `decimal_separator` → 422. Un relevé importé garde son
      `csv_mapping` ; modifier ensuite le mapping de l'agence ne change pas `csv_mapping` sur ce relevé.
      Un agent (non admin) reçoit 403 sur `PUT csv-mapping`.
- [x] **AC18** — L'écran de rapprochement permet, à un admin d'agence, de régler le mapping puis
      d'importer un CSV ; un relevé `failed` ou à lignes ignorées affiche leur nombre (test Vitest sur la
      valeur rendue).
- [x] **AC19 — aucune valeur témoin de la ligne dans le journal.** `Log::spy()` (ou un écouteur
      `MessageLogged`) capte message **et** contexte, sérialisés, de tout ce que journalise
      l'analyse. Deux fichiers sont importés :
      - un CSV avec, parmi des lignes lisibles, une ligne à la date non numérique `JJ/01/2026` et au
        libellé `LIBELLE-TEMOIN-4417`, et une ligne à la date `31/13/2026` : le journal porte deux
        entrées `bank_statement_line_skipped` avec `line` et `columns`, et ne contient **ni**
        `LIBELLE-TEMOIN-4417`, **ni** `JJ/01/2026`, **ni** `31/13/2026` ;
      - un CSV dont une ligne lisible porte le libellé `LIBELLE-TEMOIN-8823` et une contrepartie de
        300 caractères commençant par `CONTREPARTIE-TEMOIN-` : l'insertion lève `SQLSTATE[22001]` et
        le relevé passe `failed`. Le journal contient `sqlstate = 22001` et `statement_id`, et
        **aucun** des deux témoins.
      Rouge sur le code actuel : dans le premier cas, `record` porte `LIBELLE-TEMOIN-4417` ; dans le
      second, les bindings de la `QueryException` portent les deux témoins. Le test redevient rouge
      si l'on remet `getMessage()` dans l'un ou l'autre `catch`, si l'on remet `record`, ou si l'on
      remet la valeur dans le message de `l.71` (`31/13/2026` réapparaît).
      *Vérifié : `BankStatementPipelineTest::test_le_journal_ne_porte_aucune_valeur_du_releve`. Rouge
      avec `getMessage()` dans le job, avec `record`, et avec `getMessage()` + la valeur dans
      `CsvDriver` ; chacune de ces deux dernières SEULE reste verte, puisque l'autre défense suffit
      (voir Notes).*

- [x] **AC20 (ajouté après vérification adverse, V1)** — une pénalité fractionnaire calculée par le
      vrai calculateur (base 150 000 − 33 333) est demandée, figée et encaissée au même montant
      entier : le webhook Wave de ce montant rend 200 et l'échéance passe `paid`.
      *Vérifié : `PaymentWebhookTest::test_une_penalite_fractionnaire_est_encaissee_au_montant_demande`
      et deux voisins ; rouge sans l'arrondi (3 ablations).*
- [x] **AC21 (ajouté après vérification adverse, V2)** — un double clic n'ouvre qu'un checkout ; le
      webhook d'un checkout antérieur retrouve son échéance ; un webhook sans échéance laisse une
      trace sans donnée personnelle.
      *Vérifié : `PaymentCheckoutReuseTest` (4 tests) ; rouge sans la réutilisation, sans
      l'historique, sans le journal de l'orphelin.*
- [x] **AC22 (ajouté après vérification adverse, V3/V4)** — un second encaissement est marqué et
      signalé aux admins, jamais avalé ; la vérification forcée du même règlement n'est pas un
      doublon ; espèces et pénalité à l'agence → 409 tant qu'un checkout vit.
      *Vérifié : `PaymentCheckoutReuseTest` (5 tests) ; rouge sans la marque, la notification,
      `settled_by`, les deux gardes 409.*
- [x] **AC23 (ajouté après vérification adverse, R1/R2/R6)** — un séparateur non déclaré et un sens
      inconnu font sauter la ligne ; un CSV latin-1 est refusé à l'import par un 422 localisé.
      *Vérifié : `StatementParserTest` (2 tests), `BankStatementPipelineTest::test_un_csv_qui_n_est_pas_en_utf8_est_refuse_a_l_import` ;
      rouges sous ablation.*
- [x] **AC24 (ajouté après vérification adverse, R9)** — un reversement non émis n'est ni suggéré ni
      confirmable ; un reversement hors fenêtre n'est pas suggéré.
      *Vérifié : `BankReconciliationTest` (2 tests) ; ablations AC14a, AC14b et garde → rouges.*
- [x] **AC25 (ajouté après vérification adverse, R8/V7)** — l'exception relancée par l'analyse, passée
      à `report()` comme le fait le worker, ne porte aucun témoin du relevé, ni dans le journal ni
      dans `(string) $e` ; une date de règlement de pénalité future → 422.
      *Vérifié : `BankStatementPipelineTest::test_l_exception_relancee_ne_recopie_pas_le_releve`
      (3 ablations rouges), `LeasePaymentLateFeeMarkPaidTest::test_une_date_de_reglement_future_est_refusee`.*
- [x] **AC26 (ajouté après vérification adverse, preuves)** — les ablations AC3b, AC8a, AC17a et
      AC18b, vertes à la vérification, rougissent ; la pénalité d'un loyer payé reste visible au
      locataire.
      *Vérifié : `LeasePaymentResourceContractTest::test_une_echeance_payee_en_partie_ne_demande_que_son_reste`,
      `PaymentGatewayInitiateTest::test_initiation_refusee_sur_une_echeance_deja_payee`,
      `BankCsvMappingTest::test_une_agence_sans_mapping_fige_le_defaut_effectif`,
      `rapprochement.test.tsx`, `CustomerPayments.test.tsx`.*

## Hors périmètre

- Les préréglages de colonnes Wave Business et Orange Money, la lecture XLSX, et la question du
  montant brut ou net des frais marchands : dette **D-67**, sur décision du porteur (2026-10-06),
  jusqu'à la remise d'un export réel de chaque fournisseur.
- Plusieurs mappings par agence (banque, Wave, Orange Money) : suit D-67.
- Le paiement sans compte (`/pay/{token}`), le journal et le rejeu des webhooks : TCK-602, après
  TCK-293. Le cloisonnement du secret de webhook par agence : TCK-293.
- **Option retenue par défaut (non tranchée)** : la remise (abandon) d'une pénalité par l'agent n'est
  pas livrée ici, et le `mark-paid` du loyer ne dit rien de la pénalité (elle se règle par sa propre
  action, Partie 3).
- Le paiement en ligne d'une pénalité seule, sur une échéance dont le loyer est déjà payé.
- Les actions sur un reversement (`PayoutDetailDialog`), son calcul et ses quatre yeux :
  TCK-587 / TCK-594.
- La prose des notifications de paiement et de pénalité : TCK-588. Le tableau de bord locataire : TCK-595.
- **Option retenue par défaut (non tranchée)** : un compte à la fois bailleur et locataire garde la vue
  Paiements gestionnaire, et ses quittances restent accessibles depuis le détail du bail.
- La connexion directe aux API Wave et Orange Money (relevés tirés automatiquement).
- Les écritures comptables (journaux, FEC) : ticket de suite (fonctionnalité, pas un défaut).

## Notes d'implémentation

### Partie 5 — réglage d'agence (back), 2026-10-07

- Re-mesuré : `AgencyController::update` faisait bien `fill($request->validated())` sans fusion,
  et `AgencyUpdateRequest` portait `'settings' => ['sometimes', 'nullable', 'array']`. Conforme au
  ticket.
- `php artisan test tests/Feature/Api/Agency/AgencySettingsMergeTest.php` → 5 verts (19 assertions).
  Ablations : fusion retirée (`if (false)`) → `test_un_patch_de_settings_n_efface_pas_les_autres_cles`
  et `test_une_cle_a_null_revient_au_defaut` rouges ; `nullable` remis → `test_settings_null_est_refuse`
  rouge. Rendues, 5 verts.
- Voisins rejoués : `AgencyTest`, `AgencyCurrencyUpdateTest` (17 verts), `WatermarkActivationTest`,
  `WatermarkTraceDuringRegenerationTest` (17 verts).

### Partie 3 — ce qui est dû (back), 2026-10-07

- Re-mesuré : `paymentAmount` rendait `amount` seul (l.556-561), `initiate` n'avait aucune garde de
  statut, la branche `FAILED` écrivait `failed` sur tout payable. Conforme au ticket.
- **Écart au ticket — autorisation de la route de pénalité.** Le ticket demande
  `LeasePaymentPolicy::update` « telle quelle », or elle admet le LOCATAIRE (c'est elle qui ouvre son
  checkout) : l'AC5 « le locataire → 403 » était inatteignable. `MarkLateFeePaidRequest::authorize`
  délègue donc à la même règle que le `mark-paid` du loyer (`can('update', $payment->lease)`, sans
  clause locataire). Quand TCK-587 fusionne, `MarkPaidLeasePaymentRequest` passe à `recordPayment` :
  aligner `MarkLateFeePaidRequest` sur lui à ce moment-là.
- Garde `payment_not_payable` posée en tête d'`initiate`, avant même la résolution de l'intégration ;
  un montant dû nul rend aussi 409 (et non plus 422 « non-positive amount »).
- `lateFeeIncluded()` est la seule lecture du réglage : `amountDue`, la ressource, la notification et
  le figeage `metadata.late_fee_included` l'appellent.
- Tests (exécutions nommées) : `PaymentGatewayInitiateTest` 13 verts, `PaymentWebhookTest` 11,
  `LeasePaymentLateFeeMarkPaidTest` 6, `LeasePaymentLateFeeNotificationTest` 5,
  `LeasePaymentResourceContractTest` 5, `ReopenFailedLeasePaymentsMigrationTest` 2. Voisins :
  `PaymentGatewaySchemaContractTest`, `PaymentGatewayVerifyTest`, `PaymentAmountScaleTest`,
  `PaymentDriverTest`, `PaymentWebhookMultiTenantTest`, `PaymentStatusTransitionTest`,
  `PaymentHistoryTest`, `ApplyLateFeesJobTest`, `PaymentRegistrationTest`, `BookingPaymentTest`,
  `LateFeeCalculatorTest` → 82 verts, 2 sautés (préexistants, `PaymentWebhookMultiTenantTest:129`).
- Ablations (chacune rejouée puis rendue) : garde d'initiation retirée → `test_initiation_refusee_…`
  rouge (AC8) ; `FAILED` réécrit `failed` → `test_echec_en_ligne_…` rouge (AC9) ; réglage jamais lu
  (`&& false`) → 4 rouges dont `test_penalite_incluse_…` ; réglage toujours vrai → 3 rouges dont
  `test_penalite_exclue_…` et `test_agence_neuve_…` (AC3/AC4) ; comparaison au montant figé retirée →
  `test_webhook_compare_au_montant_fige_…` rouge (AC7) ; `late_fee_paid_at` non posé → 2 rouges
  (AC6) ; autorisation par `LeasePaymentPolicy::update` → `test_le_locataire_recoit_403` rouge (AC5).

### Partie 2 — quittances et historique (back), 2026-10-07

- Re-mesuré : `DocumentPdfController::receipt` sans contrôle de statut, gabarit daté de
  `paid_at ?? due_date`, statut brut affiché. Conforme.
- `ReceiptPdfTest` 7 verts : `test_quittance_refusee_pour_une_echeance_impayee` (422 sur `pending`,
  `late`, `failed`, `partially_paid` ; PDF sur `paid`), `test_quittance_dit_la_penalite_restant_due`,
  `test_quittance_dit_la_penalite_acquittee`. Le contenu se lit sur le HTML du gabarit, rendu avec
  les données que la VRAIE route lui a passées (capturées par `View::composer`) : le texte d'un PDF
  compressé ne se lit pas. Ablations : garde retirée → `…_impayee` rouge ; ligne de pénalité forcée à
  « acquittée » → `…_restant_due` rouge.
- `PaymentHistoryTest` 11 verts (`test_filtre_de_statut_en_liste`,
  `test_l_historique_porte_la_penalite_et_le_montant_du`). Voisins `PaymentRegistrationTest`,
  `PaymentReceiptPdfTest` verts.


### Partie 4 — rapprochement (back), 2026-10-07

- Re-mesuré : `ReconciliationMatcher::suggestFor` rendait `null` sur tout débit ; `CsvDriver`
  journalisait `record` et `getMessage()`, devinait le séparateur décimal, n'ôtait que l'espace
  ASCII et acceptait `31/13/2026` ; le `catch` du job journalisait message et trace et laissait le
  relevé `processing`. Conforme au ticket.
- **SafeExceptionContext (TCK-601) n'existe pas encore sur la branche** (`grep -rn SafeExceptionContext
  takussan-api/app` → 0). Les deux `catch` portent un contexte sûr EN LIGNE — classe de l'exception,
  plus `sqlstate` (et le point de levée) côté job — sans `getMessage()` ni trace, avec le commentaire
  « Raccord TCK-601 » à l'endroit exact où `SafeExceptionContext::of($e)` le remplacera :
  `takussan-api/app/Jobs/Accounting/ParseBankStatementJob.php:131` et
  `takussan-api/app/Services/Accounting/StatementParser/CsvDriver.php:70`. La case « Journaux » reste
  ouverte (accord de la session, 2026-10-07) : elle nomme une API qui n'existe pas, et 601 fera le
  branchement.
- Le message de la date refusée est `Invalid date`, sans la valeur, et l'exception Carbon d'un texte
  non numérique est ramenée à ce même message (`createFromFormat` dans un `try`).
- **Deux ajouts hors de la lettre du ticket, chacun sur un défaut mesuré en cours de route :**
  - *le ré-import d'un relevé `failed`* : l'index unique `(agency_id, file_hash)` rendait 422 au
    même fichier une fois le mapping corrigé — `failed` était une impasse. Un relevé `failed` n'a
    jamais de ligne (l'insertion est transactionnelle, et le job ne passe `failed` qu'un relevé
    encore `processing`) : `store` le supprime et ré-importe. Un relevé lu bloque toujours le
    doublon (`test_un_releve_failed_se_reimporte_une_fois_le_mapping_corrige`) ;
  - *le trim global* : `TrimStrings` + `ConvertEmptyStringsToNull` réduisaient le délimiteur `"\t"`
    et le séparateur `' '` à `null` — un export tabulé était impossible à déclarer, alors que l'écran
    le propose. `PUT csv-mapping` en est exempté dans `bootstrap/app.php`, sur le patron du
    brouillon de TCK-574 (`UpdateBankCsvMappingRequest::estEcritureDeMapping`), et `delimiter` est
    `present` et non `required` (qui tient une chaîne blanche pour vide).
- `BankStatementLineFactory` : `direction` vaut `credit` au lieu d'un tirage au sort. Avec la garde
  de sens, `BankReconciliationTest::test_confirm_match_on_line` et `confirmedPair()` d'Unmatch
  auraient rendu 422 une fois sur deux.
- `PaymentSearchService::search` prend `direction` (`?direction=debit|credit`, celle qu'envoie
  l'écran) : débit → reversements seuls, crédit → encaissements seuls, absent → les deux.
- Tests (exécutions nommées) :
  - `php artisan test tests/Feature/Api/Accounting tests/Unit/Services/Accounting` → **65 verts**
    (277 assertions) : `BankReconciliationTest` 13 (dont `test_un_debit_est_suggere_sur_le_reversement_emis`,
    `test_un_reversement_n_est_rapproche_qu_une_fois`, `test_un_credit_ne_s_apparie_pas_a_un_reversement`,
    `test_la_recherche_manuelle_suit_le_sens_de_la_ligne`, `test_un_credit_penalite_incluse_est_suggere_sur_l_echeance`),
    `BankReconciliationCrossAgencyTest` 9 (dont `test_a_payout_of_another_agency_is_never_suggested_nor_matched`),
    `BankReconciliationUnmatchTest`, `BankStatementPipelineTest` 16 (dont
    `test_dix_lignes_dont_deux_illisibles_…`, `test_aucune_ligne_lue_passe_le_releve_en_failed`,
    `test_echec_d_analyse_passe_le_releve_en_failed`, `test_le_journal_ne_porte_aucune_valeur_du_releve`),
    `BankCsvMappingTest` 7, `PaymentSearchTest`, `StatementParserTest` 9 ;
  - `tests/Feature/Database/BankReconciliationSchemaMigrationsTest.php` → 2 verts : `down()` puis
    `up()` des deux migrations (colonnes, index partiel `payouts_bank_line_unique`, `jsonb`) ;
  - voisins : les 24 classes qui touchent `Payout`, `payouts`, `WizardDraft` ou le trim → 257 verts.
- Ablations (chacune appliquée par `perl`, jouée, rendue — `scratchpad/t593/ablate.sh`) :
  - débit ignoré de nouveau → `test_un_debit_est_suggere_…` rouge (AC14) ;
  - montant comparé sur `amount` seul → `test_un_credit_penalite_incluse_…` rouge (AC14) ;
  - filtre d'agence retiré des reversements → `test_a_payout_of_another_agency_…` rouge (AC14) ;
  - `whereNull('bank_reconciled_at')` retiré → `test_un_reversement_n_est_rapproche_qu_une_fois` rouge ;
  - garde de sens neutralisée → `test_un_credit_ne_s_apparie_pas_a_un_reversement` rouge (AC15) ;
  - recherche sans filtre de sens → `test_la_recherche_manuelle_…` rouge ;
  - U+00A0 non retiré → `test_un_espace_insecable_…` rouge ; séparateur de milliers déclaré ignoré →
    `test_150_000_…` rouge ; `tally->skip()` retiré → 2 rouges ; bloc « aucune ligne lue » retiré →
    `test_aucune_ligne_lue_…` rouge ; `failed` du `catch` retiré → `test_echec_d_analyse_…` rouge ;
    comparaison `format() !== $rawDate` retirée → `test_une_date_debordante_…` ET
    `test_dix_lignes_…` rouges (AC16) ;
  - `csv_mapping` non figé à l'import → `test_le_mapping_fige_…` rouge ; job lisant le mapping de
    l'agence au lieu de l'instantané → même test rouge (après ajout de l'analyse jouée APRÈS le
    changement : sans elle, cette ablation restait verte) ; `decimal_separator` `nullable` →
    `test_sans_decimal_separator_…` rouge ; `authorize` retiré de `update` → 2 rouges ; exemption du
    trim retirée → `test_la_tabulation_…` rouge (AC17) ;
  - AC19 : `getMessage()` remis dans le `catch` du job → rouge ; `record` remis dans `CsvDriver` →
    rouge ; `getMessage()` ET la valeur dans le message de la date → rouge.
    **Deux ablations restent vertes, et c'est attendu** : `getMessage()` seul dans `CsvDriver` (les
    messages n'y portent plus aucune valeur), et la valeur seule dans le message de la date (le
    message n'est plus journalisé). Chacune des deux défenses suffit seule ; le test rougit dès que
    les deux tombent. La trace remise dans le job reste verte aussi : PHP y rend les tableaux de
    liaison en `Array` et tronque les chaînes à 15 caractères — ce n'est pas une garde que ce test
    porte.

### Front (Parties 1 à 5), 2026-10-07 — repris des notes de l'agent front

- `39dc1ec2` (Parties 1 et 3, échéancier) : liens relatifs re-mesurés à `LeaseDetail.tsx:218` et
  `BookingDetail.tsx:364`. Mécanique unique `src/hooks/useTelechargementApi.ts` +
  `src/components/documents/BoutonTelechargement.tsx` (origine de l'API, Bearer, `Accept-Language`,
  blob) ; 401/403 → « interdit », 404/409/422 → « indisponible », jamais la prose serveur.
  Échéancier : table → liste, plus aucun `overflow-x`. **Écart d'affichage (AC12)** : `Intl` rend
  « +7 500 F CFA », et non « FCFA » ; les tests assertent la valeur réellement rendue. Ablations
  rouges : fetch relatif, Bearer retiré, `<Link>`/`<a>` relatifs restaurés, 403 non catégorisé,
  `late_fee:` réintroduit, total additionné côté client, « Payer » sur `status !== 'paid'`,
  « Pénalité réglée » sans `canManage`.
- `c3701daa` (Partie 5) : `settings` porte toujours `late_fee_online_collection` ; interrupteur
  `<input type="checkbox" role="switch">`. Ablations rouges : défaut lu `!== false`, clé non
  envoyée, `settings` ré-étalé.
- `9fc5b0c5` (Partie 2, vue client) : **écart back mesuré** — `GET /api/integrations` rend 403 à tout
  non-admin (`IntegrationController.php:22`) : « Payer » n'apparaissait jamais au locataire. Le
  front traite ce 403 comme « fournisseurs inconnus » (filtre par devise seule) ; un fournisseur
  absent de l'agence n'est refusé qu'à l'initiation. Ablations rouges : vue toujours en onglets /
  toujours client, montant `amount + late_fee_amount`, filtre de statut retiré, quittance sur
  toute ligne, rappel de pénalité retiré, 403 → `[]`.
- `ed4b626d` (Partie 4, écran) : `/admin/finances/reconciliation` et `/[statementId]`. Construit
  contre le contrat avant le back ; **re-vérifié contre le back réel** après `c2e1f6cd` : les
  colonnes reviennent en entier ou en chaîne telles qu'envoyées, `match_confidence` est un entier
  60–95 (échelle 0–100, prévue), `direction` est bien lu par la recherche, la tabulation passe.
  Écran chargé au navigateur contre l'API (`GET bank-statements` et `GET csv-mapping` servis).

### Mesures au navigateur (AC13), 2026-10-07

- Base isolée `takussan_t593` (créée puis supprimée), `migrate:fresh --seed`, API sur 8108, Next sur
  3108, Chrome sans tête sur 9348 piloté par CDP direct (`scratchpad/t593/measure.mjs`), session
  vidée avant chaque connexion. Locataire `khady-thiam-bptj@example.org` (5 échéances `late`),
  locale `fr`, émulation mobile :
  - 360 px — `/app/payments` : `innerWidth` 360, `scrollWidth` du document 360, listes 294/294 et
    328/328, 21 actions « Payer … » / « Quittance PDF », 0 hors de l'écran, aucun onglet ;
    `/app/leases/2` : liste « Échéances du bail » 326/326, 14 actions, 0 hors de l'écran ;
  - 390 px — mêmes pages : 324/324, 358/358 et 356/356, 0 action hors de l'écran.
  - Admin d'agence `admin@dakarimmo.sn`, 360 et 390 px : onglets Historique, Factures,
    Reversements ; document 360/390.
- Exécutions nommées de la session de ce ticket : `npx vitest run` sur les 13 chemins du ticket →
  43 fichiers, **200 verts** ; `npm run lint`, `npx tsc --noEmit`, `npm run check:i18n` → 0 ;
  gardes racine `scripts/check-*.mjs` → toutes vertes ;
  `LeaseContractPdfTest::test_le_locataire_du_bail_telecharge_son_contrat` (AC1, ajouté) et
  `BookingPaymentTest --filter=receipt` → verts.
- **Suites entières : non lancées — lancées par la session.**


### Corrections après vérification adverse (VERIF-593, refusé : 1 bloquant, 5 majeurs, 9 mineurs), 2026-10-07

- **V1 (bloquant) — montant fractionnaire.** Repro reproduite : pénalité 7 500,05, pilote à
  157 501, montant figé 157 501,05, webhook 422. Correctif : la pénalité est arrondie à l'unité de la
  devise dès `LateFeeCalculator::compute` (plafond compris), et `PaymentGatewayService::amountDue`
  arrondit aussi avant de figer et de transmettre (`Currency::decimalPlacesOf`, XOF/XAF : 0) ; mode
  `PHP_ROUND_HALF_UP` écrit dans le code. Tests (`PaymentWebhookTest`) :
  `test_une_penalite_fractionnaire_est_encaissee_au_montant_demande` (vrai calculateur, base
  150 000 − 33 333 → 5 833 ; initiation 12 250 000 ; webhook 122 500 → 200, `paid`),
  `test_une_penalite_fractionnaire_deja_enregistree_est_arrondie_au_montant_du` (7 500,05 en base →
  157 500), `test_la_penalite_est_arrondie_a_l_unite_la_moitie_vers_le_haut` (7 500,5 → 7 501 ;
  7 500,45 → 7 500). Ablations : arrondi du calculateur retiré → 2 rouges ; arrondi d'`amountDue`
  retiré → 1 rouge ; `HALF_DOWN` → 1 rouge. Voisins (15 classes : passerelle, pénalités, ressources,
  historique) → 95 verts, 2 sautés préexistants.
- **R1 (majeur) — séparateur non déclaré.** Après retrait du séparateur de milliers déclaré, un
  `.` ou une `,` qui n'est pas le séparateur décimal déclaré fait sauter et compter la ligne
  (`150.000` au mapping par défaut était lu 150). Test
  `StatementParserTest::test_un_point_non_declare_n_est_pas_lu_comme_decimale`. Ablation (contrôle
  retiré) → rouge.
- **R2 (majeur) — `direction_column`.** `parseDirection` reconnaît `debit/débit/d/dr` et
  `credit/crédit/c/cr` (casse et accents ignorés) ; toute autre valeur, vide comprise, saute et
  compte la ligne ; le montant passe par `abs()`. Test
  `test_le_sens_par_colonne_reconnait_les_valeurs_francaises_et_saute_les_autres`. Ablations :
  `d`/`dr` retirés → rouge ; défaut « crédit » rétabli → rouge ; `abs()` retiré de cette branche →
  rouge (la première forme visait par erreur la branche `amount_signed` et restait verte : rejouée
  sur la bonne). `tests/Feature/Api/Accounting` + `tests/Unit/Services/Accounting` → 67 verts.
- **R9 (majeur) — reversement non émis.** `confirmMatch` refuse un `Payout` autre que `completed`
  (422, `reconciliation.validation.payout_not_completed`, fr/en/wo). Tests
  `BankReconciliationTest::test_un_reversement_non_emis_n_est_ni_suggere_ni_confirmable`
  (`pending`, `failed`, `cancelled`) et `test_un_reversement_hors_fenetre_n_est_pas_suggere`.
  Ablations AC14a (statut non filtré au matcher) → rouge, AC14b (fenêtre retirée) → rouge, garde de
  `confirmMatch` retirée → rouge. `tests/Feature/Api/Accounting` → 58 verts.
- **V2 (majeur) — deux checkouts sur la même échéance.** `initiate` s'exécute sous `lockForUpdate`
  de la ligne ; un checkout ouvert depuis moins de `config('payments.checkout_reuse_minutes')`
  (30, durée de vie d'une session Wave ; `config/payments.php`) et sans échec rapporté depuis est
  RENDU tel quel. Chez un autre fournisseur, il est refusé en 409 `payments.checkout_in_progress`,
  puisque deux checkouts ouverts permettent deux encaissements. Chaque initiation s'ajoute à
  `metadata.gateway.transactions[]` (`transaction_id`, `provider`, `amount`, `late_fee_included`,
  `initiated_at`). `paymentsForEvent` y cherche l'identifiant quand `transaction_id` ne le porte
  plus, et le montant figé comparé est celui DE CE checkout (`initiationFor`). Un webhook sans
  payable journalise `payment_webhook_unmatched` (`provider`, `transaction_id`, `type` seulement).
  Tests (`PaymentCheckoutReuseTest`) : `test_un_double_clic_rend_le_meme_checkout`,
  `test_un_autre_fournisseur_est_refuse_tant_que_le_checkout_vit`,
  `test_un_checkout_expire_ou_en_echec_n_est_plus_reutilise`,
  `test_le_webhook_d_un_checkout_anterieur_retrouve_son_echeance`,
  `test_un_webhook_sans_echeance_laisse_une_trace_sans_donnee_personnelle`. Ablations : réutilisation
  retirée → 2 rouges ; recherche dans l'historique retirée → 2 rouges ; journal de l'orphelin
  retiré → rouge. Le verrou n'a pas d'ablation : il faudrait deux requêtes réellement simultanées,
  ce qu'aucun test du dépôt ne sait produire.
- **V3 (majeur) — espèces puis webhook.** Dans le bloc `SUCCESS`, une échéance déjà `paid` n'est
  soldée de rien. Si elle n'a pas été soldée par CE règlement (`metadata.gateway.settled_by`, ou
  un événement `paid` déjà journalisé), `metadata.gateway_duplicate_payment[]` reçoit
  `{transaction_id, amount, at}` et les admins actifs de l'agence (admin principal et profils
  d'admin actifs) sont prévenus par `NotificationService::notifyMany`, sous la clé
  `payments.duplicate_payment.*` (fr/en/wo). `LeasePaymentService::markPaid` rend 409
  `checkout_in_progress` tant qu'un checkout vit. Tests :
  `test_le_second_checkout_paye_est_marque_double_encaissement_et_signale`,
  `test_especes_refusees_tant_que_le_checkout_vit_puis_doublon_marque`,
  `test_la_verification_forcee_du_meme_reglement_n_est_pas_un_doublon`. Ablations : branche du
  doublon retirée → 2 rouges ; notification retirée → rouge ; garde de `mark-paid` retirée →
  rouge ; `settled_by` ignoré → rouge (sur la vérification forcée ; un rejeu de webhook est déjà
  dédoublonné par `gateway_events`).
- **V4 (mineur 3) — pénalité réglée deux fois.** `LateFeeSettlement::markPaid` rend 409
  `checkout_in_progress` quand le checkout ouvert inclut la pénalité. Test
  `test_la_penalite_incluse_dans_un_checkout_ouvert_ne_se_regle_pas_a_l_agence` ; le témoin
  (checkout sans pénalité) reste à 200. Ablation → rouge.
- Les 16 classes qui touchent la passerelle, `mark-paid` ou les webhooks → 131 verts, 2 sautés
  préexistants.
- **R8 (mineur 1) — la relance du job recopiait le relevé.** `ParseBankStatementJob` relance une
  `RuntimeException` ASSAINIE (identifiant du relevé, classe d'origine, SQLSTATE), **sans**
  `previous` : le rapporteur du worker et `failed_jobs.exception` (qui stocke `(string) $e`, trace
  comprise) n'ont plus rien du relevé. `bootstrap/app.php` n'est pas touché (TCK-601). Test
  `test_l_exception_relancee_ne_recopie_pas_le_releve` : contrepartie de 300 caractères → 22001,
  puis `report($e)` comme le fait `Illuminate\Queue\Worker` ; aucun témoin dans le journal ni dans
  `(string) $e`. Ablations : `throw $e` → rouge ; `previous` remis → rouge ; message d'origine
  recopié sans `previous` → rouge sur le témoin du journal (la voie qu'on voulait fermer).
- **R6 (mineur 2) — fichier latin-1.** `StoreBankStatementRequest` refuse un CSV non UTF-8
  (`mb_check_encoding`) par un 422 `reconciliation.validation.file_not_utf8` (fr/en/wo) sur `file`.
  OFX exclu : il déclare son propre jeu de caractères (`CHARSET` de l'en-tête), qu'un contrôle
  UTF-8 refuserait à tort ; un OFX en `1252` mal décodé reste une limite connue. Test
  `test_un_csv_qui_n_est_pas_en_utf8_est_refuse_a_l_import` (le même texte en UTF-8 passe, accents
  intacts). Ablation → rouge.
- **V7 (mineur 4) — date dans le futur.** `MarkLateFeePaidRequest` : `paid_at` en
  `before_or_equal:now`. Test `test_une_date_de_reglement_future_est_refusee` (hier → 200).
  Ablation → rouge.
- **AC8 (mineur 5) — le cas `refunded` passait pour une mauvaise raison.** `lease_payments` n'a pas
  de colonne `refund_amount` : une échéance de loyer `refunded` a TOUJOURS un reste dû nul, et la
  garde du montant nul la refuse avant que la garde de statut serve. Le `refund_amount => 150000`
  demandé n'est donc pas posable sur une échéance de loyer ; le cas qui éprouve la garde de statut
  est un acompte `booking_payments` remboursé intégralement (`refund_amount = amount`, reste dû
  50 000), ajouté à `test_initiation_refusee_sur_une_echeance_deja_payee`. Ablation AC8a
  (`Refunded` retiré d'`isPayable`) → rouge. ~~Pour les échéances de loyer, la garde de statut
  reste une défense en profondeur que la donnée rend inobservable.~~ *Corrigé après la passe 2
  (N7) : c'était faux — une échéance de loyer `refunded` dont la pénalité reste due, réglage
  activé, a un `amountDue` non nul sans la garde de statut ; ce cas est désormais éprouvé.*
- **AC17 (mineur 8) — gel du mapping pour une agence sans mapping.**
  `test_une_agence_sans_mapping_fige_le_defaut_effectif` : le relevé porte
  `CsvDriver::effectiveMapping(null)` (comparé clé par clé : `jsonb` réordonne les clés), puis
  l'agence règle un mapping à point-virgule et l'analyse lit encore le défaut figé. Ablation AC17a
  (mapping brut) → rouge.
- **AC3 (mineur 9) — paiement partiel.** `test_une_echeance_payee_en_partie_ne_demande_que_son_reste` :
  `paid_amount = 50 000` → `amount_due = 100 000` réglage désactivé, 107 500 activé, et le pilote
  reçoit 10 000 000 / 10 750 000 centimes. Ablation AC3b (`amount` au lieu de `remaining_amount`)
  → rouge.
- **AC18 (mineur 6) — détail du relevé.** Test front `le détail dit combien de lignes ont été
  sautées, et qu’un relevé a échoué` (`rapprochement.test.tsx`) : 3 sautées → « 3 lignes non lues
  — vérifiez le paramétrage CSV. » dans l'alerte du détail ; `failed` sans ligne sautée → le
  message d'échec. Ablation AC18b (`count: 0` dans `StatementDetail.tsx`) → rouge.
- **Vue client (mineur 7).** `CustomerPayments.tsx` rappelle `rappelPenalite(row)` sur les cartes
  `paid` de loyer de l'historique (le cas par défaut : loyer payé en ligne, pénalité due à
  l'agence), et `STATUTS_DUS` vaut `pending,partially_paid,late,failed` (le filtre serveur accepte
  tout `PaymentStatus`). Tests `rappelle la pénalité restant due sur un loyer PAYÉ de
  l’historique` et le filtre mis à jour. Ablations : rappel retiré → rouge ; `partially_paid`
  retiré → rouge. Front : vitest des deux dossiers 53 verts, ESLint 0, `tsc --noEmit` propre,
  `check:i18n` vert.

### Fusion de `origin/dev` après TCK-587 (fd4bd805), 2026-10-07

- **Conflits.** Un seul conflit de code : `LeasePaymentController` — l'action `markLateFeePaid` de
  593 est gardée, l'ancien helper `authorizeLeaseAccess` que 587 a retiré l'est aussi (aucun
  appelant). `PaymentController`, `DocumentPdfController`, `AgencyController`, les
  `lang/*/notifications.php` et les `messages/*.json` ont fusionné sans conflit ; `INDEX.md` est
  régénéré.
- **Alignement de `MarkLateFeePaidRequest` sur 587.** L'autorisation passe de `update` à
  `LeasePolicy::recordPayment` : personnel titulaire de `payments.record`, ou bailleur du bail non
  bloqué dans l'agence (`landlordWrites`). Le locataire et le bailleur bloqué ne règlent jamais une
  pénalité. Tests `test_un_bailleur_bloque_ne_regle_pas_la_penalite` et
  `test_sans_payments_record_le_personnel_ne_regle_pas_la_penalite` (chacun avec son témoin à 200).
  Ablations : `update` remis → rouge (le personnel sans `payments.record` passe) ; `view` → 3
  rouges. Le bailleur bloqué seul ne discrimine pas `update` de `recordPayment`, puisque 587 a
  posé `landlordWrites` dans les deux.
- **Fixture.** `LeaseDueFixture` créait son « agent » par le pont `agency_id` de la fabrique, qui
  pose un `OwnerProfile` : sous `recordPayment`, ce faux agent n'encaissait plus. Il est désormais
  créé par `withAgentProfile()`.
- **Classes rejouées.** Les 15 classes touchées par les conflits, l'alignement et la fixture
  (dont `TeamMemberSuspensionTest`, `BranchedCapabilitiesTest`, `AgencySettingsMergeTest`,
  `PaymentGatewayVerifyTest`) → 156 verts. Front : `tsc --noEmit`, `check:i18n`, vitest
  paiements et rapprochement (57) verts.
- **Statut `done`.** Décision de la session : la case « Journaux … `SafeExceptionContext` » est
  transférée à TCK-601 et ne bloque plus.

### Corrections après la passe 2 de vérification adverse (VERIF-593 passe 2, refusé : 1 majeur, 5 mineurs), 2026-10-07

Chaque point : un commit, un test rouge sans le correctif (l'ablation le retire et rend le code de
828427e0 pour ce point), ablation restaurée par `cp`.

- **N1 (majeur) — l'échec d'un ancien checkout fermait le courant.** Branche `FAILED` de
  `applyStatusToPayment` : `gateway.last_failed_at` n'est posé que si la transaction en échec est
  le `gateway.transaction_id` courant (ou inconnue) ; sinon l'échec est tracé en `failed_at` sur
  son entrée de `transactions[]`. Test
  `PaymentCheckoutReuseTest::test_l_echec_d_un_ancien_checkout_ne_ferme_pas_le_checkout_courant` :
  la séquence N1 rend `spy_txn_2` (2 appels au pilote, pas 3), l'espèce reste refusée, puis
  l'échec du checkout courant le ferme bien. Ablation (condition forcée à vrai) → rouge.
- **N2 — checkout réutilisé à un autre montant.** `initiateLocked` ne rend le checkout ouvert que
  si son montant figé (entrée de `transactions[]`) égale `amountDue()` ; sinon, comme pour un
  autre fournisseur, `refuseOpenCheckout()` rend 409 `checkout_in_progress` avec `code` et
  `checkout {amount, currency, provider, initiated_at, age_minutes, retry_after}`. Le même corps
  sert à `assertNoOpenCheckout` (mark-paid) et à `LateFeeSettlement`. Front : `checkoutEnCours()`
  lit ce corps, et le sélecteur de fournisseur affiche « Un paiement en ligne de X est déjà en
  cours… réessayez après HH:MM » (`payments.gateway.error.checkoutInProgress`, fr/en/wo). Tests
  `PaymentCheckoutReuseTest::test_un_checkout_a_un_autre_montant_n_est_pas_rendu` (au même montant,
  rendu tel quel) et `PaymentProviderPicker.test.tsx`. Ablations : comparaison de montant retirée
  → rouge ; lecture du corps retirée côté front → rouge. Piège noté : un `vi.fn()` qui rejette
  laisse une rejection signalée non gérée par Vitest 4 même quand l'appelant l'attrape ; le test
  mocke donc par une fonction simple.
- **N4 — règlement hérité marqué doublon.** `isSettledBy` tient aussi pour soldée par une
  transaction la ligne qui la porte encore dans `gateway.transaction_id` **sans aucune clé
  `settled_by`** (règlement par `verify()` antérieur au déploiement). La règle seule aurait rendu
  muet le doublon d'un règlement MANUEL (V3) : `LeasePaymentService::markPaid` et
  `InvoiceService::markPaid` posent désormais `gateway.settled_by = manual`
  (`PaymentGatewayService::markManualSettlement`, `SETTLED_MANUALLY`). Tests
  `PaymentCheckoutReuseTest::test_un_reglement_anterieur_a_settled_by_n_est_pas_son_propre_doublon`
  (avec le témoin manuel) et `InvoiceTest::test_une_facture_reglee_a_la_main_garde_le_checkout_paye_pour_doublon`.
  Ablations : règle héritée retirée → rouge ; marque retirée du loyer → 2 rouges ; de la facture →
  rouge. Les acomptes (`booking_payments`) ne se règlent pas à la main sur une ligne existante :
  le geste manuel crée une ligne neuve, sans checkout.
- **N5 — mapping CSV exempté du trim.** `UpdateBankCsvMappingRequest` : `delimiter` et
  `thousands_separator` sont jugés par une règle IMPLICITE (`$implicit = true`) en comparaison
  stricte — la validation sautait `in:` sur une chaîne blanche, `""` et `" "` étaient enregistrés.
  `prepareForValidation` rogne les noms de colonnes et `date_format` (vide après rognage → `null`) ;
  un séparateur de milliers vide veut dire « aucun ». Tests
  `BankCsvMappingTest::test_un_delimiteur_blanc_hors_liste_est_refuse` et
  `…::test_les_noms_de_colonnes_et_le_format_sont_rognes` ; la tabulation et l'espace passent
  toujours (`test_la_tabulation_et_l_espace_survivent_au_trim`). Ablations : règle non implicite →
  rouge ; comparaison lâche → rouge (sur `true`, égal à toute chaîne non vide) ; rognage retiré →
  rouge.
- **N7 — AC8 sur un loyer.** La garde de statut S'OBSERVE sur une échéance de loyer : `refunded`,
  pénalité due, réglage activé → `amountDue` vaudrait 7 500 sans elle. Le cas est ajouté à
  `PaymentGatewayInitiateTest::test_initiation_refusee_sur_une_echeance_deja_payee` (409
  `payment_not_payable`, aucun appel au pilote). Ablation (`Refunded` retiré d'`isPayable`) →
  rouge sur ce cas. La phrase de la note AC8 qui la disait inobservable est corrigée.
