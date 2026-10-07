---
id: TCK-594
title: "Les sorties d'argent ne sont ni calculées, ni contrôlées, ni tracées : le brut d'un reversement se saisit à la main, une seule personne crée, approuve et paie, et la facture porte un numéro aléatoire"
status: doing
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-07
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#110-documents--contrats
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#28-payout-
    - docs/models-spec.md#45-platformpayout-
    - docs/models-spec.md#25-invoice-
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#21-maintenancerequest-
tags: [back, front, paiements, reversements, factures, mobile-money, quatre-yeux, adr-requise]
---

## Objectif utilisateur

- **Bailleur** : recevoir chaque mois un reversement juste, sur son compte Wave / Orange Money, avec un
  avis et un relevé de gérance qui disent ce qui a été encaissé, retenu et versé.
- **Admin d'agence** : préparer un reversement depuis les loyers réellement encaissés, sans
  pouvoir l'approuver ni le payer seul, et émettre des factures opposables.
- **Super-admin** : ne jamais pouvoir clôturer, approuver et payer seul un reversement plateforme, ni
  payer une agence suspendue.
- **Prestataire** : être payé de son intervention, sur son numéro mobile money, sans réclamer.
- **Hôte individuel** : voir ce que Takussan lui reverse.

## Contexte

Issu de l'analyse par acteur du 2026-10-06 (vague 73) : points O7, O8 (bailleur), AD7, AD11, AD12,
AD18 (admin d'agence), S7 (super-admin), P8 (prestataire). Chaque constat ci-dessous a été **relu
dans le code** sur `e3ab4a4e` ; les corrections apportées aux rapports sont dans les notes de rédaction.
La passe de correction du même jour a ajouté six défauts relevés en relisant ces fichiers (bail
d'une autre agence, caution affichée au bailleur, gel après clôture, clôture globale interrompue,
facture payée sans émission, facture rattachée hors agence).

### 1. Le reversement au bailleur n'est pas calculé (AD11)

- Le brut se saisit à la main et la commission vaut taux × brut côté navigateur
  (`takussan-web/src/components/payments/CreatePayoutDialog.tsx:122-137`, champ l.219).
  `PayoutService::create` le recopie sans contrôle (`app/Services/Model/PayoutService.php:36-41`).
- **Le lien entre reversement et paiements est modélisé, jamais alimenté.** Les pivots
  `payout_lease_payment` et `payout_booking_payment` existent
  (`database/migrations/2026_04_17_160025_create_payouts_table.php:42-52`), mais seul le seeder les
  remplit (`database/seeders/Activity/PayoutSeeder.php:74`). Rien n'empêche donc de reverser deux
  fois le même loyer. La clé primaire `(payout_id, lease_payment_id)` autorise même un paiement dans
  deux reversements.
- La contrainte de la spec « `lease_id IS NOT NULL OR booking_id IS NOT NULL` » (models-spec §28)
  n'existe pas en base, et `StorePayoutRequest.php:39-40` accepte les deux à `null`.
- **La table `payouts` mélange deux flux.** Un remboursement de caution, c'est-à-dire de l'argent
  rendu au **locataire**, est enregistré comme un `Payout` dont `landlord_id` désigne le bailleur
  (`app/Services/Lease/DepositRefundService.php:96-111`, docblock l.25-26). Tout calcul « reversé
  au bailleur » qui lirait `payouts` compterait la caution rendue au locataire.
- Le statut `scheduled` est posé (`PayoutService.php:50`) mais rien ne le traite : aucune entrée
  « payout » dans `routes/console.php`.
- **Un reversement peut citer le bail d'une autre agence.** `StorePayoutRequest.php:39-40` valide
  `lease_id` / `booking_id` par un simple `exists:leases,id` / `exists:bookings,id`, et
  `PayoutService::create` les recopie (l.45-46) sans vérifier que le bail appartient à l'agence de
  l'émetteur ni au bailleur désigné.
- **Le bailleur voit la caution rendue au locataire comme un versement qui lui est dû.** L'accueil
  propriétaire liste ses reversements `pending` par `filter[landlord_id]` seul
  (`takussan-web/src/app/(dashboard)/app/overview/owner/page.tsx:209-229`) : le `Payout` de
  remboursement de caution, qui porte son `landlord_id`, y figure.

### 2. Aucun relevé de gérance (O8 = AD11)

Les seuls PDF sont la facture, la quittance, le bail et l'état des lieux (`routes/api/invoices.php:16`,
`routes/api/leases.php:60-63`, `routes/api/inventories.php:17`). Aucun document ne récapitule, pour
un mois ou une année, ce qui a été encaissé, retenu (commission, travaux) et reversé.

### 3. Une seule main sur toute la sortie d'argent (AD7, S7)

**3a. Chaîne agence → bailleur.** `Payout` n'a aucun champ d'approbation (fillable
`app/Models/Payout.php:19-26`). `PayoutStatus` n'a pas d'état d'attente
(`app/Models/Enums/PayoutStatus.php:7-12`). `markProcessed` passe à `completed` sans second acteur,
avec une référence de transaction **facultative** (`PayoutService.php:67-83`,
`MarkProcessedPayoutRequest.php:38`). `Capability::PayoutsApprove` (`Capability.php:75`) n'est lue
nulle part. La policy n'a pas de méthode `approve` (`app/Policies/PayoutPolicy.php:27-54`).

**3b. Chaîne plateforme → agence.** `PlatformPayoutService::approve` enregistre l'approbateur sans le
comparer à l'auteur de la clôture (`app/Services/Billing/PlatformPayoutService.php:55-67`). `markPaid`
n'enregistre ni le payeur ni une référence obligatoire (l.69-82 ; `metadata.bank_ref` est
`nullable` dans `MarkPlatformPayoutPaidRequest.php:19`). L'auteur de la clôture ne vit que dans
`activity_log` (`logAction`, fin du fichier) : la table n'a que `approved_by`
(`2026_05_07_000223_create_platform_payouts_table.php:23`). Le test de référence le consacre :
`PlatformPayoutTest::test_full_happy_path_pending_to_paid` approuve **et** marque payé avec le
même super-admin (`tests/Feature/Api/Admin/PlatformPayoutTest.php:92-112`). `closeForAgency` et
`agenciesWithUnpaidEligiblePayments` (l.138-256) ne lisent ni `agencies.status` ni
`agencies.is_verified` : une agence suspendue est payée. `approve` et `markPaid` (l.55-82) ne les
lisent pas non plus : une agence suspendue **après** la clôture est encore approuvée et payée.
La clôture globale s'arrête à la première agence déjà clôturée pour la même date : `closeForAgency`
lève 409 (l.147-148, l.207-209), l'exception sort de la boucle de `closePeriod` (l.48-50), et les
agences suivantes ne sont pas clôturées, alors que les précédentes le sont déjà (une transaction par
agence) et que la réponse dit 409.

### 4. Ni destination mobile money, ni décaissement, ni avis (O7, P8)

- Le profil bailleur ne connaît qu'un `rib` (`app/Models/Profiles/OwnerProfile.php:24-29`), et le
  profil prestataire aucun moyen d'être payé (`ServiceProviderProfile.php:24-30`). Pourtant
  `PaymentMethod` connaît `wave`, `orange_money` et `free_money`.
- **Les pilotes de paiement ne savent qu'encaisser.** `PaymentDriverContract` n'expose que
  `initiate`, `verify` et `handleWebhook` (`app/Contracts/Payments/PaymentDriverContract.php:18-42`).
  Wave appelle `/v1/checkout/sessions` (`WaveDriver.php:53,79`), Orange Money `/webpayment`
  (`OrangeMoneyDriver.php:56`). Aucun appel de décaissement n'existe : envoyer de l'argent est un
  **nouveau flux**.
- Aucune notification de reversement : `ls app/Notifications | grep -i payout` ne rend rien.

### 5. La facture n'est pas opposable (AD12)

- Le numéro est aléatoire : `'INV-'.now()->format('Ym').'-'.Str::random(6)`
  (`app/Services/Model/ReferenceNumberGenerator.php:34-37`). **Trois** sites créent une facture :
  `InvoiceService.php:52`, `EarlyTerminationService.php:328` (directement en `sent`) et
  `DepositRefundService.php:122`. L'unicité de `reference_number` est **globale**
  (`2026_04_17_160023_create_invoices_table.php:17`) : une numérotation par agence au format
  `FA-2026-00001` y collisionnerait d'une agence à l'autre.
- La TVA vaut 0 par défaut (`InvoiceService.php:42`), sans réglage d'agence.
- Le PDF ne porte que le logo ou le nom en en-tête (`resources/views/pdf/layouts/base.blade.php:89-98`),
  et « Document généré le … — Takussan » en pied (l.14, l.105) : ni raison sociale, ni NINEA, ni
  RCCM, ni adresse. `Agency` n'a pas de colonne pour ces informations (`app/Models/Agency.php:29-34`).
  Elles existent pourtant, **dans `agencies.metadata.legal_info`**, recopiées à l'upgrade
  (`AgencyKindFlipService::LEGAL_FIELDS`, l.45-51, dont le commentaire l.38-41 annonce des colonnes).
- **Annuler une facture émise ne laisse aucune trace comptable.** Il n'existe pas de route de
  suppression, mais `cancel()` passe une facture `sent` ou `overdue` à `cancelled` sans
  contre-document (`InvoiceService.php:91-102`).
- **Une facture peut être payée sans avoir été émise.** `markPaid` accepte un brouillon
  (`InvoiceService.php:81`) : une numérotation attribuée au seul `send` laisserait cette facture sans
  numéro de séquence.
- **Une facture peut être rattachée au bail d'une autre agence.** `resolveInvoiceableTarget` ne vérifie
  que l'existence de la cible (`InvoiceService.php:116-120`), pas son agence.

### 6. La facture d'intervention n'existe pas (P8)

La spec la prévoit en P3 (« Facturation directe prestataire → agence », features §1.8), mais rien ne
l'implémente. `Invoice` va de l'agence vers un `Customer` (`customer_id` non nul,
`create_invoices_table.php:14`) : elle ne peut pas porter une facture *reçue*. `actual_cost` et
`quote_amount` (`MaintenanceRequest.php:42-43`) ne sont lus par aucune écriture comptable. Aucun
observateur n'écoute `MaintenanceRequest` (`AppServiceProvider.php:374-383`).

### 7. L'hôte individuel ne voit pas ce que la plateforme lui reverse (AD18)

`/admin/agency/billing` est dans `PRO_ROUTES` (`takussan-web/src/lib/access/pro-features.ts:58`), et
sa page redirige toute agence non `standard` (`admin/agency/billing/page.tsx:16`). C'est pourtant
la seule surface d'`AgencyPayoutsClient`. Or la liste **fermée** des restrictions `individual`
(features §1.12) ne cite ni la facturation ni les reversements. À l'inverse, l'API est **trop**
ouverte. `GET /api/me/payouts` prend l'agence du profil actif, quel qu'il soit
(`app/Http/Controllers/Api/Me/PlatformPayoutController.php:15-20`). Comme `OwnerProfile` porte un
`agency_id`, un bailleur ou un agent lit ce que Takussan reverse à l'agence. Ce point est inféré :
le seul test (`test_agency_admin_can_read_their_own_payouts_via_me_endpoint`) n'éprouve que l'admin.

## Contrat de données

Les colonnes ci-dessous sont des **ajouts** ; la spec de chaque modèle reste la référence
(`spec_refs`) et doit être complétée par la session (lignes prêtes dans les notes de rédaction).

| Endpoint | Rôle |
|---|---|
| `GET /api/payouts/preparation?landlord_id=&period_start=&period_end=` | lignes éligibles, commission, frais, net (lecture) |
| `POST /api/payouts` | **change** : prend des identifiants de paiements et de factures d'intervention, plus de brut |
| `POST /api/payouts/{payout}/approve` | approbation (quatre yeux) |
| `POST /api/payouts/{payout}/mark-processed` | **change** : `transaction_id` obligatoire hors espèces ; 422 sur `awaiting_approval` |
| `GET /api/payouts` | **change** : `payee_role` rendu et filtrable (`filter[payee_role]=landlord`) |
| `POST /api/invoices` | **change** : 422 si `invoiceable` relève d'une autre agence |
| `GET /api/owner-statements?period=YYYY-MM\|YYYY[&landlord_id=]` · `/pdf` · `/csv` | relevé de gérance / attestation annuelle |
| `GET\|POST\|DELETE /api/me/payout-methods` · `POST /api/payout-methods/{method}/verify` | moyens de versement |
| `GET /api/service-provider-bills` · `GET …/{bill}` · `POST …/{bill}/validate\|reject\|pay` | factures d'intervention |
| `POST /api/admin/payouts/{payout}/mark-paid` | **change** : `payment_reference` obligatoire |
| `POST /api/admin/payouts/close-period` | **change** : rend aussi les agences exclues et leur motif |
| `POST /api/invoices/{invoice}/cancel` | **change** : sur une facture émise, produit un avoir |
| `PATCH /api/agencies/{agency}` | **change** : mentions légales, TVA par défaut, seuil d'approbation |

Modèles : `Payout`, `PlatformPayout`, `Invoice`, `Agency` (colonnes ajoutées) ; deux nouveaux,
`PayoutMethod` et `ServiceProviderBill` ; lus : `LeasePayment`, `BookingPayment`, `Lease`,
`MaintenanceRequest`.

## Direction UX / Artistique

Charte « Ancrage Local Contemporain » (`docs/design-guidelines.md`). Ce sont des écrans d'**argent** :
sobriété, chiffres alignés à droite et en chiffres tabulaires, montants XOF sans décimales.
L'origine d'un montant se lit toujours (quels loyers, quelle commission, quels travaux) avant le
bouton qui l'engage.

- Préparer un reversement, c'est **choisir un bailleur et une période, puis lire** un calcul qu'on ne
  peut pas réécrire. Le brut n'est plus un champ.
- L'approbation est une **file** (« À approuver ») dans les finances de l'agence. Elle dit qui a
  préparé, et refuse visiblement d'être tenue par la même personne, plutôt qu'en cachant le bouton.
- Le bailleur trouve ses relevés à côté de ses versements. Le prestataire trouve ses factures et leur
  état de paiement dans « Mes interventions ». Chacun déclare son numéro de réception dans son profil,
  numéro masqué une fois enregistré, avec un état « vérifié / en attente ».
- Super-admin : l'écran de clôture montre les agences exclues et pourquoi. Le geste « marquer payé »
  exige la référence du virement.
- L'hôte individuel voit ses reversements plateforme, sans cadenas.

## Contraintes strictes (métier)

**Le principe des quatre yeux, écrit une fois.** Une sortie d'argent passe par trois gestes :
préparer (créer ou clôturer), approuver, marquer payé. **La même personne ne tient jamais deux gestes
consécutifs.** L'approbateur n'est pas le préparateur, le payeur n'est pas l'approbateur, et le
bénéficiaire ne tient aucun des trois. Une seule classe porte la règle,
`App\Support\SegregationOfDuties`. Les deux chaînes l'appellent, et aucune ne la réécrit. Une violation
rend **403** avec une clé i18n, jamais une phrase.

- **Chaîne agence (3a). Tranché par le porteur le 2026-10-06 : pas de seuil par défaut.**
  `agencies.payout_approval_threshold` vaut `null` (désactivé) pour **toute** agence, neuve ou
  existante ; la migration n'en pose aucun. Tant qu'il est `null`, un reversement naît `pending` (ou
  `scheduled`) et une seule personne peut le préparer puis le marquer payé : c'est le choix de
  l'agence. Le bénéficiaire reste exclu des gestes de traitement par `PayoutPolicy::update`
  (TCK-587), seuil ou non. L'agence **active elle-même** le seuil (net ≥ seuil ⇒ approbation exigée ;
  `0` ⇒ toujours). L'activation est refusée (422) tant que moins de deux membres de l'agence
  détiennent `payouts.approve`. Changer le seuil exige `payouts.approve` et se journalise. Une agence
  `individual` n'émet pas de `Payout` à un tiers : son argent sort par la chaîne plateforme.
- **Chaîne plateforme (3b)** : l'approbation est **toujours** exigée, sans seuil — la décision du
  porteur sur le seuil d'agence n'y change rien. Les niveaux `support` et `viewer` de TCK-600
  n'approuvent ni ne paient.
- **Gel d'une agence non active** (ADR B de TCK-600 renvoie ici) : une agence dont `status <> active`
  n'est ni clôturée, ni approuvée, ni payée par la plateforme, y compris quand la suspension survient
  après la clôture.
- **Le brut n'est jamais une saisie.** Il se calcule côté serveur à partir des `LeasePayment` et
  `BookingPayment` au statut `paid` dont `paid_at` tombe dans la période. Les types de paiement
  retenus sont `rent`, `charges`, `penalty` et `regularization` ; `deposit` et `deposit_refund` sont
  **exclus**. La commission vaut le taux du bail, à défaut celui de l'agence, appliqué ligne par
  ligne et arrondi à l'unité pour XOF (principe n°3 du `CLAUDE.md` racine). Les frais sont les
  factures d'intervention validées et refacturables au bailleur.
- **Un paiement n'est reversé qu'une fois.** L'invariant tient en base, par un index unique sur
  `payout_lease_payment.lease_payment_id` (idem côté réservation). Un reversement `cancelled` ou
  `failed` **détache** ses paiements. La préparation verrouille les **lignes de bail** concernées
  (`lockForUpdate()` sur `leases`, piège PostgreSQL n°2). Une violation d'unicité remonte en 409
  **après** le rollback : on ne l'attrape jamais dans la transaction (piège n°1).
- **Une pièce citée appartient à l'agence et au bailleur du reversement.** Chaque `LeasePayment` cité
  relève d'un bail dont `agency_id` est l'agence du profil actif de l'émetteur et `landlord_id` le
  bailleur désigné ; chaque `BookingPayment`, d'une réservation de cette agence sur un bien dont
  `properties.user_id` est ce bailleur. Sinon 422, sans rien écrire. Même règle pour la cible d'une
  facture (`invoiceable`) : bail ou réservation de l'agence de la facture.
- **Bénéficiaire explicite.** `payouts.payee_role` (`landlord` | `tenant` | `service_provider`,
  chaîne de caractères et non `enum()`, ADR-0007). Tout lecteur qui somme des « reversements au
  bailleur » filtre `payee_role = landlord`.
- **Destination vérifiée.** Un reversement mobile money ou virement ne se marque payé que vers un
  `PayoutMethod` vérifié. La vérification incombe à un membre de l'agence détenant `payouts.create`.
  Un numéro égal au téléphone déjà vérifié de l'utilisateur est vérifié d'office. Ajouter ou modifier
  une destination **notifie le titulaire** (vecteur de détournement après prise de compte), et la
  destination modifiée repasse en « non vérifiée ». L'API ne rend en clair que la version masquée,
  sauf au titulaire.
- **Données de personne physique et RIB : le mécanisme de chiffrement de TCK-601, sans variante.**
  Toute colonne créée ici qui porte un RIB ou une donnée de personne physique le reçoit tel que 601
  le définit (colonne `text`, cast `encrypted`, `$hidden`, masqueur de 601, hors `$queryFields` et
  hors recherche, jamais en clair dans `activity_log`). Concernées : `payout_methods.account_identifier`
  (numéro mobile money ou RIB) et `payout_methods.account_holder_name`. **Non concernées**, et
  pourquoi : `legal_name`, `ninea`, `rccm`, `legal_address` d'`agencies` sont les mentions d'une
  **personne morale**, imprimées sur chaque facture et lues en clair par la détection « NINEA partagé »
  de 601 ; elles ne sont acceptées que pour une agence `standard` (`prohibited` pour `individual`),
  si bien qu'elles ne portent jamais l'identité d'une personne physique. 594 ne lit ni ne recopie
  aucun RIB d'agence (voir la coordination 601).
- **Forme du NINEA et du RCCM : aucun contrôle ici.** Le contrôle de forme est reporté (dette D-68) :
  `['nullable','string','max:30']`, aucune expression régulière, aucune règle de format importée.
- **Référence obligatoire.** Marquer payé exige `transaction_id` (agence) ou `payment_reference`
  (plateforme). En espèces, une note suffit.
- **Numérotation de facture** : continue par `(agency_id, kind, année)`, attribuée **à l'émission**
  (premier passage hors `draft`). Un brouillon ne consomme pas de numéro. Le compteur se lit sous
  verrou de la **ligne agence** (`Agency::whereKey()->lockForUpdate()`, puis `MAX` hors verrou
  d'agrégat ; piège n°2). Un seul point d'attribution, appelé par les trois sites de création et par
  `markPaid` d'un brouillon (payer un brouillon vaut émission). On ne renumérote **jamais** une
  facture déjà émise : les `INV-…` existantes restent.
- **Avoir** : une facture émise ne s'annule que par un avoir (`kind = credit_note`, numérotation
  propre `AV-`, `credited_invoice_id`, même montant). L'annulation d'un brouillon reste un simple
  changement de statut.
- **Aucun littéral de prose** dans les erreurs et notifications ajoutées (règle commune 1). Les clés
  vont dans un bloc propre `money_out.*` de `lang/{fr,en,wo}.json` (règle commune 2).
- **Toute garde se prouve par ablation** (règle commune 5).

**Décisions** :

- **Tranché par le porteur le 2026-10-06 — quatre yeux agence** : pas de seuil par défaut (voir 3a
  ci-dessus). La règle stricte des reversements plateforme reste toujours active.
- *Option retenue par défaut* — **décaissement** : manuel tracé (on paie dans Wave Business ou
  Orange Money, puis on saisit la référence), derrière `DisbursementDriverContract` ; le pilote
  automatique fera un ticket suivant.
- *Option retenue par défaut* — **super-admins** : la règle stricte (clôture ≠ approbation, paiement
  ≠ approbation). Un second super-admin est coopté (`SuperAdminCooptationService`) avant la mise en
  service ; son compte en production est relevé et écrit dans les Notes d'implémentation.
- *Option retenue par défaut* — **KYC de l'agence `individual`** : garde dure à l'approbation
  seulement pour `standard` ; pour `individual`, l'état de vérification est affiché à la clôture,
  sans blocage. Le gel d'une agence non active, lui, vaut pour les deux.
- *Option retenue par défaut* — **pénalités et régularisations** : elles reviennent au bailleur,
  entrent dans le brut et portent commission.
- *Option retenue par défaut* — **facture d'intervention** : pas de PDF établi au nom du prestataire ;
  une pièce interne, avec sa référence propre en option.
- *Option retenue par défaut* — **découpage** : un seul ticket, livré en trois lots fusionnables
  séparément, dans cet ordre : A = § 0, § 1, § 3, § 7 ; B = § 5 ; C = § 2, § 4, § 6 (C dépend de
  A). Le ticket passe `done` quand les trois sont sur `dev`.
- *Option retenue par défaut* — **renumérotation** : aucune ; les `INV-…` émises restent, la
  séquence `FA-` démarre au déploiement.

**Coordination avec la vague 73** :

- **TCK-587** possède `PayoutPolicy::view/update`, `PayoutController::index`, `InvoicePolicy` et les
  actions de `PayoutDetailDialog`. 594 n'**ajoute** que `PayoutPolicy::approve` et la route
  `approve`, plus l'action « Approuver » et le champ de référence obligatoire, en blocs voisins.
  Qui peut annuler une facture reste chez 587, et 594 ne change que *ce que fait* l'annulation.
  Avant la fusion de 587, le prédicat « personnel de l'agence » s'écrit
  `isAgentAt || isAgencyAdminAt` avec un commentaire `TCK-587` (règle commune 3).
- **TCK-588** possède `NotificationService` et les canaux. Les notifications de 594 sont des classes
  neuves, en base de données et par e-mail ; elles gagnent WhatsApp/SMS par les canaux de 588.
- **TCK-589** : l'approbation et le marquage payé passent sous son middleware de step-up dès qu'il
  existe.
- **TCK-592** émet `MaintenanceStatusChanged`. 594 crée `MaintenanceRequestObserver` et n'écoute
  **pas** cet événement. Si 592 structure le devis (P12), le montant du devis approuvé se lit par un
  seul accesseur, à convenir avec 592.
- **TCK-593** rapproche les débits bancaires des reversements : 594 garde le nom `transaction_id`.
- **TCK-595** : `Dashboard*Service`, le reporting et la page `overview/owner` (son territoire)
  doivent filtrer `payee_role = landlord` ; les cautions rendues portent `payee_role = tenant`. 594
  fournit le filtre `filter[payee_role]` et le prouve côté API (AC23) ; l'appliquer dans ces lecteurs
  revient à 595 (à confirmer par la session : 595 définit aujourd'hui « Net reversé » sans ce filtre).
- **TCK-600** possède `AlertableEvents` (`app/Domain/Alerts/AlertableEvents.php`). Il y ajoute
  `super_admin_payout_approved` et `super_admin_payout_marked_paid`, déjà journalisés sous ces noms
  (`PlatformPayoutService.php:64,79`).
- **TCK-601** possède `OwnerProfile` et le mécanisme de chiffrement (cast, masqueur). Il chiffre
  `agency_upgrade_requests.rib_pro` et **supprime** le RIB recopié dans `agencies.metadata.legal_info`
  (aucun lecteur, et `AgencyResource` le renvoie tel quel à tout bailleur ou agent de l'agence) au
  lieu de le chiffrer sur place. En conséquence, 594 ne lit **ni ne recopie** ce RIB : la reprise
  depuis `metadata.legal_info` ne prend que `company_legal_name`, `ninea`, `rc` et
  `address_fiscale`, et `AgencyKindFlipService` n'écrit plus de RIB nulle part (le retrait de
  `rib_pro` de `LEGAL_FIELDS` est chez 601 ; 594 ne touche que le mapping vers les colonnes, lignes
  voisines). S'il faut un jour un RIB d'agence pour les reversements plateforme, il vient d'un
  `PayoutMethod` vérifié, chiffré par le mécanisme de 601 — ce ticket n'en exige pas : le
  reversement plateforme reste manuel, tracé par `payment_reference`.
  594 crée les colonnes légales d'agence (`legal_name`, `ninea`, `rccm`, `legal_address`,
  `default_tax_rate`, `payout_approval_threshold`) et `payout_methods` ; toute colonne de 594 qui
  porte un RIB ou une donnée de personne physique prend le mécanisme de 601 (voir plus haut). Si
  594 fusionne d'abord, il pose le cast `encrypted` sur `text` et 601 y branche son masqueur ; ordre
  de fusion indifférent. 594 ajoute ses colonnes légales à la liste blanche d'audit d'`Agency` que
  601 crée (lignes voisines). Le contrôle de **forme** NINEA/RCCM n'est ni chez 594 ni chez 601 :
  reporté, dette D-68. Le `rib` du profil reste une pièce KYC et ne devient pas une destination.
  594 journalise le changement de seuil ; l'alerte de gouvernance qui en découle est chez 601.
- **TCK-587** tolère `payouts.approve` et `agency.update_billing` dans sa garde « capacité sans
  lecteur » en les attribuant à 594 : 594 en est le lecteur (`PayoutPolicy::approve`,
  `Me\PlatformPayoutController`) et les retire de la tolérance dans le commit qui les branche, selon
  l'ordre de fusion.
- **TCK-600** renvoie à 594 le gel des reversements d'une agence suspendue (son ADR B) : il est porté
  ici (Contraintes, § 3b, AC10).
- **Fichiers partagés, en ajout seulement** : `AppServiceProvider` (enregistrement de l'observateur),
  `routes/console.php` (deux entrées), `lang/*.json`, `takussan-web/src/messages/*.json`.
- **ADR** : prendre le prochain numéro libre **au moment de l'écrire** (0030 est pris par TCK-586,
  et TCK-595 en écrit un aussi).

## Delta à produire

### 0. Décision

- [ ] **ADR à écrire et accepter avant le code** : « Les sorties d'argent ». Il tranche :
  1. **Décaissement** : *manuel tracé* (l'humain paie dans Wave Business ou Orange Money, puis
     saisit la référence) ou *automatique* (API de décaissement). **Option retenue par défaut :
     manuel tracé dans ce ticket**, derrière un contrat `App\Contracts\Payments\DisbursementDriverContract`
     distinct de `PaymentDriverContract`, avec un seul pilote, `ManualDisbursementDriver`. Le pilote
     Wave automatique fera l'objet d'un ticket suivant, conditionné à un compte Wave Business
     disposant de l'API de décaissement.
  2. **Qui reçoit** : `payee_role` sur `payouts` (retenu par défaut) ou des tables par bénéficiaire.
  3. **Facture d'intervention** : modèle propre `ServiceProviderBill` (retenu par défaut : c'est une pièce
     *reçue*, alors qu'`Invoice` est une pièce *émise* vers un `Customer`), payée par un `Payout`
     `payee_role = service_provider`. Une seule chaîne de sortie, donc un seul principe de quatre yeux.
  4. Les quatre yeux et leurs cas dégénérés, tels que tranchés : seuil d'agence `null` par défaut et
     activé par l'agence seulement avec deux approbateurs (porteur, 2026-10-06) ; plateforme
     toujours stricte, un second super-admin coopté avant la mise en service.
  5. La numérotation : attribution à l'émission, unicité `(agency_id, reference_number)`, avoir.

### 1. Reversement calculé (AD11)

- [ ] Migration `add_payee_and_approval_columns_to_payouts_table` : `payee_role` string défaut
  `landlord`, `approved_by_id`, `approved_at`, `processed_by_id`, `payout_method_id`,
  `service_provider_bill_id`, chacune avec une FK nommée explicitement. **Origine obligatoire** : le
  CHECK `lease_id OR booking_id` de models-spec §28 ne tient plus dès qu'un reversement couvre
  plusieurs baux d'un même bailleur (un virement par bailleur et par mois). L'origine se garantit
  donc à l'écriture : au moins une pièce (paiement de bail, de réservation, ou facture
  d'intervention) est exigée par `StorePayoutRequest` et revérifiée par `PayoutService::create`.
  Compter en préproduction les `Payout` sans `lease_id`, `booking_id` ni pivot ; le compte va dans
  les Notes. La ligne §28 de models-spec est à corriger par la session (fichier de retour).
- [ ] Migration de données : `payee_role = tenant` pour les reversements nés de `DepositRefundService`.
  On les identifie par jointure avec le `LeasePayment` `deposit_refund` de même bail, même montant et
  même seconde de création, et le compte va dans les Notes. `DepositRefundService` écrit désormais
  `payee_role = tenant`.
- [ ] Migration `add_unique_payment_to_payout_pivots` : index uniques
  `payout_lp_lease_payment_unique` et `payout_bp_booking_payment_unique`. Dédoublonner au préalable
  les lignes du seeder.
- [ ] `PayoutStatus::AwaitingApproval` (`awaiting_approval`). Transitions : `awaiting_approval →
  pending` (approbation ; `scheduled` si `scheduled_at` est posé) et `awaiting_approval → cancelled`.
  `markProcessed` et `markFailed` refusent `awaiting_approval` (422). Un reversement ne naît
  `awaiting_approval` que si `agencies.payout_approval_threshold` n'est pas `null` et que net ≥ seuil.
- [ ] Service `App\Services\Payout\PayoutPreparationService::prepare()` ; contrôleur
  `PayoutPreparationController` ; `PreparePayoutRequest` (autorisation `can('create', Payout::class)`).
- [ ] `StorePayoutRequest` : `gross_amount`, `commission_amount` et `fees_amount` passent en
  **`prohibited`** ; ajout de `lease_payment_ids[]`, `booking_payment_ids[]`,
  `service_provider_bill_ids[]` et `payout_method_id` ; `lease_id` et `booking_id` passent en
  `prohibited` (ils se déduisent des paiements). Au moins un identifiant de pièce est requis.
  `PayoutService::create` recalcule tout, attache les pivots et détache sur `cancel`/`markFailed`.
- [ ] `PayoutService::create` vérifie, avant toute écriture, que chaque pièce citée relève de
  l'agence du profil actif et du bailleur désigné (Contraintes) ; sinon 422 avec la clé
  `money_out.payout.foreign_item` et l'identifiant fautif. `lease_id` (resp. `booking_id`) du
  `Payout` est rempli quand toutes les pièces relèvent d'un même bail (resp. réservation), sinon
  `null` : les pivots portent alors l'origine.
- [ ] `Payout::$requestFilterable` gagne `payee_role` ; `PayoutResource` le rend.
- [ ] Commande `payouts:remind-due` (quotidienne) : notifie l'émetteur (`PayoutDueNotification`, clés `money_out.*`) des reversements `pending` **ou
  `scheduled`** dont `scheduled_at` est échu, **une fois** (`metadata.due_reminded_at`). Elle
  n'exécute rien tant que le décaissement est manuel.

### 2. Relevé de gérance (O8 = AD11)

- [ ] `App\Services\Payout\OwnerStatementService`. Il produit, par agence, par bien puis consolidé :
  loyers encaissés, commission, frais d'intervention, net reversé avec ses références, et impayés de
  la période. Il ne lit que `payee_role = landlord`.
- [ ] `OwnerStatementController` (`index`, `pdf`, `csv`), `OwnerStatementRequest` (`period` au format
  `YYYY-MM` ou `YYYY`), nouvelle `OwnerStatementPolicy`. Le bailleur lit le sien ; un membre détenant
  `payouts.create` lit ceux des bailleurs de **son** agence.
- [ ] Gabarit `resources/views/pdf/statements/owner.blade.php` sur `layouts/base`, avec les mentions
  légales du § 5.
- [ ] Commande `payouts:send-owner-statements` mensuelle (le 1er, 08:00, heure de Dakar), avec la
  notification `OwnerStatementAvailableNotification`.

### 3. Quatre yeux

- [ ] `App\Support\SegregationOfDuties` : `assertDistinct(User $actor, array $priorActorIds, string $step)`.
- [ ] **3a** : `PayoutPolicy::approve()` (capacité `payouts.approve` à l'agence du reversement).
  `ApprovePayoutRequest`, `PayoutController::approve`, route `payouts.approve`. `PayoutService`
  appelle `SegregationOfDuties` dans `approve()` et `markProcessed()`.
  `MarkProcessedPayoutRequest` : `transaction_id` est `required_unless:payment_method,cash`.
- [ ] Migration `add_payout_settings_and_legal_columns_to_agencies_table` (voir § 5) :
  `payout_approval_threshold` decimal(14,2) nullable, **sans défaut et sans reprise** : `null` pour
  toute agence existante comme pour toute agence créée ensuite (porteur, 2026-10-06). C'est une
  **colonne** et non `settings` : `AgencyUpdateRequest.php:37` remplace le tableau `settings` entier.
- [ ] `AgencyUpdateRequest` : `payout_approval_threshold` `['sometimes','nullable','numeric','min:0']`.
  Le poser à une valeur non nulle exige `payouts.approve` (403 sinon) et au moins deux membres actifs
  de l'agence détenant `payouts.approve` (422, clé `money_out.threshold.needs_two_approvers`) ; le
  remettre à `null` exige `payouts.approve`. Tout changement écrit une entrée d'activité
  `agency_payout_threshold_changed` (ancienne et nouvelle valeur).
- [ ] Notification `PayoutAwaitingApprovalNotification` aux détenteurs de `payouts.approve`, sauf l'émetteur.
- [ ] **3b** : migration `add_segregation_columns_to_platform_payouts_table` : `closed_by_id`,
  `paid_by_id`, `approved_at`, `payment_reference`. `PlatformPayoutService` : `closeForAgency` écrit
  `closed_by_id`, `approve` et `markPaid` appellent `SegregationOfDuties`.
  `MarkPlatformPayoutPaidRequest` : `payment_reference` required.
- [ ] `closeForAgency` / `agenciesWithUnpaidEligiblePayments` : on exclut `status <> active`, et la
  réponse de `close-period` liste les exclues avec leur motif (`agency_not_active`,
  `already_closed`). `approve` refuse (422) une agence `standard` non vérifiée. Pour une agence
  `individual`, l'état de vérification est seulement affiché (option retenue par défaut).
- [ ] **Gel** : `approve` et `markPaid` relisent `agencies.status` et refusent (422, clé
  `money_out.platform.agency_frozen`) une agence non active, même si le `PlatformPayout` a été clôturé
  quand elle l'était.
- [ ] **Clôture globale non interrompue** : sans `agency_id`, `closePeriod` traite chaque agence
  dans sa transaction ; une agence déjà clôturée pour cette date (vérification du `existing` avant
  toute insertion) est **rangée dans les exclues** avec `already_closed` au lieu de lever 409, et la
  boucle continue. Le cas d'une course perdue sur l'index unique partiel ne s'attrape pas dans la
  transaction (piège n°1) : la transaction de cette agence échoue, son identifiant rejoint les
  exclues **après** le rollback, et les suivantes sont traitées. Avec `agency_id`, le 409 actuel est
  conservé (`test_close_period_is_idempotent_and_returns_409_on_replay` reste vert).
- [ ] Réécrire `test_full_happy_path_pending_to_paid` avec deux super-admins distincts.

### 4. Destinations et décaissement (O7, P8)

- [ ] Migration `create_payout_methods_table` : `user_id`, `kind` (`wave`|`orange_money`|`free_money`|`bank_transfer`),
  `account_identifier` et `account_holder_name` (`text`, mécanisme de chiffrement de TCK-601 :
  cast `encrypted`, `$hidden`, masqueur), `masked_identifier` (calculé par le masqueur de 601),
  `is_default`, `verified_at`, `verified_by_id`, soft delete. Modèle `PayoutMethod`, `PayoutMethodPolicy`,
  `Me\PayoutMethodController`, `PayoutMethodVerificationController`, et leurs FormRequests.
- [ ] `DisbursementDriverContract` + `ManualDisbursementDriver` (selon l'ADR). `markProcessed`
  recopie la destination masquée dans `payouts.metadata`.
- [ ] Notifications `PayoutProcessedNotification` (net, référence, destination masquée) et
  `PayoutFailedNotification` (motif), envoyées au bénéficiaire. Plus `PayoutMethodChangedNotification`.

### 5. Facture conforme (AD12)

- [ ] Même migration agence : `legal_name`, `ninea`, `rccm`, `legal_address`, `default_tax_rate`
  decimal(5,2) nullable. On recopie depuis `metadata.legal_info` (`company_legal_name`, `ninea`, `rc`,
  `address_fiscale`) — jamais `rib_pro`, que 601 supprime de `metadata.legal_info` —, et
  `AgencyKindFlipService` écrit désormais ces quatre valeurs dans les colonnes. `AgencyUpdateRequest` les
  accepte pour une agence `standard` et les déclare `prohibited` pour une agence `individual` ;
  `ninea`/`rccm` : `['sometimes','nullable','string','max:30']`, sans contrôle de forme (D-68).
- [ ] Migration `add_numbering_and_credit_notes_to_invoices_table` : `kind` (défaut `invoice`),
  `credited_invoice_id` (FK `invoices_credited_invoice_fk`), `sequence_year`, `sequence_number`. Index
  unique `invoices_agency_kind_seq_unique` sur `(agency_id, kind, sequence_year, sequence_number)`.
  L'unicité de `reference_number` devient `invoices_agency_reference_unique` `(agency_id, reference_number)`,
  plus un index partiel `invoices_reference_no_agency_unique` pour `agency_id IS NULL`.
- [ ] `App\Services\Invoice\InvoiceNumberAllocator`, appelé par `InvoiceService::send`,
  `InvoiceService::markPaid` quand la facture est encore `draft`, `EarlyTerminationService` et
  `DepositRefundService` (si non brouillon). Format `FA-{année}-{00001}` / `AV-{année}-{00001}`.
- [ ] `InvoiceService::resolveInvoiceableTarget` reçoit l'agence de la facture et refuse (422, clé
  `money_out.invoice.foreign_target`) un bail ou une réservation d'une autre agence.
- [ ] `InvoiceService::create` : `tax_rate` absent ⇒ `agency.default_tax_rate`, à défaut 0. Un
  `tax_rate` explicite gagne. `InvoiceService::cancel` sur `sent`/`overdue` crée l'avoir dans la même
  transaction.
- [ ] `pdf/invoices/default.blade.php` (+ `layouts/base`) : raison sociale, NINEA, RCCM et adresse au
  pied quand ils existent, sans libellé vide ; « Avoir » et la facture d'origine pour un avoir.

### 6. Facture d'intervention (P8)

- [ ] Migration `create_service_provider_bills_table` : `maintenance_request_id`, `agency_id`,
  `property_id`, `provider_id`, `reference_number` (`SPB-`), `provider_reference` nullable, `amount`,
  `currency`, `exceeds_quote` bool, `status` (`pending_validation`|`validated`|`rejected`|`paid`|`cancelled`),
  `validated_by_id`, `validated_at`, `rejection_reason`, `rechargeable_to_landlord` bool,
  `imputed_payout_id`. Index unique partiel `sp_bills_one_open_per_request` sur
  `maintenance_request_id` hors `rejected`/`cancelled`.
- [ ] `App\Observers\MaintenanceRequestObserver` (`ShouldHandleEventsAfterCommit`), enregistré dans
  `AppServiceProvider`. Au passage à `completed`, avec un `assigned_to` et un montant > 0 (le coût
  réel s'il est fourni, sinon le devis approuvé), il crée la facture **sans exception attendue** :
  `insertOrIgnore`, ou bien une vérification d'existence sous verrou de la demande.
- [ ] `ServiceProviderBillPolicy`, `ServiceProviderBillController` (`index`, `show`, `validate`,
  `reject`, `pay`). `pay` crée un `Payout` `payee_role = service_provider` : même seuil, mêmes quatre
  yeux, même destination vérifiée.

### 7. Reversements plateforme de l'hôte individuel (AD18)

- [ ] `Me\PlatformPayoutController::index` exige `agency.update_billing` à l'agence du profil actif (403 sinon).
- [ ] Front : l'hôte individuel consulte ses reversements plateforme. **Option retenue par défaut** : retirer
  `/admin/agency/billing` de `PRO_ROUTES` et la redirection de sa page, et masquer pour `individual`
  le seul bloc d'abonnement. `scripts/check-pro-routes.mjs` reste vert.

### Front (intentionnel)

- [ ] Préparation d'un reversement par bailleur et période, montants en lecture seule ; file « À
  approuver » ; référence obligatoire au marquage payé ; avoir visible sur la facture d'origine ;
  mentions légales, TVA par défaut et seuil d'approbation dans les réglages de l'agence ; relevés côté
  bailleur ; moyens de versement dans le profil (bailleur, prestataire) et leur vérification côté
  agence ; factures d'intervention côté prestataire et côté agence ; clôture plateforme avec exclusions.

### Tests

- [ ] `PayoutPreparationTest`, `PayoutApprovalTest`, `OwnerStatementTest`, `PayoutMethodTest`,
  `PlatformPayoutSegregationTest`, `MePlatformPayoutAccessTest`, `InvoiceNumberingTest`,
  `InvoiceCreditNoteTest`, `InvoiceLegalMentionsTest`, `ServiceProviderBillTest`,
  `PayoutApprovalThresholdTest`, `PayoutItemScopeTest`, `RemindDuePayoutsCommandTest`,
  `PlatformPayoutFreezeTest`, `InvoiceTargetScopeTest`, ainsi que `PayoutTest` /
  `PlatformPayoutTest` mis à jour (`test_scheduled_payout_gets_scheduled_status` et
  `test_agency_user_can_create_payout` passent aux identifiants de pièces). Côté front, les tests
  des écrans touchés.

## Critères d'acceptation

- [ ] **AC1 — calcul.** Prenons un bail à `commission_rate = 10` avec, en septembre 2026, un loyer de
  200 000 payé, des charges de 20 000 payées, une caution de 400 000 payée et un loyer de 200 000
  `pending`. La préparation de septembre rend brut **220 000**, commission **22 000**, net **198 000**.
  Le même bail sans taux, dans une agence à 8 %, rend une commission de **17 600**.
- [ ] **AC2 — pas de brut saisi.** `POST /api/payouts` avec `gross_amount` rend 422 sur ce champ. Le
  reversement créé à partir des identifiants porte le brut de AC1, quel que soit le corps envoyé.
- [ ] **AC3 — une seule fois.** Un second reversement qui inclut un `lease_payment_id` déjà reversé
  rend 409, et la base ne contient qu'une ligne pivot pour ce paiement. Après `cancel` du premier, le
  même paiement est de nouveau reversable. Deux périodes qui se chevauchent ne comptent pas deux fois
  le même loyer.
- [ ] **AC4 — caution.** Un remboursement de caution crée un `Payout` `payee_role = tenant`. Il
  n'apparaît ni dans le relevé du bailleur ni dans la préparation.
- [ ] **AC5 — relevé.** Avec les données de AC1 reversées et une facture d'intervention refacturable
  de 15 000, le relevé de septembre rend encaissé 220 000, commission 22 000, frais 15 000, net
  **183 000**, plus la référence du reversement. Le PDF rend 200 `application/pdf`. Un autre bailleur
  de la **même** agence reçoit 403 sur ce relevé, et un agent sans `payouts.create` aussi.
  `period=2026` rend la somme annuelle.
- [ ] **AC6a — pas de seuil par défaut (porteur, 2026-10-06).** Une agence créée par sa factory
  après la migration, et une agence existante avant elle, ont `payout_approval_threshold = null`.
  Dans cette agence, un net de 150 000 naît `pending` (jamais `awaiting_approval`), et **son
  émetteur seul** le marque payé : 200, `processed_by_id` = l'émetteur. On pose ensuite le seuil à
  100 000 (deux approbateurs présents) : le même reversement, préparé à nouveau, naît
  `awaiting_approval` et `mark-processed` par l'émetteur rend 422. **Ablation** : forcer un seuil
  `0` par défaut dans la migration rougit la première moitié ; ignorer le seuil dans
  `PayoutService::create` rougit la seconde.
- [ ] **AC6 — quatre yeux, agence.** Seuil à 100 000. Un net de 150 000 est créé en
  `awaiting_approval`, et `mark-processed` y rend 422. L'émetteur qui approuve reçoit **403**. Un
  second détenteur de `payouts.approve` approuve, et le statut passe à `pending`. L'approbateur qui
  marque payé reçoit 403 ; l'émetteur, lui, obtient 200, et sans `transaction_id` il reçoit 422. Un
  net de 50 000 naît directement `pending`. **Ablation** : retirer l'appel à `SegregationOfDuties`
  rougit les deux cas 403.
- [ ] **AC7 — bénéficiaire.** Seuil actif : un admin d'agence qui est aussi le bailleur du
  reversement reçoit 403 sur `approve` alors qu'il détient `payouts.approve`.
- [ ] **AC8 — seuil.** Activer le seuil dans une agence à un seul détenteur de `payouts.approve` rend
  422 et la colonne reste `null` ; avec deux détenteurs, 200. Un membre sans `payouts.approve` qui
  le modifie (ou le remet à `null`) reçoit 403. Chaque changement accepté écrit une entrée
  `agency_payout_threshold_changed` portant l'ancienne et la nouvelle valeur.
- [ ] **AC9 — quatre yeux, plateforme.** SA1 clôture. SA1 qui approuve reçoit 403 ; SA2 approuve.
  SA2 qui marque payé reçoit 403. SA1 marque payé, et sans `payment_reference` il reçoit 422.
  `closed_by_id`, `approved_by` et `paid_by_id` valent SA1, SA2, SA1. Le nouveau test rougit sur le
  code actuel, où un seul acteur passe tout.
- [ ] **AC10 — conformité.** Une agence `suspended` qui a des paiements éligibles n'obtient **aucun**
  `PlatformPayout` à la clôture globale et figure dans la liste des exclues (`agency_not_active`).
  L'approbation du reversement d'une agence `standard` non vérifiée rend 422. **Gel** : une agence
  active est clôturée (`pending`), puis passée `suspended` ; `approve` rend 422, et un reversement
  déjà `approved` d'une agence suspendue rend 422 sur `mark-paid`, statut inchangé. Les deux cas
  rougissent sur le code actuel (200 aujourd'hui).
- [ ] **AC11 — lecture des reversements plateforme.** `GET /api/me/payouts` avec un profil
  propriétaire ou agent de l'agence rend **403**, et avec le profil admin 200. Le test rougit sur le
  code actuel.
- [ ] **AC12 — numérotation.** L'agence A émet trois factures en 2026 : `FA-2026-00001`, `00002`,
  `00003` dans l'ordre d'émission. L'agence B émet sa première : `FA-2026-00001`, sans conflit. Un
  brouillon annulé n'a consommé aucun numéro. La pénalité de résiliation anticipée, créée directement
  émise, reçoit un numéro de la séquence. Un brouillon passé directement par `mark-paid` reçoit le
  numéro suivant (`FA-2026-00004` pour A). **Ablation** : retirer l'appel à l'allocateur dans un des
  quatre sites rougit le test qui énumère ces quatre sites.
- [ ] **AC13 — avoir.** L'annulation d'une facture émise de 118 000 la passe `cancelled` et crée un
  avoir `AV-2026-00001` de 118 000, avec `credited_invoice_id` égal à l'originale. Annuler un
  brouillon ne crée pas d'avoir.
- [ ] **AC14 — mentions et TVA.** Avec une agence à NINEA `0012345 2G3`, le rendu HTML du PDF contient
  cette valeur ; sans NINEA, il ne contient aucun libellé « NINEA ». Avec `default_tax_rate = 18`,
  une facture créée sans `tax_rate` sur 100 000 donne 18 000 de taxe ; avec `tax_rate = 0` explicite,
  elle donne 0. Une agence dont `metadata.legal_info` porte `ninea = 0012345 2G3` et `rib_pro` a,
  après migration, `agencies.ninea = '0012345 2G3'`, et la valeur de `rib_pro` n'apparaît dans
  aucune colonne d'`agencies` (sa suppression de `metadata` est chez 601 ; ablation : recopier `rib_pro` rougit le
  test). `PATCH /api/agencies/{id}` avec `ninea` sur une agence `individual` rend 422 ; une valeur
  de forme quelconque (`ABC`) est acceptée sur une agence `standard` (pas de contrôle de forme, D-68).
- [ ] **AC15 — facture d'intervention.** Une demande passée à `completed`, avec un prestataire assigné
  et un devis approuvé de 50 000, crée **une** facture `pending_validation` de 50 000. Avec un coût
  réel de 60 000, la facture vaut 60 000 et porte `exceeds_quote = true`. Repasser par `completed` ne
  crée pas de seconde facture, et sans prestataire assigné aucune n'est créée. Une fois validée,
  `pay` crée un `Payout` `service_provider` soumis à AC6. Le prestataire lit ses factures et reçoit
  404 sur celle d'un autre.
- [ ] **AC16 — destination.** Les valeurs brutes en base (`DB::table`) de `account_identifier` et
  d'`account_holder_name` diffèrent de celles saisies, et aucune entrée d'`activity_log` ne contient
  le numéro en clair.
  La ressource rend la forme masquée à l'agence et la forme claire au titulaire. Marquer payé un
  reversement Wave vers une destination non vérifiée rend 422. Modifier une destination la
  dé-vérifie et notifie le titulaire.
- [ ] **AC17 — avis.** `mark-processed` notifie le bénéficiaire avec le net et la référence ;
  `mark-failed` le notifie avec le motif. Les deux contenus passent par des clés `money_out.*`, et le
  test échoue si l'un des deux contient un littéral.
- [ ] **AC18 — hôte individuel.** Un admin d'agence `individual` atteint ses reversements plateforme
  sans redirection, et `check-pro-routes.mjs` passe.
- [ ] **AC19 — pièces de l'agence et du bailleur.** `POST /api/payouts` qui cite un `lease_payment_id`
  d'un bail d'une **autre agence** rend 422 (`money_out.payout.foreign_item`) ; un paiement d'un bail
  de la même agence mais d'un **autre bailleur** rend 422 ; un corps sans aucune pièce rend 422 ; un
  corps avec `lease_id` rend 422 sur ce champ. Dans les quatre cas, aucune ligne `payouts` ni pivot
  n'est écrite. Rouge aujourd'hui : le `lease_id` d'une autre agence est accepté (201).
  **Ablation** : retirer la vérification de périmètre de `PayoutService::create` rougit les deux
  premiers cas.
- [ ] **AC20 — échéance d'un reversement programmé.** Un reversement `scheduled` dont `scheduled_at`
  est hier et un `pending` dont `scheduled_at` est hier : `payouts:remind-due` notifie l'émetteur de
  chacun (2 notifications). Relancée, la commande n'en envoie aucune de plus. Un reversement dont
  `scheduled_at` est demain, et un `completed` échu, ne produisent rien. `routes/console.php`
  planifie la commande (test sur `Schedule::events()`).
- [ ] **AC21 — clôture globale.** Trois agences A, B, C ont des paiements éligibles au 2026-09-30 ; B
  est déjà clôturée pour cette date (puis un paiement tardif de B, `paid_at` au 2026-09-20, est
  enregistré). `close-period` sans `agency_id` rend 201, crée les reversements de A **et** de C, et
  liste B dans les exclues avec `already_closed`. Rouge aujourd'hui : la réponse est 409 quel que soit
  l'ordre de traitement, et l'agence traitée après B n'a pas de reversement.
- [ ] **AC22 — cible de facture.** `POST /api/invoices` avec `invoiceable_type = lease` et l'id d'un
  bail d'une autre agence rend 422 (`money_out.invoice.foreign_target`) et n'écrit rien ; avec un
  bail de l'agence, 201. Rouge aujourd'hui (201 dans les deux cas).
- [ ] **AC23 — la caution n'est pas un reversement au bailleur.** Après un remboursement de caution
  sur le bail du bailleur L, `GET /api/payouts?filter[landlord_id]=L&filter[payee_role]=landlord&filter[status]=pending`
  ne rend pas ce `Payout` ; sans le filtre `payee_role`, il le rend avec `payee_role = "tenant"`. La
  migration de données passe les `Payout` de caution existants à `tenant` : sur une base où
  deux `Payout` de caution ont été insérés comme les écrit le code actuel (sans `payee_role`, joints
  à leur `LeasePayment` `deposit_refund`) et un reversement ordinaire, le compte `payee_role = tenant`
  vaut **2** et `landlord` **1** après la migration.

## Hors périmètre

Aucun défaut relevé n'est rangé ici : ce qui suit sont des améliorations, ou des défauts portés par
le ticket nommé (vérifié dans son texte).

- Le pilote de décaissement **automatique** (API Wave Business / Orange Money), qui fera l'objet d'un
  ticket suivant selon l'ADR.
- Les quatre yeux sur les remboursements de réservation et sur les passages en perte : une
  **amélioration**, pas un défaut. La décision du porteur fait des quatre yeux d'agence un réglage
  que l'agence active ; les étendre ne changerait rien au comportement par défaut. Le défaut réel du
  remboursement — le client qui solde son propre acompte — est porté par TCK-596
  (`RefundBookingPaymentRequest::authorize`). Aucune route de passage en perte n'existe :
  `invoices.write_off` n'est lue que par l'annulation, que TCK-587 autorise et dont ce ticket fait un
  avoir.
- Le PDF de la facture d'intervention (auto-facturation ; option retenue par défaut : non).
- Les journaux comptables, la balance âgée et les commissions par agent (TCK-595).
- La relance d'impayés et le lien de paiement sans compte (TCK-588, TCK-602).
- Qui peut lire ou marquer un `Payout` ou une `Invoice` (TCK-587).

## Notes d'implémentation

_(à remplir par implementing-specs)_
