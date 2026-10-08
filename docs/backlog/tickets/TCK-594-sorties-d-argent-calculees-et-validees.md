---
id: TCK-594
title: "Les sorties d'argent ne sont ni calculées, ni contrôlées, ni tracées : le brut d'un reversement se saisit à la main, une seule personne crée, approuve et paie, et la facture porte un numéro aléatoire"
status: done
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-08
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
  **Rien n'est vérifié d'office** (VERIF-594 B-1, décision du 2026-10-08 : un numéro égal au
  téléphone vérifié du compte attend lui aussi l'agence — ce téléphone se change et se revérifie en
  libre-service). Ajouter ou modifier
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

- [x] **ADR à écrire et accepter avant le code** : « Les sorties d'argent ». Il tranche :
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

- [x] Migration `add_payee_and_approval_columns_to_payouts_table` : `payee_role` string défaut
  `landlord`, `approved_by_id`, `approved_at`, `processed_by_id`, `payout_method_id`,
  `service_provider_bill_id`, chacune avec une FK nommée explicitement. **Origine obligatoire** : le
  CHECK `lease_id OR booking_id` de models-spec §28 ne tient plus dès qu'un reversement couvre
  plusieurs baux d'un même bailleur (un virement par bailleur et par mois). L'origine se garantit
  donc à l'écriture : au moins une pièce (paiement de bail, de réservation, ou facture
  d'intervention) est exigée par `StorePayoutRequest` et revérifiée par `PayoutService::create`.
  Compter en préproduction les `Payout` sans `lease_id`, `booking_id` ni pivot ; le compte va dans
  les Notes. La ligne §28 de models-spec est à corriger par la session (fichier de retour).
  ⚠ **Compte en préproduction non relevé** : l'agent n'a pas d'accès à la préproduction ; à relever
  par la session avant la promotion (voir le rapport, « Pour la session »).
- [x] Migration de données : `payee_role = tenant` pour les reversements nés de `DepositRefundService`.
  On les identifie par jointure avec le `LeasePayment` `deposit_refund` de même bail, même montant et
  même seconde de création, et le compte va dans les Notes. `DepositRefundService` écrit désormais
  `payee_role = tenant`.
  ⚠ **Compte en préproduction non relevé** (même raison) ; la reprise est prouvée sur une base de
  test (AC23 : 2 `tenant`, 1 `landlord`).
- [x] Migration `add_unique_payment_to_payout_pivots` : index uniques
  `payout_lp_lease_payment_unique` et `payout_bp_booking_payment_unique`. Dédoublonner au préalable
  les lignes du seeder.
- [x] `PayoutStatus::AwaitingApproval` (`awaiting_approval`). Transitions : `awaiting_approval →
  pending` (approbation ; `scheduled` si `scheduled_at` est posé) et `awaiting_approval → cancelled`.
  `markProcessed` et `markFailed` refusent `awaiting_approval` (422). Un reversement ne naît
  `awaiting_approval` que si `agencies.payout_approval_threshold` n'est pas `null` et que net ≥ seuil.
- [x] Service `App\Services\Payout\PayoutPreparationService::prepare()` ; contrôleur
  `PayoutPreparationController` ; `PreparePayoutRequest` (autorisation `can('create', Payout::class)`).
- [x] `StorePayoutRequest` : `gross_amount`, `commission_amount` et `fees_amount` passent en
  **`prohibited`** ; ajout de `lease_payment_ids[]`, `booking_payment_ids[]`,
  `service_provider_bill_ids[]` et `payout_method_id` ; `lease_id` et `booking_id` passent en
  `prohibited` (ils se déduisent des paiements). Au moins un identifiant de pièce est requis.
  `PayoutService::create` recalcule tout, attache les pivots et détache sur `cancel`/`markFailed`.
- [x] `PayoutService::create` vérifie, avant toute écriture, que chaque pièce citée relève de
  l'agence du profil actif et du bailleur désigné (Contraintes) ; sinon 422 avec la clé
  `money_out.payout.foreign_item` et l'identifiant fautif. `lease_id` (resp. `booking_id`) du
  `Payout` est rempli quand toutes les pièces relèvent d'un même bail (resp. réservation), sinon
  `null` : les pivots portent alors l'origine.
- [x] `Payout::$requestFilterable` gagne `payee_role` ; `PayoutResource` le rend.
- [x] Commande `payouts:remind-due` (quotidienne) : notifie l'émetteur (`PayoutDueNotification`, clés `money_out.*`) des reversements `pending` **ou
  `scheduled`** dont `scheduled_at` est échu, **une fois** (`metadata.due_reminded_at`). Elle
  n'exécute rien tant que le décaissement est manuel.

### 2. Relevé de gérance (O8 = AD11)

- [x] `App\Services\Payout\OwnerStatementService`. Il produit, par agence, par bien puis consolidé :
  loyers encaissés, commission, frais d'intervention, net reversé avec ses références, et impayés de
  la période. Il ne lit que `payee_role = landlord`.
- [x] `OwnerStatementController` (`index`, `pdf`, `csv`), `OwnerStatementRequest` (`period` au format
  `YYYY-MM` ou `YYYY`), nouvelle `OwnerStatementPolicy`. Le bailleur lit le sien ; un membre détenant
  `payouts.create` lit ceux des bailleurs de **son** agence.
- [x] Gabarit `resources/views/pdf/statements/owner.blade.php` sur `layouts/base`, avec les mentions
  légales du § 5.
- [x] Commande `payouts:send-owner-statements` mensuelle (le 1er, 08:00, heure de Dakar), avec la
  notification `OwnerStatementAvailableNotification`.

### 3. Quatre yeux

- [x] `App\Support\SegregationOfDuties` : `assertDistinct(User $actor, array $priorActorIds, string $step)`.
- [x] **3a** : `PayoutPolicy::approve()` (capacité `payouts.approve` à l'agence du reversement).
  `ApprovePayoutRequest`, `PayoutController::approve`, route `payouts.approve`. `PayoutService`
  appelle `SegregationOfDuties` dans `approve()` et `markProcessed()`.
  `MarkProcessedPayoutRequest` : `transaction_id` est `required_unless:payment_method,cash`.
- [x] Migration `add_payout_settings_and_legal_columns_to_agencies_table` (voir § 5) :
  `payout_approval_threshold` decimal(14,2) nullable, **sans défaut et sans reprise** : `null` pour
  toute agence existante comme pour toute agence créée ensuite (porteur, 2026-10-06). C'est une
  **colonne** et non `settings` : `AgencyUpdateRequest.php:37` remplace le tableau `settings` entier.
- [x] `AgencyUpdateRequest` : `payout_approval_threshold` `['sometimes','nullable','numeric','min:0']`.
  Le poser à une valeur non nulle exige `payouts.approve` (403 sinon) et au moins deux membres actifs
  de l'agence détenant `payouts.approve` (422, clé `money_out.threshold.needs_two_approvers`) ; le
  remettre à `null` exige `payouts.approve`. Tout changement écrit une entrée d'activité
  `agency_payout_threshold_changed` (ancienne et nouvelle valeur).
- [x] Notification `PayoutAwaitingApprovalNotification` aux détenteurs de `payouts.approve`, sauf l'émetteur.
- [x] **3b** : migration `add_segregation_columns_to_platform_payouts_table` : `closed_by_id`,
  `paid_by_id`, `approved_at`, `payment_reference`. `PlatformPayoutService` : `closeForAgency` écrit
  `closed_by_id`, `approve` et `markPaid` appellent `SegregationOfDuties`.
  `MarkPlatformPayoutPaidRequest` : `payment_reference` required.
- [x] `closeForAgency` / `agenciesWithUnpaidEligiblePayments` : on exclut `status <> active`, et la
  réponse de `close-period` liste les exclues avec leur motif (`agency_not_active`,
  `already_closed`). `approve` refuse (422) une agence `standard` non vérifiée. Pour une agence
  `individual`, l'état de vérification est seulement affiché (option retenue par défaut).
- [x] **Gel** : `approve` et `markPaid` relisent `agencies.status` et refusent (422, clé
  `money_out.platform.agency_frozen`) une agence non active, même si le `PlatformPayout` a été clôturé
  quand elle l'était.
- [x] **Clôture globale non interrompue** : sans `agency_id`, `closePeriod` traite chaque agence
  dans sa transaction ; une agence déjà clôturée pour cette date (vérification du `existing` avant
  toute insertion) est **rangée dans les exclues** avec `already_closed` au lieu de lever 409, et la
  boucle continue. Le cas d'une course perdue sur l'index unique partiel ne s'attrape pas dans la
  transaction (piège n°1) : la transaction de cette agence échoue, son identifiant rejoint les
  exclues **après** le rollback, et les suivantes sont traitées. Avec `agency_id`, le 409 actuel est
  conservé (`test_close_period_is_idempotent_and_returns_409_on_replay` reste vert).
- [x] Réécrire `test_full_happy_path_pending_to_paid` avec deux super-admins distincts.

### 4. Destinations et décaissement (O7, P8)

- [x] Migration `create_payout_methods_table` : `user_id`, `kind` (`wave`|`orange_money`|`free_money`|`bank_transfer`),
  `account_identifier` et `account_holder_name` (`text`, mécanisme de chiffrement de TCK-601 :
  cast `encrypted`, `$hidden`, masqueur), `masked_identifier` (calculé par le masqueur de 601),
  `is_default`, `verified_at`, `verified_by_id`, soft delete. Modèle `PayoutMethod`, `PayoutMethodPolicy`,
  `Me\PayoutMethodController`, `PayoutMethodVerificationController`, et leurs FormRequests.
- [x] `DisbursementDriverContract` + `ManualDisbursementDriver` (selon l'ADR). `markProcessed`
  recopie la destination masquée dans `payouts.metadata`.
- [x] Notifications `PayoutProcessedNotification` (net, référence, destination masquée) et
  `PayoutFailedNotification` (motif), envoyées au bénéficiaire. Plus `PayoutMethodChangedNotification`.

### 5. Facture conforme (AD12)

- [x] Même migration agence : `legal_name`, `ninea`, `rccm`, `legal_address`, `default_tax_rate`
  decimal(5,2) nullable. On recopie depuis `metadata.legal_info` (`company_legal_name`, `ninea`, `rc`,
  `address_fiscale`) — jamais `rib_pro`, que 601 supprime de `metadata.legal_info` —, et
  `AgencyKindFlipService` écrit désormais ces quatre valeurs dans les colonnes. `AgencyUpdateRequest` les
  accepte pour une agence `standard` et les déclare `prohibited` pour une agence `individual` ;
  `ninea`/`rccm` : `['sometimes','nullable','string','max:30']`, sans contrôle de forme (D-68).
- [x] Migration `add_numbering_and_credit_notes_to_invoices_table` : `kind` (défaut `invoice`),
  `credited_invoice_id` (FK `invoices_credited_invoice_fk`), `sequence_year`, `sequence_number`. Index
  unique `invoices_agency_kind_seq_unique` sur `(agency_id, kind, sequence_year, sequence_number)`.
  L'unicité de `reference_number` devient `invoices_agency_reference_unique` `(agency_id, reference_number)`,
  plus un index partiel `invoices_reference_no_agency_unique` pour `agency_id IS NULL`.
- [x] `App\Services\Invoice\InvoiceNumberAllocator`, appelé par `InvoiceService::send`,
  `InvoiceService::markPaid` quand la facture est encore `draft`, `EarlyTerminationService` et
  `DepositRefundService` (si non brouillon). Format `FA-{année}-{00001}` / `AV-{année}-{00001}`.
- [x] `InvoiceService::resolveInvoiceableTarget` reçoit l'agence de la facture et refuse (422, clé
  `money_out.invoice.foreign_target`) un bail ou une réservation d'une autre agence.
- [x] `InvoiceService::create` : `tax_rate` absent ⇒ `agency.default_tax_rate`, à défaut 0. Un
  `tax_rate` explicite gagne. `InvoiceService::cancel` sur `sent`/`overdue` crée l'avoir dans la même
  transaction.
- [x] `pdf/invoices/default.blade.php` (+ `layouts/base`) : raison sociale, NINEA, RCCM et adresse au
  pied quand ils existent, sans libellé vide ; « Avoir » et la facture d'origine pour un avoir.

### 6. Facture d'intervention (P8)

- [x] Migration `create_service_provider_bills_table` : `maintenance_request_id`, `agency_id`,
  `property_id`, `provider_id`, `reference_number` (`SPB-`), `provider_reference` nullable, `amount`,
  `currency`, `exceeds_quote` bool, `status` (`pending_validation`|`validated`|`rejected`|`paid`|`cancelled`),
  `validated_by_id`, `validated_at`, `rejection_reason`, `rechargeable_to_landlord` bool,
  `imputed_payout_id`. Index unique partiel `sp_bills_one_open_per_request` sur
  `maintenance_request_id` hors `rejected`/`cancelled`.
- [x] `App\Observers\MaintenanceRequestObserver` (`ShouldHandleEventsAfterCommit`), enregistré dans
  `AppServiceProvider`. Au passage à `completed`, avec un `assigned_to` et un montant > 0 (le coût
  réel s'il est fourni, sinon le devis approuvé), il crée la facture **sans exception attendue** :
  `insertOrIgnore`, ou bien une vérification d'existence sous verrou de la demande.
- [x] `ServiceProviderBillPolicy`, `ServiceProviderBillController` (`index`, `show`, `validate`,
  `reject`, `pay`). `pay` crée un `Payout` `payee_role = service_provider` : même seuil, mêmes quatre
  yeux, même destination vérifiée.

### 7. Reversements plateforme de l'hôte individuel (AD18)

- [x] `Me\PlatformPayoutController::index` exige `agency.update_billing` à l'agence du profil actif (403 sinon).
- [x] Front : l'hôte individuel consulte ses reversements plateforme. **Option retenue par défaut** : retirer
  `/admin/agency/billing` de `PRO_ROUTES` et la redirection de sa page, et masquer pour `individual`
  le seul bloc d'abonnement. `scripts/check-pro-routes.mjs` reste vert.

### 8. Ajoutés après vérification adverse (VERIF-594, 2026-10-08)

- [x] **B-1** — la vérification d'office disparaît : toute destination attend un membre de l'agence.
- [x] **M-1** — le seuil se juge sur le cumul des nets non approuvés vers le même bénéficiaire,
  dans l'agence, sur 30 jours glissants (`PayoutApprovalRule`), sous le verrou de la ligne agence.
  *(27 jours depuis la passe 2, N-3.)*
- [x] **M-2** — relâcher le seuil (le couper, le relever) attend un second détenteur de
  `payouts.approve` : 202 et `pending_payout_threshold_change`, les autres détenteurs avisés,
  confirmation par `POST /api/agencies/{id}/payout-threshold/confirm` ; 403
  `payout.threshold_needs_second_approver` s'il n'y en a qu'un ; un resserrement reste immédiat.
  Écran : la demande en attente se lit et se confirme dans les réglages.
- [x] **M-3** — la caution rendue naît par `PayoutService::initialStatus()` et avise les approbateurs
  (`notifyApprovers()`, rendus publics) ; seule l'exemption de destination du locataire reste.
- [x] **M-6** — la vérification d'une destination vaut par agence : table
  `payout_method_verifications`, `verifiedDestination` exige celle de l'agence du reversement, une
  destination modifiée les perd toutes ; colonnes `verified_at` / `verified_by_id` retirées.
- [x] **M-4** — l'approbation fige la destination (`approved_payout_method_id`, forme masquée,
  empreinte HMAC du numéro) ; `mark-processed` refuse une autre destination ou la même au numéro
  changé (422 `payout.destination_changed_since_approval`) ; l'approbateur voit la destination
  masquée (API et écran) ; le vérificateur d'une destination ne la paie pas dans les 24 h (403
  `payout.verifier_cannot_pay_yet`).
- [x] **m-1** — une agence `individual` ne reverse qu'à son hôte : `PayoutService::create` rend
  422 `payout.individual_third_party` pour un bénéficiaire sans `AgencyAdminProfile` dans l'agence.
  `createForBill` reste permis (exception écrite à l'ADR-0039 §2).
- [x] **m-2** — `AgencyResource` ne rend `payout_approval_threshold` et
  `pending_payout_threshold_change` qu'aux détenteurs de `payouts.approve` ou `payouts.create` de
  l'agence (`rib_pro` relève de TCK-601, non touché).
- [x] **m-3** — la facture d'intervention naît à l'unité de la devise (`MaintenanceRequestObserver`,
  `Currency::decimalPlacesOf`, demi vers le haut), et `createForBill` arrondit de même le montant
  d'une facture antérieure : le prestataire reçoit ce que le bailleur paie.
- [x] **m-4** — le test du verrou de numérotation relève le niveau de transaction AU verrou
  (contre la base de `RefreshDatabase`) ; `PaymentGatewayService::verify` applique l'état et le
  numéro dans une transaction, l'appel au prestataire restant dehors.
- [x] **m-5** — `InvoiceService::send` relit la facture sous `lockForUpdate()` dans sa transaction
  et y juge `draft` ; `cancel` et `markPaid`, qui portaient le même défaut, aussi.
- [x] **M-5** — `markFailed` et `cancel` jugent le statut sur la ligne verrouillée ; `Payout::booted`
  refuse toute sortie de `completed`.

### 9. Ajoutés après la passe 2 (VERIF-594 passe 2, 2026-10-08)

- [x] **N-1** — préparé sans destination, un reversement prend la destination par défaut du
  bénéficiaire vérifiée pour l'agence (`create`, `createForBill`) ; l'approbateur peut fixer ou
  remplacer la destination en approuvant (`payout_method_id`, vérifiée pour l'agence, sinon 422
  `payout.unverified_destination`), et lit pour cela les destinations masquées du bénéficiaire.
  Front : `CreatePayoutDialog` présélectionne la destination par défaut vérifiée ;
  `PayoutDetailDialog` propose à l'approbateur les destinations vérifiées, masquées.
- [x] **N-2** — `cancel` et `markFailed` d'un reversement `tenant` rendent son montant au bail
  (`deposit_refunded_amount`, `deposit_refunded_at` à nul à solde nul), sous le verrou du bail, une
  seule fois ; la ligne `deposit_refund` passe `failed` et l'activité `deposit_refund_reversed` le
  trace.
- [x] **N-3** — la fenêtre du cumul passe à 27 jours glissants (`PayoutApprovalRule::WINDOW_DAYS`,
  seule valeur ; la préparation la rend en `approval_window_days`, que le bandeau de l'écran affiche).
- [x] **N-4** — une demande de relâchement du seuil expire au bout de 7 jours
  (`PayoutApprovalThreshold::REQUEST_TTL_DAYS`) : confirmée après, 422
  `payout.threshold_request_expired`, demande effacée et tracée ; `AgencyResource` ne la rend plus, et
  rend `expires_at` pour une demande en cours.
- [x] **N-5** — `POST /api/agencies/{id}/payout-threshold/confirm` exige `expected_threshold`
  (présent, nullable) ; une demande en cours différente rend 409 `payout.threshold_request_changed`.
  L'écran envoie la valeur affichée.

### 10. Ajoutés après la passe 3 (VERIF-594 passe 3, 2026-10-08)

- [x] **P3-1** — la restitution porte `metadata.invoice_id` (sa facture de retenue) et
  `metadata.lease_payment_id` (sa ligne `deposit_refund`) ; refusée ou échouée, sa facture de retenue
  s'annule par `InvoiceService::cancel` : brouillon annulé, facture émise contrepassée par un avoir,
  facture payée laissée telle quelle.
- [x] **P3-2** — la ligne `deposit_refund` se retrouve par `metadata.lease_payment_id`, jamais par
  son montant : `failed` au refus ou à l'échec, `paid` (avec `paid_at`) au paiement. Payée, elle
  reste une sortie : `PlatformPayoutService` ne la compte pas parmi les encaissements reversés à
  l'agence.
- [x] **P3-3** — l'approbateur qui cite une destination ne l'a pas vérifiée lui-même il y a moins de
  24 h (403 `payout.approver_verified_destination_recently`, fr, en, wo).
- [x] **Raccord TCK-589** — approuver, marquer payé, payer une facture d'intervention et gérer ses
  destinations sont sous step-up (`ProtectedActions::STEP_UP`) ; les actions mutantes ajoutées par 594
  aux familles protégées sont dans `AGENCY_TWO_FACTOR`.

### Front (intentionnel)

- [x] Préparation d'un reversement par bailleur et période, montants en lecture seule ; file « À
  approuver » ; référence obligatoire au marquage payé ; avoir visible sur la facture d'origine ;
  mentions légales, TVA par défaut et seuil d'approbation dans les réglages de l'agence ; relevés côté
  bailleur ; moyens de versement dans le profil (bailleur, prestataire) et leur vérification côté
  agence ; factures d'intervention côté prestataire et côté agence ; clôture plateforme avec exclusions.

### Tests

- [x] `PayoutPreparationTest`, `PayoutApprovalTest`, `OwnerStatementTest`, `PayoutMethodTest`,
  `PlatformPayoutSegregationTest`, `MePlatformPayoutAccessTest`, `InvoiceNumberingTest`,
  `InvoiceCreditNoteTest`, `InvoiceLegalMentionsTest`, `ServiceProviderBillTest`,
  `PayoutApprovalThresholdTest`, `PayoutItemScopeTest`, `RemindDuePayoutsCommandTest`,
  `PlatformPayoutFreezeTest`, `InvoiceTargetScopeTest`, ainsi que `PayoutTest` /
  `PlatformPayoutTest` mis à jour (`test_scheduled_payout_gets_scheduled_status` et
  `test_agency_user_can_create_payout` passent aux identifiants de pièces). Côté front, les tests
  des écrans touchés.

## Critères d'acceptation

- [x] **AC1 — calcul.** Prenons un bail à `commission_rate = 10` avec, en septembre 2026, un loyer de
  200 000 payé, des charges de 20 000 payées, une caution de 400 000 payée et un loyer de 200 000
  `pending`. La préparation de septembre rend brut **220 000**, commission **22 000**, net **198 000**.
  Le même bail sans taux, dans une agence à 8 %, rend une commission de **17 600**.
  **Preuve** : `PayoutPreparationTest::test_ac1_september_gross_commission_and_net_from_collected_rent_only`, `…_a_lease_without_rate_falls_back_on_the_agency_rate`, `test_commission_is_rounded_to_the_unit_line_by_line_in_xof`.
- [x] **AC2 — pas de brut saisi.** `POST /api/payouts` avec `gross_amount` rend 422 sur ce champ. Le
  reversement créé à partir des identifiants porte le brut de AC1, quel que soit le corps envoyé.
  **Preuve** : `PayoutPreparationTest::test_ac2_the_payout_created_from_the_ids_carries_the_computed_gross_whatever_the_body_says`. Ablation J2 (brut accepté) : rouge. Front : `CreatePayoutDialog.test.tsx` (aucun champ de montant ; W3).
- [x] **AC3 — une seule fois.** Un second reversement qui inclut un `lease_payment_id` déjà reversé
  rend 409, et la base ne contient qu'une ligne pivot pour ce paiement. Après `cancel` du premier, le
  même paiement est de nouveau reversable. Deux périodes qui se chevauchent ne comptent pas deux fois
  le même loyer.
  **Preuve** : `PayoutItemScopeTest::test_ac3_a_rent_is_paid_out_once_and_again_after_cancel`, `…_the_database_refuses_a_second_pivot_row_for_one_payment`, `test_the_period_bounds_paid_at_and_a_paid_out_rent_is_not_offered_again`. Ablation J3 : la garde applicative seule retirée reste verte, l'index unique tient (noté).
- [x] **AC4 — caution.** Un remboursement de caution crée un `Payout` `payee_role = tenant`. Il
  n'apparaît ni dans le relevé du bailleur ni dans la préparation.
  **Preuve** : `PayoutPayeeRoleTest::test_ac4_ac23_…`, `test_ac4_a_refunded_deposit_never_enters_the_preparation`, et `OwnerStatementTest::test_ac5_the_year_sums_the_months_and_a_deposit_refund_is_not_a_payout_of_the_landlord`. Ablation J4 : rouge.
- [x] **AC5 — relevé.** Avec les données de AC1 reversées et une facture d'intervention refacturable
  de 15 000, le relevé de septembre rend encaissé 220 000, commission 22 000, frais 15 000, net
  **183 000**, plus la référence du reversement. Le PDF rend 200 `application/pdf`. Un autre bailleur
  de la **même** agence reçoit 403 sur ce relevé, et un agent sans `payouts.create` aussi.
  `period=2026` rend la somme annuelle.
  **Preuve** : `OwnerStatementTest::test_ac5_*` (3 tests, PDF et CSV compris). Ablations H1 à H4 : rouges. Front : `OwnerStatementPanel.test.tsx` (W18 à W21).
- [x] **AC6a — pas de seuil par défaut (porteur, 2026-10-06).** Une agence créée par sa factory
  après la migration, et une agence existante avant elle, ont `payout_approval_threshold = null`.
  Dans cette agence, un net de 150 000 naît `pending` (jamais `awaiting_approval`), et **son
  émetteur seul** le marque payé : 200, `processed_by_id` = l'émetteur. On pose ensuite le seuil à
  100 000 (deux approbateurs présents) : le même reversement, préparé à nouveau, naît
  `awaiting_approval` et `mark-processed` par l'émetteur rend 422. **Ablation** : forcer un seuil
  `0` par défaut dans la migration rougit la première moitié ; ignorer le seuil dans
  `PayoutService::create` rougit la seconde.
  **Preuve** : `PayoutApprovalTest::test_ac6a_a_new_agency_has_no_threshold_and_its_issuer_pays_alone`, `…_an_agency_existing_before_the_migration_has_no_threshold`. Ablations A4 (défaut 0) et A5 (seuil ignoré) : rouges.
- [x] **AC6 — quatre yeux, agence.** Seuil à 100 000. Un net de 150 000 est créé en
  `awaiting_approval`, et `mark-processed` y rend 422. L'émetteur qui approuve reçoit **403**. Un
  second détenteur de `payouts.approve` approuve, et le statut passe à `pending`. L'approbateur qui
  marque payé reçoit 403 ; l'émetteur, lui, obtient 200, et sans `transaction_id` il reçoit 422. Un
  net de 50 000 naît directement `pending`. **Ablation** : retirer l'appel à `SegregationOfDuties`
  rougit les deux cas 403.
  **Preuve** : `PayoutApprovalTest::test_ac6_four_eyes_issuer_approver_and_payer_are_three_distinct_gestures`, `…_under_a_second_profile_in_another_agency`, `…_a_super_admin_issuer_does_not_approve_its_own_payout`, `test_an_amount_changed_after_approval_is_not_paid`. Ablations A2, A3, A8, I2 : rouges. Front : `PayoutDetailDialog.capacites.test.tsx` (W4, W5).
- [x] **AC7 — bénéficiaire.** Seuil actif : un admin d'agence qui est aussi le bailleur du
  reversement reçoit 403 sur `approve` alors qu'il détient `payouts.approve`.
  **Preuve** : `PayoutApprovalTest::test_ac7_an_admin_who_is_the_landlord_cannot_approve_its_own_payout` (deux gardes : policy et service, A2).
- [x] **AC8 — seuil.** Activer le seuil dans une agence à un seul détenteur de `payouts.approve` rend
  422 et la colonne reste `null` ; avec deux détenteurs, 200. Un membre sans `payouts.approve` qui
  le modifie (ou le remet à `null`) reçoit 403. Chaque changement accepté écrit une entrée
  `agency_payout_threshold_changed` portant l'ancienne et la nouvelle valeur.
  **Preuve** : `PayoutApprovalThresholdTest` (4 tests). Ablations A6, A7 : rouges. Front : `AgencyConfigForm.test.tsx`, `admin-schemas.test.ts` (W9 à W12).
- [x] **AC9 — quatre yeux, plateforme.** SA1 clôture. SA1 qui approuve reçoit 403 ; SA2 approuve.
  SA2 qui marque payé reçoit 403. SA1 marque payé, et sans `payment_reference` il reçoit 422.
  `closed_by_id`, `approved_by` et `paid_by_id` valent SA1, SA2, SA1. Le nouveau test rougit sur le
  code actuel, où un seul acteur passe tout.
  **Preuve** : `PlatformPayoutSegregationTest` (3 tests) et `PlatformPayoutTest::test_full_happy_path_pending_to_paid` (deux super-admins). Ablations B1, B2, B7, I2 : rouges. Front : `reversements-plateforme.tck-594.test.tsx` (W13 à W16).
- [x] **AC10 — conformité.** Une agence `suspended` qui a des paiements éligibles n'obtient **aucun**
  `PlatformPayout` à la clôture globale et figure dans la liste des exclues (`agency_not_active`).
  L'approbation du reversement d'une agence `standard` non vérifiée rend 422. **Gel** : une agence
  active est clôturée (`pending`), puis passée `suspended` ; `approve` rend 422, et un reversement
  déjà `approved` d'une agence suspendue rend 422 sur `mark-paid`, statut inchangé. Les deux cas
  rougissent sur le code actuel (200 aujourd'hui).
  **Preuve** : `PlatformPayoutFreezeTest::test_ac10_*` (3 tests). Ablations B3, B4, B6 : rouges. Front : exclusions affichées (W17).
- [x] **AC11 — lecture des reversements plateforme.** `GET /api/me/payouts` avec un profil
  propriétaire ou agent de l'agence rend **403**, et avec le profil admin 200. Le test rougit sur le
  code actuel.
  **Preuve** : `MePlatformPayoutAccessTest::test_ac11_owner_and_agent_profiles_get_403_the_admin_200`, `test_the_capability_is_read_not_the_role`. Ablation C1 : rouge.
- [x] **AC12 — numérotation.** L'agence A émet trois factures en 2026 : `FA-2026-00001`, `00002`,
  `00003` dans l'ordre d'émission. L'agence B émet sa première : `FA-2026-00001`, sans conflit. Un
  brouillon annulé n'a consommé aucun numéro. La pénalité de résiliation anticipée, créée directement
  émise, reçoit un numéro de la séquence. Un brouillon passé directement par `mark-paid` reçoit le
  numéro suivant (`FA-2026-00004` pour A). **Ablation** : retirer l'appel à l'allocateur dans un des
  quatre sites rougit le test qui énumère ces quatre sites.
  **Preuve** : `InvoiceNumberingTest` (6 tests). Ablations D1 à D5 (un site à la fois, et le verrou) : rouges.
- [x] **AC13 — avoir.** L'annulation d'une facture émise de 118 000 la passe `cancelled` et crée un
  avoir `AV-2026-00001` de 118 000, avec `credited_invoice_id` égal à l'originale. Annuler un
  brouillon ne crée pas d'avoir.
  **Preuve** : `InvoiceCreditNoteTest` (2 tests). Ablation D6 : rouge. Front : `InvoiceDetailDialog.avoir.test.tsx` (W6 à W8).
- [x] **AC14 — mentions et TVA.** Avec une agence à NINEA `0012345 2G3`, le rendu HTML du PDF contient
  cette valeur ; sans NINEA, il ne contient aucun libellé « NINEA ». Avec `default_tax_rate = 18`,
  une facture créée sans `tax_rate` sur 100 000 donne 18 000 de taxe ; avec `tax_rate = 0` explicite,
  elle donne 0. Une agence dont `metadata.legal_info` porte `ninea = 0012345 2G3` et `rib_pro` a,
  après migration, `agencies.ninea = '0012345 2G3'`, et la valeur de `rib_pro` n'apparaît dans
  aucune colonne d'`agencies` (sa suppression de `metadata` est chez 601 ; ablation : recopier `rib_pro` rougit le
  test). `PATCH /api/agencies/{id}` avec `ninea` sur une agence `individual` rend 422 ; une valeur
  de forme quelconque (`ABC`) est acceptée sur une agence `standard` (pas de contrôle de forme, D-68).
  **Preuve** : `InvoiceLegalMentionsTest` (4 tests). Ablations D8 à D11 : rouges.
- [x] **AC15 — facture d'intervention.** Une demande passée à `completed`, avec un prestataire assigné
  et un devis approuvé de 50 000, crée **une** facture `pending_validation` de 50 000. Avec un coût
  réel de 60 000, la facture vaut 60 000 et porte `exceeds_quote = true`. Repasser par `completed` ne
  crée pas de seconde facture, et sans prestataire assigné aucune n'est créée. Une fois validée,
  `pay` crée un `Payout` `service_provider` soumis à AC6. Le prestataire lit ses factures et reçoit
  404 sur celle d'un autre.
  **Preuve** : `ServiceProviderBillTest` (5 tests). Ablations G1 à G5 : rouges. Front : `ServiceProviderBillsTable.test.tsx` (W27b à W32).
- [x] **AC16 — destination.** Les valeurs brutes en base (`DB::table`) de `account_identifier` et
  d'`account_holder_name` diffèrent de celles saisies, et aucune entrée d'`activity_log` ne contient
  le numéro en clair.
  La ressource rend la forme masquée à l'agence et la forme claire au titulaire. Marquer payé un
  reversement Wave vers une destination non vérifiée rend 422. Modifier une destination la
  dé-vérifie et notifie le titulaire.
  **Preuve** : `PayoutMethodTest` (8 tests). Ablations E1 à E6, I4, I5 : rouges. Front : `PayoutMethodsSection.test.tsx`, vérification dans `CreatePayoutDialog.test.tsx` (W22 à W26).
- [x] **AC17 — avis.** `mark-processed` notifie le bénéficiaire avec le net et la référence ;
  `mark-failed` le notifie avec le motif. Les deux contenus passent par des clés `money_out.*`, et le
  test échoue si l'un des deux contient un littéral.
  **Preuve** : `PayoutBeneficiaryNotificationsTest` (2 tests). Ablations F2, I3 : rouges. ⚠ Après la fusion de TCK-588, le contenu ne passe plus par des clés `money_out.*` mais par les codes `payout.processed` / `payout.failed` (`NotificationCode`, `lang/*/notifications.php`) : la garde du littéral est `ProseLitteraleInterditeTest` et `scripts/check-notification-codes.mjs`.
- [x] **AC18 — hôte individuel.** Un admin d'agence `individual` atteint ses reversements plateforme
  sans redirection, et `check-pro-routes.mjs` passe.
  **Preuve** : `MePlatformPayoutAccessTest::test_ac18_the_admin_of_an_individual_agency_reads_its_platform_payouts` ; front `billing/__tests__/page.hote-individuel.test.tsx` (W1, W2) ; `node scripts/check-pro-routes.mjs` vert.
- [x] **AC19 — pièces de l'agence et du bailleur.** `POST /api/payouts` qui cite un `lease_payment_id`
  d'un bail d'une **autre agence** rend 422 (`money_out.payout.foreign_item`) ; un paiement d'un bail
  de la même agence mais d'un **autre bailleur** rend 422 ; un corps sans aucune pièce rend 422 ; un
  corps avec `lease_id` rend 422 sur ce champ. Dans les quatre cas, aucune ligne `payouts` ni pivot
  n'est écrite. Rouge aujourd'hui : le `lease_id` d'une autre agence est accepté (201).
  **Ablation** : retirer la vérification de périmètre de `PayoutService::create` rougit les deux
  premiers cas.
  **Preuve** : `PayoutItemScopeTest::test_ac19_*` (4 tests). Ablation J1 (périmètre retiré) : rouge sur les deux premiers cas (et la pièce impayée).
- [x] **AC20 — échéance d'un reversement programmé.** Un reversement `scheduled` dont `scheduled_at`
  est hier et un `pending` dont `scheduled_at` est hier : `payouts:remind-due` notifie l'émetteur de
  chacun (2 notifications). Relancée, la commande n'en envoie aucune de plus. Un reversement dont
  `scheduled_at` est demain, et un `completed` échu, ne produisent rien. `routes/console.php`
  planifie la commande (test sur `Schedule::events()`).
  **Preuve** : `RemindDuePayoutsCommandTest` (2 tests). Ablation A1 : rouge.
- [x] **AC21 — clôture globale.** Trois agences A, B, C ont des paiements éligibles au 2026-09-30 ; B
  est déjà clôturée pour cette date (puis un paiement tardif de B, `paid_at` au 2026-09-20, est
  enregistré). `close-period` sans `agency_id` rend 201, crée les reversements de A **et** de C, et
  liste B dans les exclues avec `already_closed`. Rouge aujourd'hui : la réponse est 409 quel que soit
  l'ordre de traitement, et l'agence traitée après B n'a pas de reversement.
  **Preuve** : `PlatformPayoutFreezeTest::test_ac21_the_global_close_skips_an_already_closed_agency_and_goes_on`. Ablations B5, I1 : rouges.
- [x] **AC22 — cible de facture.** `POST /api/invoices` avec `invoiceable_type = lease` et l'id d'un
  bail d'une autre agence rend 422 (`money_out.invoice.foreign_target`) et n'écrit rien ; avec un
  bail de l'agence, 201. Rouge aujourd'hui (201 dans les deux cas).
  **Preuve** : `InvoiceTargetScopeTest::test_ac22_a_lease_of_another_agency_is_refused_and_nothing_is_written`. Ablation D7 : rouge.
- [x] **AC23 — la caution n'est pas un reversement au bailleur.** Après un remboursement de caution
  sur le bail du bailleur L, `GET /api/payouts?filter[landlord_id]=L&filter[payee_role]=landlord&filter[status]=pending`
  ne rend pas ce `Payout` ; sans le filtre `payee_role`, il le rend avec `payee_role = "tenant"`. La
  migration de données passe les `Payout` de caution existants à `tenant` : sur une base où
  deux `Payout` de caution ont été insérés comme les écrit le code actuel (sans `payee_role`, joints
  à leur `LeasePayment` `deposit_refund`) et un reversement ordinaire, le compte `payee_role = tenant`
  vaut **2** et `landlord` **1** après la migration.
  **Preuve** : `PayoutPayeeRoleTest::test_ac4_ac23_…`, `test_ac23_the_data_migration_moves_existing_deposit_refunds_to_tenant`. Ablation J4 : rouge.

### AC ajoutés après vérification adverse (VERIF-594)

- [x] **AC-B1 — rien n'est vérifié d'office (B-1).** Le bailleur change son téléphone (`send-otp` vers
  un nouveau numéro, `verify-otp`), puis déclare ce numéro comme destination : `verified = false`. Le
  marquage payé vers elle rend 422 `payout.unverified_destination` tant qu'aucun membre de l'agence
  ne l'a vérifiée, puis 200.
  **Preuve** : `PayoutBypassTest::test_b1_a_destination_equal_to_a_freshly_verified_phone_is_not_verified` (rouge sur 9923b16c) ; `PayoutMethodTest::test_adding_a_destination_notifies_and_nothing_verifies_itself`. Ablation V-B1 : rouge.
- [x] **AC-M1 — pas de fractionnement sous le seuil.** Seuil 100 000 : un reversement de 60 000 naît
  `pending` et se paie ; la préparation d'un second de 60 000 vers le même bailleur rend
  `requires_approval = true`, et il naît `awaiting_approval`. Un autre bailleur n'hérite pas du cumul
  (60 000 → `pending`). Une fois le second approuvé, 30 000 de plus naissent `pending` ; un
  reversement non approuvé vieux de 31 jours ne compte plus.
  **Preuve** : `PayoutBypassTest::test_m1_splitting_under_the_threshold_still_requires_an_approval` (rouge sur 9923b16c). Ablations V-M1 (cumul), V-M1b (approuvés comptés), V-M1c (sans fenêtre) : rouges.
- [x] **AC-M2 — on ne relâche pas le seuil seul.** Deux approbateurs A et B. A règle 100 000 (200),
  puis le coupe : **202**, le seuil reste 100 000, `pending_payout_threshold_change.threshold = null`,
  B est avisé (`payout_threshold.relax_requested`), A ne l'est pas. Un reversement de 5 000 000
  naît `awaiting_approval` ; A ne confirme pas sa propre demande (403 `segregation.approve`). Un
  resserrement à 50 000 s'applique aussitôt et retire la demande ; un relèvement à 400 000 rend 202,
  et ne s'applique qu'à la confirmation de B (200) ; une seconde confirmation rend 422
  `payout.no_pending_threshold_change`. Une agence à un seul détenteur qui coupe son seuil reçoit
  403 `payout.threshold_needs_second_approver`.
  **Preuve** : `PayoutBypassTest::test_m2_relaxing_the_threshold_waits_for_a_second_approver`, `test_m2_a_single_approver_cannot_relax_the_threshold` (rouges sur 9923b16c) ; `PayoutApprovalThresholdTest::test_ac8_two_approvers_enable_it_and_each_change_is_traced` (trace du confirmateur et du demandeur) ; front `AgencyConfigForm.test.tsx` (trois tests VERIF-594 M-2). Ablations V-M2a à V-M2d, W-M2a à W-M2c : rouges.
- [x] **AC-M3 — la caution passe par les quatre yeux.** Seuil 0 : `POST /api/leases/{id}/deposit-refund`
  de 1 500 000 crée un `Payout` `awaiting_approval`, avise le second détenteur de `payouts.approve`,
  et `mark-processed` y rend 422 `payout.awaiting_approval` ; approuvé par une autre personne, il se
  paie.
  **Preuve** : `PayoutBypassTest::test_m3_a_deposit_refund_goes_through_the_four_eyes` (rouge sur 9923b16c). Ablations V-M3 (statut), V-M3b (avis) : rouges.
- [x] **AC-M6 — une vérification ne vaut que pour son agence.** Un bailleur des agences A et B ; un
  agent de A vérifie sa destination. L'agence B la lit `verified = false` (liste des destinations et
  préparation), et son marquage payé vers elle rend 422 `payout.unverified_destination` ; vérifiée
  par un membre de B, le paiement passe. Une destination modifiée perd la vérification de chaque
  agence.
  **Preuve** : `PayoutBypassTest::test_m6_a_destination_verified_by_one_agency_does_not_pay_from_another` (rouge sur 9923b16c) ; `PayoutMethodTest::test_ac16_modifying_a_destination_unverifies_it_and_notifies_the_holder` (deux agences). Ablations V-M6, V-M6b : rouges.
- [x] **AC-M4 — l'approbation couvre la destination.** Seuil 100 000, destination M1 (•••• 1111) :
  l'approbateur lit `payout_method_masked = •••• 1111` avant d'approuver, et l'approbation rend
  `approved_destination_masked`. Le titulaire change le numéro de M1, un tiers la revérifie :
  `mark-processed` rend 422 `payout.destination_changed_since_approval` et le reversement reste
  `pending`. Une autre destination M2, vérifiée, rend la même 422 ; M1 inchangée passe. Approuvé
  sans destination, un paiement Wave vers M1 rend 422 et un chèque passe. Sans seuil, le membre qui
  vient de vérifier la destination rend 403 `payout.verifier_cannot_pay_yet` une heure après, et
  paie 25 h après. Écran : la destination prévue, puis approuvée, est affichée ; approuvé, le choix
  de destination n'offre que l'approuvée, et approuvé sans destination il le dit.
  **Preuve** : `PayoutBypassTest::test_m4_the_destination_changed_after_approval_is_refused`, `…_another_destination_than_the_approved_one_is_refused`, `…_a_payout_approved_without_destination_is_not_paid_to_one`, `…_the_verifier_does_not_pay_the_destination_within_24_hours` (rouges sur 9923b16c) ; front `PayoutDetailDialog.capacites.test.tsx` (trois tests VERIF-594 M-4). Ablations V-M4a, V-M4d, V-M4e, W-M4a, W-M4b : rouges ; V-M4b, V-M4c : vertes (voir les notes : V-M4c est strictement redondante, V-M4b ne l'est pas tout à fait).
- [x] **AC-m1 — une agence individuelle ne paie pas un tiers.** L'hôte d'une agence `individual`
  prépare un reversement à un autre bailleur de son agence : 422 `payout.individual_third_party`,
  aucun `Payout` écrit. Un super-admin qui reverse à l'hôte lui-même : 201.
  **Preuve** : `PayoutBypassTest::test_m1_an_individual_agency_does_not_pay_a_third_party` (rouge sur 9923b16c : 201). Ablation V-m1 : rouge.
- [x] **AC-m2 — le bailleur ne lit pas le seuil.** `GET /api/agencies/{id}` par un bailleur de
  l'agence, puis par l'administrateur d'une autre agence : ni `payout_approval_threshold` ni
  `pending_payout_threshold_change` dans la réponse. Par l'administrateur de l'agence : 250 000.
  **Preuve** : `PayoutBypassTest::test_m2_the_threshold_is_not_shown_to_a_landlord` (rouge sur 9923b16c). Ablation V-m2 : rouge.
- [x] **AC-m3 — 60 000,6 XOF font 60 001 des deux côtés.** Un coût réel de 60 000,6 : facture à
  60 001, paiement au prestataire net 60 001, reversement au bailleur frais 60 001 (net 139 999 sur
  200 000). Une facture qui garde 70 000,6 en base est payée 70 001.
  **Preuve** : `ServiceProviderBillTest::test_m3_an_xof_bill_is_rounded_to_the_unit_on_both_sides` (rouge sur 9923b16c). Ablations V-m3a (observateur) et V-m3b (`createForBill`) : rouges.
- [x] **AC-m4 — le verrou de numérotation tient dans une transaction.** L'allocateur appelé seul :
  au `SELECT … FOR UPDATE` de la ligne agence, `DB::transactionLevel()` dépasse celui d'avant
  l'appel. Une facture soldée par `PaymentGatewayService::verify` (pilote simulé) : `paid`,
  `FA-2026-00001`, et l'`UPDATE` de son statut s'écrit dans une transaction.
  **Preuve** : `InvoiceNumberingTest::test_m4_the_agency_lock_is_held_inside_a_transaction`, `test_m4_a_gateway_verification_writes_status_and_number_in_one_transaction` (le second rouge sur 9923b16c ; le premier y est vert — le comportement tenait, c'est l'AC qui ne le gardait pas). Ablations V-m4a (le `DB::transaction` de l'allocateur retiré : `test_the_counter_is_read_under_the_lock_of_the_agency_row` reste vert, le nouveau rougit) et V-m4b (la transaction de `verify`) : rouges.
- [x] **AC-m5 — une facture ne s'émet qu'une fois.** Un `send` sur un modèle chargé avant
  l'émission : 422 `invoice.not_draft_send`, aucun `UPDATE` de la facture, aucune trace d'audit de
  plus, numéro inchangé. Une annulation sur un modèle périmé : 422 `invoice.cannot_cancel`, un seul
  avoir ; un règlement manuel sur la facture annulée entre-temps : 422 `invoice.cannot_mark_paid`.
  **Preuve** : `InvoiceNumberingTest::test_m5_a_second_send_on_a_stale_model_is_refused_and_writes_nothing`, `test_m5_cancel_and_mark_paid_judge_the_locked_row` (rouges sur 9923b16c). Ablations V-m5a (`send`), V-m5b (`cancel`), V-m5c (`markPaid`) : rouges.
- [x] **AC-M5 — un paiement ne se défait pas.** `markFailed` puis `cancel`, appelés avec un modèle
  chargé AVANT un `mark-processed` réussi, rendent 422 (`payout.cannot_fail`, `payout.cannot_cancel`) ;
  le reversement reste `completed` et garde ses pièces. Une écriture directe `completed → failed` ou
  `→ cancelled` lève `payout.status_transition_invalid`.
  **Preuve** : `PayoutBypassTest::test_m5_a_stale_mark_failed_or_cancel_does_not_undo_a_payment`, `test_m5_the_model_refuses_to_leave_completed` (rouges sur 9923b16c). Ablations V-M5a, V-M5b : rouges.

### AC ajoutés après la passe 2 (VERIF-594 passe 2)

- [x] **AC-N1 — un reversement approuvé se paie en mobile money.** Seuil 100 000, facture de
  150 000 payée comme l'écran (`pay` sans destination), prestataire dont la destination par défaut est
  vérifiée pour l'agence par un tiers depuis trois jours : 201 `awaiting_approval` vers cette
  destination ; approuvée par un second, payée en Wave vers elle : 200 `completed`. Un bailleur dont
  la destination par défaut n'est pas vérifiée pour l'agence : préparé sans destination, l'approbateur
  fixe une destination vérifiée en approuvant (masquée rendue), payée en Wave : 200. Une destination
  vérifiée par une autre agence, ou d'un autre utilisateur, citée à l'approbation : 422
  `payout.unverified_destination`, toujours `awaiting_approval`. Un approbateur sans `payouts.create`
  lit les destinations masquées (200) et ne les vérifie pas (403).
  **Preuve** : `ServiceProviderBillTest::test_n1_a_bill_paid_like_the_screen_goes_to_the_default_verified_destination`, `PayoutBypassTest::test_n1_*` (quatre ; rouges sur 38495c16) ; front `CreatePayoutDialog.test.tsx` (deux) et `PayoutDetailDialog.capacites.test.tsx` (trois). Ablations V-N1a à V-N1g, W-N1a à W-N1d : rouges.
- [x] **AC-N2 — une caution refusée ou échouée se rend de nouveau.** Seuil 0, caution 400 000 :
  restitution (201), refus par `cancel` → `deposit_refunded_amount` 0, `deposit_refunded_at` nul,
  ligne `deposit_refund` `failed`, une activité `deposit_refund_reversed` ; nouvelle restitution 201,
  400 000 rendus. Sans seuil : 100 000 rendus avec motif, puis 300 000 échoués (`mark-failed`) et
  annulés ensuite → 100 000 rendus (une seule fois), le premier reversement intact ; nouvelle
  restitution de 300 000 : 201, 400 000 rendus.
  **Preuve** : `PayoutBypassTest::test_n2_a_refused_deposit_refund_can_be_refunded_again`, `test_n2_a_failed_deposit_refund_is_released_once` (rouges sur 38495c16). Ablations V-N2a à V-N2e : rouges.
- [x] **AC-N3 — une cadence mensuelle ne se cumule pas.** Seuil 100 000, 60 000 au même bailleur le
  31/01 puis le 28/02 : deux `pending` ; un troisième le 10/03, à 10 jours du deuxième :
  `awaiting_approval`. La préparation rend `approval_window_days = 27`, et le bandeau dit
  « depuis 27 jours ».
  **Preuve** : `PayoutBypassTest::test_n3_a_monthly_cadence_does_not_add_up_but_a_split_within_the_month_does` (rouge sur 38495c16) ; front `CreatePayoutDialog.test.tsx`. Ablations V-N3 (30 jours), V-N3b (9 jours), W-N3 (30 en dur dans l'écran) : rouges.
- [x] **AC-N4 — une demande de relâchement expire.** A coupe le seuil (202). Huit jours plus tard, B
  ne lit plus de demande en attente, et sa confirmation rend 422 `payout.threshold_request_expired` ;
  le seuil reste 100 000, la demande est effacée (une seconde confirmation : 422
  `payout.no_pending_threshold_change`). Une nouvelle demande, confirmée six jours après : 200, et
  `expires_at` = demande + 7 jours.
  **Preuve** : `PayoutBypassTest::test_n4_a_relax_request_expires_after_seven_days` (rouge sur 38495c16). Ablations V-N4a (jamais expirée), V-N4b (refus levé dans la transaction, qui annule l'effacement), V-N4c (expirée encore montrée) : rouges.
- [x] **AC-N5 — on confirme ce qu'on a lu.** A demande 150 000 (202) ; B lit 150 000 ; A remplace sa
  demande par une coupure (202) ; B confirme 150 000 : 409 `payout.threshold_request_changed`, le
  seuil reste 100 000 et la demande reste à confirmer. Sans `expected_threshold` : 422. B confirme
  `null` : 200, seuil coupé. L'écran envoie la valeur affichée (`null` pour une coupure, 150 000 pour
  une hausse).
  **Preuve** : `PayoutBypassTest::test_n5_a_confirmation_confirms_the_value_it_read` (rouge sur 38495c16) ; front `AgencyConfigForm.test.tsx` (deux). Ablations V-N5a (pas de comparaison), V-N5b (champ facultatif), W-N5 (l'écran envoie `null`) : rouges.

### AC ajoutés après la passe 3 (VERIF-594 passe 3)

- [x] **AC-P3-1 — refuser une restitution annule sa facture de retenue.** Caution 400 000, restitution
  de 300 000 avec motif (une facture de retenue de 100 000 en brouillon), refusée (`cancel`) : la
  facture passe `cancelled`, sans avoir ; nouvelle restitution de 300 000 : **une seule** facture de
  retenue vivante, de 100 000. Variante émise : la facture envoyée (`send`), la restitution échoue
  (`mark-failed`) : la facture passe `cancelled` et **un avoir** de 100 000 la crédite ; après une
  nouvelle restitution, une seule facture de retenue vivante.
  **Preuve** : `PayoutBypassTest::test_p3_1_a_refused_partial_refund_cancels_its_draft_retention_invoice`, `test_p3_1_a_refused_partial_refund_credits_its_issued_retention_invoice` (rouges sur 3dd943df). Ablations P3-1a (rien n'est annulé), P3-1b (le lien `invoice_id` n'est pas posé), P3-1c (seul le brouillon s'annule) : rouges.
- [x] **AC-P3-2 — la ligne se retrouve par son lien.** Deux restitutions de 100 000 en attente ; on
  annule la première : c'est SA ligne qui passe `failed`, celle de la seconde reste `pending` ; la
  seconde payée en espèces : sa ligne passe `paid`, avec `paid_at` ; la clôture plateforme de l'agence
  ne la prend pas (`created` vide, `platform_payout_id` nul).
  **Preuve** : `PayoutBypassTest::test_p3_2_the_deposit_refund_line_is_found_by_its_link` (rouge sur 3dd943df). Ablations P3-2a (la ligne la plus récente), P3-2b (le paiement ne solde pas la ligne), P3-2c (la clôture compte la ligne) : rouges.
- [x] **AC-P3-3 — l'approbateur ne fixe pas ce qu'il vient de vérifier.** Seuil 100 000, reversement
  `awaiting_approval` ; l'approbateur vérifie une destination neuve du bailleur puis la cite en
  approuvant : 403 `payout.approver_verified_destination_recently`, toujours `awaiting_approval` ; il
  cite une destination vérifiée par un tiers il y a une heure : 200, destination fixée.
  **Preuve** : `PayoutBypassTest::test_p3_3_the_approver_does_not_set_a_destination_they_just_verified` (rouge sur 3dd943df). Ablations P3-3a (pas de contrôle), P3-3b (contrôle sans l'identité du vérificateur) : rouges.
- [x] **AC-589 — le step-up sur les sorties d'argent.** Une session à deux facteurs dont le step-up a
  expiré : `approve`, `mark-processed`, `service-provider-bills/{id}/pay` et
  `me/payout-methods` (`store`, `update`, `destroy`) rendent 403 `two_factor_step_up_required`, et
  rien ne change ; avec un TOTP frais : 200 / 201. Un titulaire sans 2FA : `two_factor_required`.
  `ProtectedActionsCoverageTest` garde les huit entrées (gestes plateforme compris).
  **Preuve** : `PayoutStepUpTest` (trois), `ProtectedActionsCoverageTest::test_les_sorties_d_argent_exigent_le_step_up`. Ablations STEPUP-d1 à d4 (une entrée retirée de `STEP_UP`) : rouges. *Rouge sur 3dd943df* : non exécutable, `ProtectedActions` n'y existe pas (589 non fusionné).

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

### Partie 1 — calcul, pièces uniques, caution au locataire, quatre yeux d'agence, échéance (lot A)

- **Calcul** : `App\Services\Payout\PayoutCalculator`. Lignes éligibles : `LeasePayment` `paid` de
  type `rent`, `charges`, `penalty`, `regularization` ; `BookingPayment` `paid` de type `deposit`,
  `advance` (le `fee` est un revenu de l'agence, il n'est jamais reversé). Commission **par ligne** au
  taux du bail, à défaut à celui de l'agence, arrondie à `Currency::decimalPlaces()` (0 pour XOF).
  Des devises mêlées rendent 422. Lecture : `GET /api/payouts/preparation` (avant `{payout}` dans
  `routes/api/payouts.php`).
- **Création** : `POST /api/payouts` ne prend que des identifiants (`lease_payment_ids`,
  `booking_payment_ids`, `service_provider_bill_ids`) ; `lease_id`, `booking_id`, `gross_amount`,
  `commission_amount`, `fees_amount` sont `prohibited`. Chaque pièce est relue **sous verrou** (baux,
  réservations, factures, par id croissant) et rejugée : périmètre agence + bailleur, éligibilité, pas
  déjà dans un pivot. `lease_id` / `booking_id` ne sont posés que si une seule origine existe ; sinon
  l'origine se lit dans les pivots. Le CHECK `lease_id IS NOT NULL OR booking_id IS NOT NULL` que
  `models-spec.md` § 28 décrit **n'existe dans aucune migration** (mesuré : `grep` des migrations,
  2026-10-07) — à corriger par `/sync-specs`.
- **Une seule fois** : index uniques `payout_lp_lease_payment_unique` et
  `payout_bp_booking_payment_unique` (migration `200400`, qui purge d'abord les pivots des reversements
  `cancelled`/`failed` puis les doublons). La violation est attrapée **hors** de `DB::transaction` et
  devient 409 (piège PostgreSQL n° 1). `cancel` et `mark-failed` détachent les pièces.
- **Caution** : `payee_role` (`landlord` par défaut, `tenant`, `service_provider`). `DepositRefundService`
  écrit `tenant` ; la migration `200300` reprend les existants (même bail, même montant, même seconde
  que leur `LeasePayment` `deposit_refund`). `beneficiaryUserId()` lit l'utilisateur du locataire.
- **Quatre yeux** : `App\Support\SegregationOfDuties::assertDistinct()` — comparaison d'**utilisateurs**
  (deux profils ou deux agences ne font pas deux personnes ; le super-admin y est soumis, `Gate::before`
  ne le dispense pas). Préparer : ≠ bénéficiaire. Approuver : ≠ émetteur, ≠ bénéficiaire. Payer :
  ≠ approbateur, ≠ bénéficiaire. Sans seuil (`null`, défaut, aucune reprise), un reversement naît
  `pending` et son émetteur le paie seul (AC6a). L'approbation fige `metadata.approved_net_amount` ;
  un net modifié ensuite rend 422 au paiement. `approve` ne se rejoue pas (422 hors
  `awaiting_approval`).
- **Seuil** : `PATCH /api/agencies/{id}` avec `payout_approval_threshold` → `AgencyPolicy::updatePayoutThreshold`
  (administre l'agence ET détient `payouts.approve`) puis `PayoutApprovalThreshold::change` : 422
  `money_out.threshold.needs_two_approvers` sous deux détenteurs actifs (`PayoutApprovers`), trace
  `agency_payout_threshold_changed` `{old, new}`. La colonne est **retirée de `$fillable`** : elle ne
  s'écrit que par ce service.
- **Échéance** : `payouts:remind-due` (07:30, Africa/Dakar), idempotente par
  `metadata.due_reminded_at` posé **avant** l'envoi.
- **Paiement** : référence obligatoire hors espèces (requête ET service), destination vérifiée du
  bénéficiaire pour mobile money / virement (`unverified_destination`), sauf la caution rendue au
  locataire (il peut n'avoir aucun compte). Pilote `ManualDisbursementDriver` derrière
  `DisbursementDriverContract`.
- **Super-admin** : son `agency_id` du corps l'emporte désormais sur le profil qu'il tiendrait par
  ailleurs (avant : seulement s'il n'avait aucun profil).
- **`AgencyKindFlipService`** écrit désormais `rccm`, `ninea`, `legal_name`, `legal_address` en
  colonnes (une valeur curée de `metadata.legal_info` gagne sur la demande) ; `rib_pro` reste dans
  `metadata` (sa suppression est chez TCK-601).
- **`payouts.approve`** quitte `CapabilityEnforcementInventory::AWAITING` ; `CLIQUET` 16 → 15.
- Notifications : ~~`App\Notifications\Payouts\*`, textes sous `money_out.notifications.*`~~ —
  **remplacées après la fusion de TCK-588** par des codes (voir « Partie 7 »).
- **Non tenu (noté)** : « une agence `individual` n'émet pas de `Payout` à un tiers » n'est pas
  appliqué par le code.

### Partie 2 — chaîne plateforme (§ 3b) et lecture des reversements plateforme (§ 7)

- **Trois mains** : `closeForAgency` écrit `closed_by_id` ; `approve` refuse le clôtureur, `markPaid`
  l'approbateur (`SegregationOfDuties`). Les deux refusent aussi un **membre de l'agence payée**
  (`primary_admin_id`, ou personnel par `MembershipCapabilityResolver::isStaffAt`) : un super-admin
  qui est aussi admin de l'agence ne s'approuve pas son propre reversement. Les deux gestes relisent le
  reversement **sous verrou** (une approbation ne se rejoue pas : 422 par la matrice de transitions).
- **Référence** : `payment_reference` requise par `MarkPlatformPayoutPaidRequest` et par le service
  (une chaîne d'espaces rend 422). Stockée en colonne, renvoyée par la ressource avec `closed_by_id`,
  `approved_at`, `paid_by_id`.
- **Gel** : `approve` et `markPaid` relisent `agencies.status` (422 `money_out.platform.agency_frozen`).
  `approve` refuse une agence `standard` non vérifiée (422 `agency_unverified`) ; une `individual`
  non vérifiée passe (option retenue par défaut : l'état est seulement affiché).
- **Clôture globale** : sans `agency_id`, la réponse porte `excluded: [{agency_id, reason}]` avec
  `agency_not_active` ou `already_closed`, et la boucle continue. La course perdue sur l'index unique
  partiel n'est plus attrapée dans la transaction (l'ancien `catch (QueryException)` y vivait) : elle
  remonte, et `closePeriod` la range dans les exclues **après** le rollback. Avec `agency_id`, 409 (déjà
  clôturée) et 422 (agence non active).
- **Messages** : les 409/422 de la chaîne plateforme passent par `money_out.platform.*` (la matrice de
  transitions écrivait une phrase anglaise).
- **§ 7** : `GET /api/me/payouts` exige `agency.update_billing` à l'agence du profil actif
  (`AgencyPolicy::viewPlatformPayouts`). `agency.update_billing` quitte l'inventaire ; `CLIQUET` 15 → 14.

### Partie 3 — facture conforme (§ 5)

- **Numérotation** : `App\Services\Invoice\InvoiceNumberAllocator` — verrou de la ligne agence, puis
  `MAX(sequence_number)` hors verrou (`withTrashed` : une facture supprimée garde son numéro). Année
  = celle de l'**émission** (`now()`), pas `issue_date`. Sites : `send`, `markPaid` (brouillon),
  `cancel` (l'avoir), `EarlyTerminationService` (pénalité émise directement) et
  `PaymentGatewayService::applyStatusToPayment` (un brouillon soldé par la passerelle).
  `DepositRefundService` crée un **brouillon** : il n'est numéroté qu'à son émission. Une facture
  sans agence garde son `INV-…` (aucune séquence hors agence). Idempotent : jamais de renumérotation.
  `sequence_year` / `sequence_number` sont hors `$fillable`.
- **Avoir** : `InvoiceService::cancel` sur `sent`/`overdue` crée dans la même transaction un avoir
  `kind = credit_note`, même montant, `credited_invoice_id`, émetteur = l'acteur de l'annulation.
  **Statut de l'avoir : `void`** (décision d'implémentation, l'ADR ne le fixe pas) : `sent` l'aurait
  mis dans les relances (`OverdueReminderService::REMINDABLE_STATUSES`) et dans les encours qui
  bloquent la suppression de compte (`AccountDeletionService`) ; `paid` l'aurait compté comme encaissé.
  Un avoir ne s'annule pas (422 par la matrice existante). `GET /api/invoices/{id}` charge
  `creditNotes` ; la ressource expose `kind`, `credited_invoice_id`, `credit_notes`.
- **TVA par défaut** : `tax_rate` absent ⇒ `agencies.default_tax_rate`, à défaut 0 ; `0` explicite gagne.
- **Cible** : `resolveInvoiceableTarget` reçoit l'agence de la facture et rend 422
  `money_out.invoice.foreign_target` pour un bail ou une réservation d'une autre agence (ou sans
  agence). `InvoiceTest::test_can_issue_invoice_for_booking` citait une réservation d'une agence
  quelconque : corrigé pour viser l'agence de l'émetteur.
- **Mentions légales** : `AgencyUpdateRequest` accepte `legal_name`, `ninea`, `rccm` (`max:30`, sans
  contrôle de forme, D-68), `legal_address`, `default_tax_rate` sur une `standard`, `prohibited` sur une
  `individual`. `AgencyResource` les expose avec le seuil. Le PDF imprime au pied les mentions présentes,
  aucun libellé vide, et « Avoir » + la facture annulée pour un avoir. La reprise depuis
  `metadata.legal_info` est la méthode `backfill()` de la migration `200500` (rejouée par le test).
  ⚠ `AgencyResource` expose encore `metadata` tel quel, `legal_info.rib_pro` compris : c'est TCK-601.

### Partie 4 — destinations de paiement et avis (§ 4)

- **Routes** : `GET|POST /api/me/payout-methods`, `PATCH|DELETE /api/me/payout-methods/{payoutMethod}`
  (le titulaire), `GET /api/payout-methods?filter[user_id]=` et `POST /api/payout-methods/{payoutMethod}/verify`
  (l'agence). Le contrat ne listait pas `PATCH` : il est ajouté, car « modifier une destination la
  dé-vérifie et notifie le titulaire » exige un geste de modification.
- **`PayoutMethodPolicy`** : le titulaire seul modifie et supprime ; l'agence lit (masquées) et vérifie
  quand le lecteur est du personnel, détient `payouts.create` à son agence, et que le titulaire y est
  bailleur (`OwnerProfile`) ou prestataire en collaboration. `PayoutMethodService::verify` refuse en
  plus le titulaire lui-même par `SegregationOfDuties` (le super-admin, que `Gate::before` laisse
  passer la policy, y compris).
- ~~**Vérification d'office**~~ : **retirée** après la vérification adverse (B-1, voir « Corrections
  après vérification adverse »). Toute destination attend un membre de l'agence.
- **Chiffrement (raccord TCK-601)** : `account_identifier` et `account_holder_name` en `text`, cast
  `encrypted`, `$hidden`, hors `$queryFields`, modèle **non** `Auditable`. Le masquage passe par
  `PayoutMethod::mask()` seul (quatre derniers caractères) : **c'est la méthode que 601 remplace.**
  La liste blanche d'audit d'`Agency` n'existe pas encore : 594 n'y inscrit rien (à faire par 601 ou
  par la seconde fusion).
- **Avis** : ajout, modification et suppression d'une destination (critique : e-mail quelles que
  soient les préférences ; seule la forme masquée), reversement payé (net, référence, destination
  masquée), reversement échoué (motif). Depuis la fusion de TCK-588, ce sont des **codes** et non plus
  des classes (voir « Partie 7 »).

### Partie 5 — facture d'intervention (§ 6)

- **`MaintenanceRequestObserver`** (`ShouldHandleEventsAfterCommit`, enregistré dans
  `AppServiceProvider`) : au passage à `completed` (et à une création directement `completed`), avec
  `assigned_to` et un montant > 0 — `actual_cost` s'il est fourni, sinon le devis **approuvé**
  (`quote_decision_at` posé ET `quote_rejection_reason` nul) —, une facture `pending_validation` par
  `insertOrIgnore` contre `sp_bills_one_open_per_request`. `exceeds_quote` = coût réel > devis approuvé.
  `rechargeable_to_landlord` vaut `true` à la création ; la validation peut le changer.
- **Routes** : `GET /api/service-provider-bills`, `GET …/{bill}`, `POST …/{serviceProviderBill}/validate|reject|pay`.
  Lecture : le prestataire voit les siennes, le personnel celles de son agence ; une facture hors de
  ce périmètre rend **404** (résolue dans le périmètre avant toute policy). Gestes :
  `ServiceProviderBillPolicy::manage` (personnel de l'agence + `payouts.create`), et
  `SegregationOfDuties` interdit au prestataire de valider ou rejeter sa propre facture. Valider et
  rejeter ne se font que depuis `pending_validation`, sous verrou.
- `pay` → `PayoutService::createForBill` : `Payout` `payee_role = service_provider`, même seuil, mêmes
  quatre yeux, même destination vérifiée ; un second `pay` sur une facture déjà dans un reversement
  vivant rend 409. `markProcessed` passe la facture à `paid`.

### Partie 6 — relevé de gérance (§ 2)

- `GET /api/owner-statements?period=YYYY-MM|YYYY[&landlord_id=][&agency_id=]`, `…/pdf`, `…/csv`.
  `OwnerStatementService` relit les règles du calculateur : encaissements éligibles de la période
  (`paid_at`), commission par ligne ; les **frais** sont les factures d'intervention imputées aux
  reversements **au bailleur** (non annulés ni échoués) qui portent ces encaissements ; il rend les
  reversements avec leurs références, le total `completed` (`paid_out`), une ventilation par bien et
  les impayés de la période (loyers `pending`/`late`/`partially_paid` échus dans la période).
  `period=YYYY` rend l'attestation annuelle (`annual: true`).
- `OwnerStatementPolicy::view` (liée par `Gate::define('viewOwnerStatement')`, le relevé n'étant pas un
  modèle) : le bailleur, dans une agence où il est bailleur ; le personnel de cette agence qui détient
  `payouts.create`. Un autre bailleur de la même agence : 403.
- PDF `pdf/statements/owner.blade.php` (libellés `money_out.statement.*`, NINEA/RCCM de l'agence s'ils
  existent). CSV séparé par `;`.
- `payouts:send-owner-statements` (le 1er, 08:00, Africa/Dakar) avise chaque bailleur qui a eu des
  encaissements le mois précédent (`OwnerStatementAvailableNotification`). Idempotence par
  `Cache::add` (40 jours) : un cache vidé entre deux exécutions du même mois renverrait l'avis.
- `PayoutPreparationService` aligné sur `PayoutService::create` : le `agency_id` du super-admin l'emporte.

### Partie 7 — fusion de TCK-588 : refus et avis en codes

- **Refus** : chaque `abort(4xx, __('money_out.…'))` est devenu `abort_code(4xx, '<domaine>.<code>')`,
  clés ajoutées (ajout seul) à `lang/{fr,en,wo}/errors.php` :
  `payout.{agency_required, already_paid_out, amount_changed_since_approval, awaiting_approval,
  mixed_currencies, not_awaiting_approval, payment_method_required, reference_required,
  unverified_destination, threshold_needs_two_approvers}`, `platform_payout.{agency_frozen,
  agency_unverified}`, `invoice.foreign_target`, `segregation.{prepare, approve, pay}`,
  `service_provider_bill.{already_in_payout, not_payable, not_pending}`. Repris de 588 :
  `payout.landlord_not_in_agency`, `payout.net_negative`, `payout.failure_reason_required`,
  `payout.cannot_*`, `platform_payout.already_exists`, `platform_payout.status_transition_invalid`.
  Les codes cités par le texte du ticket sous `money_out.*` (AC17, AC19, AC22, § 3) se lisent donc
  sous ces noms ; `money_out.php` ne garde que les messages de **validation** (`payout.no_items`,
  `foreign_item`, `ineligible_item`, `foreign_destination`), le relevé (`statement.*`) et le PDF (`legal.*`).
- **`SegregationOfDuties::refuse($step)`** rend le code du geste (`segregation.prepare|approve|pay`).
- **Défaut attrapé à la fusion** : `PlatformPayoutService::closePeriod` attrapait `HttpException`
  sans l'importer après la résolution du conflit — la clôture globale ne rangeait plus rien dans les
  exclues (409). Corrigé en attrapant `ApiError` et en ne gardant que `platform_payout.already_exists`
  (ablation I1).
- **Avis** : `NotificationCode` gagne `payout.awaiting_approval`, `payout.due`, `payout.processed`,
  `payout.failed`, `payout_method.added|updated|removed`, `owner_statement.available` — type
  Payment, **aucun interrupteur de préférence** (une sortie d'argent ne se coupe pas). Envoi par
  `NotificationService::send()`, montants par `NotificationRenderer::money()`. Textes dans
  `lang/*/notifications.php` (API) et `notifications.codes.*` des trois dictionnaires du front. Le
  dossier `app/Notifications/Payouts/` est supprimé.

### Partie 8 — front

- **Préparer** (`CreatePayoutDialog`) : bailleur (liste `/api/owners`), période, puis lecture du
  calcul (pièces, totaux, bandeau de seuil) ; la création n'envoie que les identifiants. Une
  destination en attente se **vérifie** depuis ce dialogue (`/api/payout-methods/{id}/verify`).
- **Quatre yeux** (`PayoutDetailDialog`) : « Approuver » visible pour `payouts.approve` et refusé
  **visiblement** au préparateur ; paiement refusé visiblement à l'approbateur ; référence exigée
  hors espèces ; en mobile money ou par virement, le paiement part vers une destination **vérifiée**
  du bénéficiaire choisie au marquage (sans ce choix, le reversement d'une facture d'intervention,
  préparé sans destination, ne se payait pas depuis l'écran — relevé en relisant le rendu). File « À
  approuver » dans les finances de l'agence (`PaymentsTabs`,
  `AdminFinancesTabs`). Le pré-remplissage de commission de TCK-370 est retiré (le calcul est
  serveur), avec ses deux tests.
- **Avoir** (`InvoiceDetailDialog`) : titre « Avoir », facture annulée nommée, avoirs listés sur
  l'originale, refus du serveur affiché.
- **Réglages d'agence** (`AgencyConfigForm`) : TVA par défaut ; seuil proposé au seul détenteur de
  `payouts.approve` et **envoyé seulement s'il change** (renvoyé inchangé, il ferait refuser
  l'enregistrement du nom à un admin sans la capacité) ; mentions légales jamais pour une
  `individual`. Les six colonnes rejoignent `Agency::$queryFields`.
- **Plateforme** (`PayoutDetailPanel`, `PayoutCloseDialog`) : trois mains rendues visibles,
  référence du virement exigée, exclusions de la clôture nommées avec leur motif.
- **Relevé** (`OwnerStatementPanel`, onglet des versements du bailleur) : mois ou année, PDF et CSV
  téléchargés avec le jeton de session.
- **Destinations** (`PayoutMethodsSection`, profil du bailleur et du prestataire) : forme masquée
  seule, état vérifiée / en attente, défaut, ajout, retrait.
- **Factures d'intervention** (`ServiceProviderBillsTable`) : prestataire dans « Mes
  interventions », sans geste ; agence dans l'onglet « Interventions » des finances
  (`payouts.create`) : valider (refacturable ou non), rejeter avec motif, payer puis ouvrir le
  reversement.
- **AC18** : `/admin/agency/billing` quitte `PRO_ROUTES`, la page ne redirige plus et ne montre le
  bloc d'abonnement qu'à une agence `standard` (ou au super-admin).


### Corrections après vérification adverse (VERIF-594, 2026-10-08)

Verdict de `verif-594.md` sur 9923b16c : **REFUSÉ, 1 bloquant, 6 majeurs, 5 mineurs**. Le chemin
nominal tenait ; les contournements passaient. Un commit par point, chacun avec un test **rouge sur
9923b16c** (`PayoutBypassTest`, sauf mention) et son ablation, restaurée par `cp` avec contrôle md5
(journal : `scratchpad/vague73/TCK-594-ablations.log`, section « Corrections VERIF-594 »).

- **B-1 — vérification d'office.** Décision de la session : option (a). `PayoutMethodService::autoVerify`
  est retiré ; plus aucune destination ne naît vérifiée. Raison écrite dans l'ADR-0039 §6 : le
  téléphone du compte se change et se revérifie en libre-service (`send-otp` remet
  `phone_verified_at` à `null` et envoie l'OTP au **nouveau** numéro), sans date ni avis. Le test du
  « seul un téléphone vérifié se vérifie » devient « rien ne se vérifie seul ».
- **M-5 — `mark-failed` et `cancel` sans verrou.** Les deux relisent la ligne sous `lockForUpdate()`
  dans leur transaction et y jugent le statut, comme `markProcessed`. `Payout::booted` refuse toute
  transition depuis `completed` (avant : seule la réouverture vers un état ouvert l'était). Le test
  rejoue la course de `conc/race.sh` (course 3) sans second processus : le modèle chargé avant le
  paiement est exactement ce que voyait le processus perdant. V-M5b seule laisse le premier test vert
  — le verrou suffit à ce chemin — et rougit le second : deux gardes, chacune prouvée.
- **M-1 — fractionnement sous le seuil.** Nouvelle classe `App\Services\Payout\PayoutApprovalRule`
  (`requiresApproval`, `unapprovedRecentNet`), seule à juger le seuil ; `PayoutService::initialStatus`
  devient public et la prend en paramètre de rôle et de bénéficiaire (l'utilisateur de `landlord_id`,
  ou le `tenant_id` du bail pour une caution). Statuts comptés : `pending`, `scheduled`, `processing`
  et `completed`, `approved_by_id IS NULL` — `processing` ajouté à la liste de la session, c'est
  aussi de l'argent non approuvé en route. La préparation emprunte la même règle (son bandeau le
  dit : « ajouté aux reversements non approuvés vers ce bailleur depuis 30 jours »).
  - **Verrou** : la ligne agence n'était pas prise par la création (seuls les baux, réservations et
    factures l'étaient). Elle l'est désormais, **en dernier**, après les pièces — le même ordre que
    la caution rendue (bail, puis agence) ; aucun chemin ne prend l'agence avant un bail. Le seuil
    se relit sur cette ligne verrouillée. Non éprouvé en concurrence réelle (un seul processus en
    test) : seule la règle l'est.
  - V-M1c est d'abord restée **verte** : le dernier montant du test (9 000) laissait le cumul sous le
    seuil même sans fenêtre. Porté à 15 000, elle rougit.
- **M-3 — la caution rendue à côté des quatre yeux.** `DepositRefundService` verrouille la ligne
  agence après le bail, prend son état de `PayoutService::initialStatus()` (bénéficiaire : le
  `tenant_id` du bail), et avise les approbateurs après la transaction. Un bail **sans agence**
  (cas des tests unitaires de la caution, `leases.agency_id` nullable) n'a pas de seuil : la caution
  y naît `pending`, comme avant — relevé quand 8 tests de `DepositRefundServiceTest` ont rougi sur un
  `firstOrFail()`.
- **M-6 — vérification par agence.** Table `payout_method_verifications` (migration
  `2026_10_08_100000`) ; `PayoutMethodService::verify` écrit, par `upsert`, la ligne de l'agence de
  personnel du vérificateur (celle que la policy a jugée ; sans agence → 403 `payout.agency_required`).
  `PayoutMethod::scopeVerifiedFor` sert le paiement ; `PayoutMethodResource.verified` dit si la
  destination sert **au lecteur** (son agence ; pour le titulaire, au moins une agence) sans révéler
  lesquelles. Le front n'a rien à changer : il lit toujours `verified`.
  - **Migration de l'existant : invalidé**, choix écrit dans la migration. On ne sait pas
    reconstituer l'agence au nom de laquelle un membre de plusieurs agences vérifiait, et
    `payout_methods` n'a jamais quitté cette branche : rien n'existe hors des bases de développement.
    Le `down()` redonne à chaque destination sa vérification la plus récente ; `down()` puis `up()`
    joués dans un test jetable (retiré), verts.
  - La fabrique perd `verified()` au profit de `verifiedFor($agency, $by, $at)`.
- **M-4 — l'approbation couvre la destination.** `approve` fige dans `metadata`
  `approved_payout_method_id`, `approved_destination_masked` et `approved_destination_fingerprint`
  (`PayoutMethod::fingerprint()`, HMAC-SHA256 de la nature et du numéro normalisé sous `app.key`).
  `markProcessed` appelle `assertApprovedDestination` puis `assertNotFreshlyVerifiedBy` après
  `verifiedDestination`. `PayoutResource` rend `payout_method_masked` (relation chargée par la liste
  et le détail) et `approved_destination_masked`.
  - **Décision prise ici** : un reversement approuvé **sans** destination ne part vers aucune —
    espèces ou chèque seulement. L'autre lecture (« approuvé sans destination ⇒ toute destination
    vérifiée ») rouvrait exactement le contournement. Conséquence : une facture d'intervention
    au-dessus du seuil, préparée sans destination, se paie par Wave seulement si on la prépare avec
    sa destination (l'écran de la facture ne la propose pas encore — limite écrite au rapport).
  - **Le délai de 24 h** compte depuis la vérification de **l'agence du reversement** par le payeur
    lui-même ; une revérification le relance.
  - **Deux ablations vertes, nommées** : le refus d'une approbation sans destination (V-M4c) est
    strictement redondant — le contrôle `is_string` de l'empreinte le couvre seul. La comparaison
    d'identifiant (V-M4b) **ne l'est pas tout à fait** (passe 2) : sans elle, une AUTRE fiche du
    bénéficiaire portant le MÊME numéro et le même type passe, puisque l'empreinte est celle du
    numéro. Sans danger (même numéro, même type), et la garde a un coût : une fiche supprimée puis
    recréée à l'identique ne se paie plus qu'en espèces ou par chèque — l'approbateur peut désormais
    fixer la nouvelle en approuvant (N-1), pas après. Aucun test ne fige ce cas ; le code reste.
    V-M4e, qui retire identifiant et empreinte, rougit les deux premiers tests. V-M4a a d'abord été
    mal écrite (virgule emportée, 500 de syntaxe) : rejouée, elle rougit.
  - `PayoutMethodTest::test_ac16_paying_by_wave_to_an_unverified_destination_is_refused` faisait
    vérifier puis payer par le même agent : il fait désormais vérifier par un second membre.
- **M-2 — le seuil relâché par une seule personne.** `PayoutApprovalThreshold::change` rend
  `applied`, `pending` ou `unchanged` ; `confirm` applique la demande. Trois colonnes d'`agencies`
  (migration `2026_10_08_100100`), `pending_payout_threshold_requested_at` servant de marqueur.
  Nouveau code d'avis `payout_threshold.relax_requested` (sans interrupteur, cible
  `agency_settings` → `/admin/agency`, ajoutée à `NotificationTarget::PATHS`). La trace d'un
  relâchement confirmé porte le confirmateur comme auteur et `requested_by` ; la demande elle-même
  écrit `agency_payout_threshold_relax_requested`. Renvoyer la valeur en vigueur retire la demande.
  - Le `PATCH` qui demande un relâchement enregistre le reste du formulaire et rend **202** — le
    serveur action du front le traite comme un succès, et le formulaire le dit (« il a été
    prévenu ») plutôt qu'« enregistré ».
  - La route de confirmation porte le commentaire de raccord TCK-589 (step-up 2FA).
  - `PayoutApprovalThresholdTest::test_ac8_two_approvers_enable_it_and_each_change_is_traced`
    relevait puis coupait le seuil d'une seule main : il passe par la confirmation du second.
- **m-1 — l'agence `individual` qui paie un tiers.** « Tiers » se lit comme tout bénéficiaire qui
  ne tient pas d'`AgencyAdminProfile` dans l'agence : l'hôte est l'administrateur de son agence
  individuelle (`HostIndividualOnboardingService`). La règle se juge après l'appartenance (403
  `payout.landlord_not_in_agency` d'abord) et avant la séparation des tâches. Le prestataire de
  l'hôte reste payable par `createForBill` : c'est la seule chaîne de paiement de sa facture.
- **m-2 — le seuil lu par le bailleur.** Les deux clés disparaissent de la réponse (et non `null`,
  qui se lirait « désactivé »). Un étalement conditionnel et non `$this->when()` : `AgencyController`
  appelle `toArray()` sans `resolve()`, et la clé restait présente — le premier essai l'a montré
  rouge. L'écran des réglages est déjà gardé par `useCan('payouts.approve')` ; le type front porte
  l'absence.
- **m-3 — les décimales de la facture d'intervention.** Arrondi aux deux bouts, parce que l'un ne
  couvre pas l'autre : l'observateur fixe les factures neuves, `createForBill` celles qu'une base
  aurait gardées avec leurs décimales (aucune en production : la table n'a pas quitté la branche ;
  le test les fabrique par `forceFill`). Le reversement au bailleur lisait déjà les frais arrondis
  par `PayoutCalculator` : il n'est pas touché.
- **m-4 — l'AC du verrou de numérotation.** Le test d'ordre est gardé (il prouve que le `MAX` suit
  le verrou) ; un second relève `DB::transactionLevel()` dans un écouteur `DB::listen` au moment du
  `FOR UPDATE`. La base est 1, pas 0 : `RefreshDatabase` ouvre une transaction — d'où la
  comparaison à la base et non à zéro. Les ablations substituent `call_user_func(` à
  `DB::transaction(` : même fermeture, exécutée sans transaction. Le chemin passerelle cité par
  VERIF (`:187`) est `verify()` ; le webhook (`applyEventToMatchingPayment`) était déjà en
  transaction. L'appel HTTP du pilote reste hors transaction : on ne tient pas un verrou pendant un
  aller-retour réseau.
- **m-5 — deux `send` concurrents.** La décision ne nommait que `send` ; `cancel` et `markPaid`
  portaient exactement le même défaut, et celui de `cancel` est plus grave — deux annulations d'une
  facture émise créaient **deux avoirs**. Corrigés dans le même commit, par le même
  `InvoiceService::locked()`, chacun avec son ablation. `markManualSettlement` s'applique désormais
  à la ligne verrouillée (il ne fait que poser l'attribut ; la sauvegarde suit). Ordre des verrous :
  facture, puis ligne agence par l'allocateur — celui du webhook de la passerelle.

**Observation, sans correctif (décision de session, 2026-10-08).** Une agence `suspended` paie
encore sur la chaîne agence : le gel d'une agence non active (ADR-0039 §5) ne couvre que la chaîne
plateforme. Rendre au bailleur l'argent encaissé pour lui reste légitime pendant une suspension ; on
n'y touche pas.

**Fusion de TCK-591 (2026-10-08, après les corrections VERIF-594).** Conflits gardés des deux côtés
(ADR README, `NotificationCode`, `AgencyPolicy`, INDEX régénéré). Dans `docs/models-spec.md`, le §72
revient à `CalendarFeed` (591) ; les entrées de 594 deviennent §73 `PayoutMethod`,
§74 `ServiceProviderBill` et §75 `PayoutMethodVerification`. **Un défaut invisible des deux côtés** :
chaque branche avait retiré deux lignes de `CapabilityEnforcementInventory::AWAITING` et baissé le
cliquet de `check-capability-readers` de 16 à 14. La fusion n'a eu aucun conflit textuel et gardait
14 pour un inventaire de 12 : la garde était rouge. Le cliquet passe à 12. `AgencyIdIsIndexedTest`
est vert : `payout_method_verifications.agency_id` est la première colonne de
`pm_verifications_agency_method_unique`.

### Corrections après la passe 2 (VERIF-594 passe 2, 2026-10-08)

- **N-1 — approuvé sans destination, jamais payé en mobile money.** Les deux voies de la décision,
  toutes deux : le défaut à la préparation suffit à l'écran d'intervention (qui ne cite aucune
  destination), la fixation à l'approbation couvre le bénéficiaire sans défaut vérifié. « Par défaut »
  se lit `is_default = true` ET vérifiée pour l'agence ; une autre destination vérifiée n'est pas
  prise d'office — c'est l'approbateur qui la choisit. Une caution (`tenant`) refuse toute destination
  citée à l'approbation (422). Pour que l'approbateur sans `payouts.create` puisse choisir,
  `PayoutMethodPolicy::viewHolder` lui ouvre la LECTURE (masquée) ; `verify` reste réservé à
  `payouts.create`. `test_m4_a_payout_approved_without_destination_is_not_paid_to_one` crée désormais
  sa destination hors défaut : sinon la préparation la prend, et le cas « approuvé sans » n'existe plus.
- **N-2 — la caution refusée ne se rendait plus.** « La ligne de grand livre correspondante » se lit
  comme la ligne `deposit_refund` du bail (`LeasePayment`, le journal de TCK-027 que
  `DepositRefundService` garde) : elle passe `failed`, retrouvée par bail, type, statut `pending` et
  montant — aucune clé ne la lie au reversement. Il n'y a pas d'autre grand livre dans le dépôt.
  L'activité `deposit_refund_reversed` porte le reversement, le montant, l'issue et la ligne. Le
  retour ne joue que depuis un état qui tenait la caution (`PayoutStatus::holdingItems()`) : un
  reversement `failed` puis `cancelled` ne la rend pas deux fois. Ordre des verrous : reversement,
  puis bail.
- **N-3 — la cadence mensuelle.** 27 jours : la plus longue fenêtre qui laisse passer une cadence
  mensuelle stricte (février : 28 jours entre deux 28). Le bandeau de l'écran disait « depuis
  30 jours » en dur ; il lit maintenant la valeur du serveur (`{days}` dans les trois langues), et le
  test d'ablation W-N3 rougit si l'écran l'écrit en dur. Décision réversible : changer la constante
  suffit, l'écran suit.
- **N-4 — la demande qui n'expirait pas.** L'effacement d'une demande expirée se fait dans la
  transaction, et le refus (422) est levé APRÈS elle : levé dedans, il annulerait l'effacement (c'est
  l'ablation V-N4b). L'expiration se juge à la lecture (`isExpired`), sans tâche planifiée : une
  demande expirée et jamais confirmée reste en base jusqu'au prochain changement ou à la prochaine
  confirmation, mais l'API ne la montre plus. Le front ne fait que typer `expires_at`.
- **N-5 — la confirmation qui confirmait autre chose.** La valeur attendue plutôt que la date de la
  demande : c'est ce que l'écran montre et ce que le confirmateur a lu. Le 409 se juge sous le verrou
  de la ligne agence, après l'expiration (N-4) et la séparation des tâches. Les appels existants
  (`PayoutApprovalThresholdTest::confirmedBy`, les tests M-2) envoient désormais la valeur. V-N5b
  rougit par un 500 (la clé absente est lue) : le champ facultatif ne passe pas en silence.
  *Après la fusion de `origin/dev` (TCK-590)* : la validation de `expected_threshold` était écrite
  dans le contrôleur, ce que `check-inline-validation` refuse (TCK-305) — la garde n'avait pas été
  rejouée après N-5. Elle vit dans `ConfirmPayoutThresholdRequest`, dont `authorize()` délègue à
  `AgencyPolicy::updatePayoutThreshold` (le 403 précède donc toujours la validation). V-N5b rejouée
  sur la règle déplacée : un 200 silencieux au lieu du 422, rouge.

### Corrections après la passe 3 (VERIF-594 passe 3, 2026-10-08)

- **P3-1 — la facture de retenue doublée.** La facture est créée AVANT le reversement dans
  `DepositRefundService::refund`, pour que le reversement naisse avec ses deux liens
  (`metadata.invoice_id`, `metadata.lease_payment_id`). `releaseDeposit` appelle
  `InvoiceService::cancel` — le chemin d'annulation de toute facture : un brouillon s'annule, une
  facture émise se contrepasse par un avoir numéroté. Une facture déjà payée n'est pas touchée (le
  refus d'une restitution n'a pas à défaire un règlement) ; dans ce cas, la restitution suivante en
  crée une autre — limite notée au rapport. L'auteur du `cancel` / `mark-failed` est transmis
  (`?User $actor`, facultatif : signature publique inchangée) : il signe l'avoir et l'activité.
  Ordre des verrous : reversement → bail → facture → ligne agence (l'allocateur de numéro), sans
  cycle avec la restitution (bail → agence) ni l'émission (facture → agence).
- **P3-2 — la ligne liée par son montant.** `depositRefundLine()` lit `metadata.lease_payment_id`,
  et ne bouge qu'une ligne `pending` de ce bail et de ce type. Pas de repli par montant : une
  restitution antérieure à ce correctif, sans lien, ne touche plus aucune ligne (aucune restitution
  n'a servi en production — l'API n'y a jamais tourné). Payer la ligne (`paid`, `paid_at`) l'a fait
  entrer dans les requêtes qui lisent « encaissé = `paid` » : la **clôture plateforme** l'aurait
  reversée à l'agence comme un encaissement — elle exclut maintenant `deposit_refund` (les deux
  requêtes). Les tableaux de bord (revenu du mois, flux du bailleur), `SystemMetricsController` et
  les candidats crédit du rapprochement (`ReconciliationMatcher`, une suggestion qu'une personne
  confirme) la comptent encore : affichage ou suggestion seuls, et déjà vrai d'une ligne `deposit_refund` marquée payée à la
  main (`LeasePaymentService::markPaid`) — noté pour la session.
- **P3-3 — l'approbateur qui vérifie puis fixe.** `freshlyVerifiedBy()` porte la règle des 24 h ; le
  payeur (M-4) et l'approbateur qui CITE une destination la lisent, chacun avec son code. Une
  destination déjà fixée à la préparation, que l'approbateur aurait vérifiée, n'est pas visée
  (décision de session : « quand une `payout_method_id` est citée ») — le payeur reste tenu par M-4.
- **Fusion de `origin/dev` (TCK-589).** Conflits de texte (`NotificationCode`, `AgencyConfigForm`)
  résolus en gardant les deux côtés. Le step-up de 589 n'est pas un middleware de route : il est
  global au groupe `api` et lit `ProtectedActions` par action de contrôleur. Le « raccord en une
  ligne par route » devient donc une entrée de liste par action : `STEP_UP` pour approuver, marquer
  payé, payer une facture d'intervention et gérer ses destinations ; `AGENCY_TWO_FACTOR` pour les
  actions mutantes que 594 ajoute aux familles (`approve`, `verify`, `confirmPayoutThreshold`), que
  `ProtectedActionsCoverageTest` exigeait. La confirmation du seuil n'est pas sous step-up : l'écran
  la poste par une server action, qui ne passe pas par la garde du front et ne saurait pas rejouer.
  Conséquence produit : **un bailleur ou un prestataire configure un second facteur avant d'ajouter
  sa première destination** ; l'écran le résout sur place (`GardeDoubleFacteur`, enrôlement puis
  rejeu).
- **Fusion de `origin/dev` (TCK-592).** Conflits de texte résolus en gardant les deux côtés (ADR
  README, page profil, `messages`). `CapabilityEnforcementInventory` : chaque branche retirait ce
  qu'elle branche ; les quatre capacités sortent, le cliquet passe de 12 à 10. Le test de 592 qui
  exigeait l'absence de `MaintenanceRequestObserver` vérifie désormais que le seul observateur est
  celui de 594 et qu'il n'écoute pas `MaintenanceStatusChanged` (coordination prévue). L'observateur
  lit `quote_decision_at` / `quote_rejection_reason`, que 592 garde : inchangé.
