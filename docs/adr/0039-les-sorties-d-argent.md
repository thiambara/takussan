# ADR-0039 — Les sorties d'argent : brut calculé, bénéficiaire explicite, quatre yeux, décaissement manuel tracé, factures numérotées à l'émission

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-594](../backlog/tickets/TCK-594-sorties-d-argent-calculees-et-validees.md)
- **Précise** : le principe non négociable n° 3 (« le montant est décimal en base, entier ×100 à la
  frontière du driver »), [ADR-0007](0007-pas-d-enum-sql.md) (pas d'`enum()` SQL) et
  [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (le bénéficiaire ne gère
  jamais son propre versement).

## Contexte

Relu dans le code sur `fd4bd805` (`dev`, après TCK-586 et TCK-587) :

- **Le brut d'un reversement se saisit à la main.** `CreatePayoutDialog` calcule la commission dans
  le navigateur, `PayoutService::create` recopie `gross_amount` sans contrôle, et les pivots
  `payout_lease_payment` / `payout_booking_payment` ne sont remplis que par le seeder : rien
  n'empêche de reverser deux fois le même loyer, ni de citer le bail d'une autre agence.
- **La table `payouts` porte deux flux.** Le remboursement de caution — de l'argent rendu au
  **locataire** — y est un `Payout` dont `landlord_id` désigne le bailleur
  (`DepositRefundService`). L'accueil du bailleur le liste comme un versement qui lui est dû.
- **Une seule main tient toute la sortie d'argent.** `Payout` n'a aucun champ d'approbation ;
  `payouts.approve` n'est lue nulle part ; `PlatformPayoutService::approve` n'enregistre pas l'auteur
  de la clôture et `markPaid` ni le payeur ni une référence obligatoire — le test de référence
  approuve **et** paie avec le même super-admin. Une agence suspendue est clôturée, approuvée et
  payée ; la clôture globale s'interrompt à la première agence déjà clôturée.
- **Aucune destination mobile money, aucun décaissement.** Le profil bailleur ne connaît qu'un `rib`
  (pièce KYC), le prestataire aucun moyen d'être payé, et les pilotes de paiement ne savent
  qu'encaisser (`PaymentDriverContract::initiate|verify|handleWebhook`).
- **La facture n'est pas opposable.** Numéro aléatoire (`INV-{Ym}-{random}`), unicité globale de
  `reference_number`, TVA à 0 sans réglage, aucune mention légale sur le PDF, une facture émise
  s'annule sans contre-document, un brouillon se paie sans être émis.
- **La facture d'intervention n'existe pas** : `Invoice` va de l'agence vers un `Customer`, elle ne
  peut pas porter une pièce *reçue* d'un prestataire.

## Décision

**Une sortie d'argent naît d'un calcul serveur sur des pièces encaissées, désigne son bénéficiaire,
passe par trois gestes qu'une même personne ne tient jamais deux fois de suite, se paie à la main
vers une destination vérifiée avec une référence obligatoire, et toute facture émise reçoit un numéro
continu par agence, type et année.**

### 1. Décaissement : manuel tracé, derrière un contrat distinct

L'humain paie dans Wave Business, Orange Money ou sa banque, puis saisit la référence. Le geste
passe par `App\Contracts\Payments\DisbursementDriverContract`, **distinct** de
`PaymentDriverContract` (encaisser et décaisser n'ont ni les mêmes appels, ni les mêmes risques),
avec un seul pilote, `ManualDisbursementDriver`, qui n'appelle aucun tiers : il consigne la
référence et la destination masquée. Le pilote automatique (API de décaissement Wave Business)
fera l'objet d'un ticket suivant, conditionné à un compte qui dispose de cette API.

*Écarté* : un décaissement automatique dès ce ticket — aucun compte Wave Business doté de l'API
n'existe, et un pilote qu'on ne peut pas éprouver contre le vrai service est une promesse.

### 2. Qui reçoit : `payouts.payee_role`

`payee_role` ∈ `landlord` | `tenant` | `service_provider`, chaîne de caractères et non `enum()`
(ADR-0007), défaut `landlord`. Tout lecteur qui somme des « reversements au bailleur » filtre
`payee_role = landlord` ; `filter[payee_role]` est exposé. Le remboursement de caution s'écrit
`tenant`, et une migration de données y passe les existants (jointure sur le `LeasePayment`
`deposit_refund` de même bail, même montant, même seconde de création).

`landlord_id` reste la colonne de l'**utilisateur bénéficiaire** pour `landlord` et
`service_provider` (le prestataire), et désigne le bailleur du bail pour `tenant` — le locataire
est un `Customer`, pas forcément un utilisateur. Le nom est historique ; le renommer casserait
TCK-593 et TCK-595, qui lisent déjà `payouts` (`transaction_id` garde son nom pour la même raison).

*Écarté* : une table par bénéficiaire. Trois tables pour un seul flux de sortie, c'est trois
chaînes de quatre yeux à tenir égales.

### 3. Le brut n'est jamais une saisie

Il se calcule côté serveur, par **une seule** classe (`App\Services\Payout\PayoutCalculator`)
qu'emploient la préparation, la création et le relevé de gérance :

- **Pièces retenues** : les `LeasePayment` `paid` dont `paid_at` tombe dans la période, de type
  `rent`, `charges`, `penalty` ou `regularization` (`deposit` et `deposit_refund` exclus : la caution
  n'appartient pas au bailleur) ; les `BookingPayment` `paid` de type `deposit` (l'acompte du
  séjour) et `advance` (`fee` exclu : ce sont les frais de l'agence).
- **Périmètre** : chaque pièce relève de l'agence de l'émetteur et du bailleur désigné (bail :
  `agency_id` et `landlord_id` ; réservation : `agency_id` et `properties.user_id`). Sinon 422,
  sans rien écrire.
- **Commission** : taux du bail, à défaut celui de l'agence, appliqué **ligne par ligne** et arrondi
  à l'unité de la devise (`Currency::decimalPlaces()` : 0 pour XOF). Le montant reste décimal en
  base ; aucune conversion ×100 ici, elle n'a lieu qu'à la frontière d'un pilote (principe n° 3).
- **Frais** : les factures d'intervention `validated`, refacturables au bailleur, non encore
  imputées.
- **Un paiement n'est reversé qu'une fois** : index uniques sur `payout_lease_payment.lease_payment_id`
  et `payout_booking_payment.booking_payment_id`. Un reversement `cancelled` ou `failed` détache ses
  pièces. La création verrouille les lignes de **bail** (et de réservation) concernées — le point de
  sérialisation est la ligne parent, jamais un `lockForUpdate()` sur un agrégat. Une violation
  d'unicité remonte en 409 **après** le rollback : elle n'est jamais attrapée dans la transaction.

### 4. Les quatre yeux, écrits une fois

Une sortie d'argent passe par trois gestes : **préparer** (créer, clôturer), **approuver**,
**marquer payé**. La même personne ne tient jamais deux gestes consécutifs — l'approbateur n'est pas
le préparateur, le payeur n'est pas l'approbateur — et le bénéficiaire n'en tient aucun.
`App\Support\SegregationOfDuties::assertDistinct(User $actor, array $priorActorIds, string $step)`
porte la règle ; les deux chaînes l'appellent, aucune ne la réécrit. Une violation rend **403** avec
une clé i18n. La comparaison porte sur l'**utilisateur**, jamais sur le profil : deux profils ou
deux agences ne font pas deux personnes.

- **Chaîne agence → bailleur / prestataire** (tranché par le porteur le 2026-10-06) :
  `agencies.payout_approval_threshold` vaut `null` pour toute agence, neuve ou existante. Tant qu'il
  est `null`, un reversement naît `pending` (ou `scheduled`) et une seule personne peut le préparer
  puis le payer. L'agence active elle-même le seuil (`0` ⇒ toujours). Le seuil se juge sur le
  **cumul** : le net, ajouté aux nets **non approuvés** déjà émis vers le même bénéficiaire dans
  l'agence sur **30 jours glissants** (`pending`, `scheduled`, `processing`, `completed` sans
  `approved_by_id`), atteint le seuil ⇒ `awaiting_approval` (VERIF-594 M-1 : jugé reversement par
  reversement, il se contournait en fractionnant). Une règle, `PayoutApprovalRule`, lue sous le
  verrou de la ligne agence, prise en dernier après les pièces ; la création, la préparation et la
  **caution rendue** l'empruntent (VERIF-594 M-3 : la caution naissait `pending` à côté du seuil —
  c'est une sortie d'argent, seule sa destination reste hors contrôle, le locataire n'ayant pas
  toujours de compte). L'activation est refusée (422) tant que moins de deux membres actifs détiennent
  `payouts.approve`. Changer le seuil exige `payouts.approve` et se journalise
  (`agency_payout_threshold_changed`). **Le relâcher exige deux personnes** (VERIF-594 M-2 : celui
  qui allait payer le coupait seul, payait seul, puis le remettait) : un passage à `null` ou une
  hausse reste en attente (`agencies.pending_payout_threshold*`, réponse 202) jusqu'à la
  confirmation d'un **second** détenteur, avisé aussitôt ; le demandeur ne confirme pas sa propre
  demande, et une agence qui n'a qu'un détenteur ne relâche pas son seuil (403). Un resserrement
  (activation, baisse) reste immédiat et retire la demande en attente. L'approbation est un état (`awaiting_approval`) que
  `mark-processed` et `mark-failed` refusent ; elle ne se rejoue pas (elle n'est permise que depuis
  cet état) ; le net approuvé est figé dans `metadata.approved_net_amount` et un paiement dont le net
  a changé depuis est refusé. **L'approbation couvre aussi la destination** (VERIF-594 M-4) : elle
  fige `approved_payout_method_id`, la forme masquée que l'approbateur a lue et une empreinte du
  numéro (HMAC sous la clé de l'application, jamais un hachage nu : un numéro se retrouve par force
  brute). Le paiement refuse (422) une autre destination, la même dont le numéro a changé, et toute
  destination pour un reversement approuvé sans (espèces et chèque restent permis). L'API rend la
  destination prévue, masquée, avant l'approbation. Les gestes qui suivent la préparation (`approve`,
  `mark-processed`, `mark-failed` et `cancel`) jugent le statut sur la ligne **verrouillée**
  (VERIF-594 M-5), et **on ne sort jamais de `completed`** : le modèle refuse toute transition depuis
  cet état, `failed` et `cancelled` compris, puisqu'elles détacheraient les pièces d'un argent parti.
- **Chaîne plateforme → agence** : approbation **toujours** exigée, sans seuil. `closed_by_id`,
  `approved_by`, `paid_by_id` sont des colonnes ; `payment_reference` est obligatoire au paiement.
  Un second super-admin doit être coopté (`SuperAdminCooptationService`) avant la mise en service.

*Écarté* : un seuil par défaut (décision du porteur) ; une règle stricte « préparateur ≠ payeur »
(trois personnes) — elle rendrait la chaîne agence inapplicable dans une agence de deux.

### 5. Gel d'une agence non active, et KYC

Une agence dont `status <> active` n'est ni clôturée, ni approuvée, ni payée par la plateforme — y
compris quand la suspension survient après la clôture (`approve` et `markPaid` relisent
`agencies.status`, 422). La clôture globale range ces agences dans les exclues
(`agency_not_active`), à côté de celles déjà clôturées (`already_closed`), et **continue** : chaque
agence a sa transaction, et une course perdue sur l'index unique partiel range l'agence dans les
exclues après le rollback. L'approbation d'une agence `standard` non vérifiée est refusée (422) ;
pour une agence `individual`, l'état de vérification est seulement affiché.

### 6. Destinations de paiement

`payout_methods` (`wave` | `orange_money` | `free_money` | `bank_transfer`) appartient à un
utilisateur. `account_identifier` et `account_holder_name` sont des colonnes `text` au cast
`encrypted`, `$hidden`, hors `$queryFields` et hors recherche, jamais écrites dans `activity_log` —
le mécanisme que TCK-601 définira ; tant qu'il n'existe pas, le masquage passe par **une seule**
méthode (`PayoutMethod::mask()`, quatre derniers caractères), que TCK-601 remplacera. L'API ne rend
en clair qu'au titulaire. Ajouter ou modifier une destination **notifie le titulaire** et la
destination modifiée repasse « non vérifiée ». La vérification incombe à un membre de l'agence qui
détient `payouts.create`, jamais au titulaire, et elle **vaut pour l'agence de ce membre seule**
(`payout_method_verifications`, unique par `(agency_id, payout_method_id)` — VERIF-594 M-6 : une
vérification globale laissait une agence complaisante ouvrir la destination à toutes les autres) ;
une destination modifiée perd toutes ses vérifications. **Rien n'est vérifié d'office** — pas même un numéro
égal au téléphone vérifié du titulaire (décision du 2026-10-08, après la vérification adverse
VERIF-594 B-1) : ce téléphone se change et se revérifie en libre-service, sans date ni avis, si bien
qu'après une prise de compte la vérification d'office appartenait à l'attaquant et retirait la seule
défense de cette section. Un reversement mobile money ou virement ne se marque payé que vers une
destination **du bénéficiaire**, vérifiée **par l'agence du reversement** — et pas par la main
qui paie : le membre qui a vérifié une destination ne la paie pas dans les **24 h** qui suivent,
approbation ou non (403, VERIF-594 M-4), le temps que l'avis au titulaire agisse. Le `rib` du profil bailleur reste une pièce KYC.

### 7. Factures : numéro à l'émission, unicité par agence, avoir

- Le numéro est **continu par `(agency_id, kind, année)`** — `FA-2026-00001` pour une facture,
  `AV-2026-00001` pour un avoir — et attribué **à l'émission** (premier passage hors `draft`) par un
  seul point, `App\Services\Invoice\InvoiceNumberAllocator`. Un brouillon ne consomme aucun numéro ;
  payer un brouillon vaut émission. Le compteur se lit sous verrou de la **ligne agence**
  (`Agency::whereKey()->lockForUpdate()`, puis `MAX` hors verrou d'agrégat). On ne renumérote jamais
  une facture déjà émise : les `INV-…` existantes restent.
- L'unicité de `reference_number` devient `(agency_id, reference_number)`, plus un index partiel
  pour `agency_id IS NULL` ; un index unique porte `(agency_id, kind, sequence_year, sequence_number)`.
- Une facture émise ne s'annule que par un **avoir** (`kind = credit_note`, `credited_invoice_id`,
  même montant), créé dans la même transaction. Annuler un brouillon reste un changement de statut.
- La TVA par défaut est un réglage d'agence (`default_tax_rate`) ; un taux explicite gagne. Les
  mentions légales (`legal_name`, `ninea`, `rccm`, `legal_address`) sont des colonnes d'agence,
  reprises de `metadata.legal_info` (jamais `rib_pro`), réservées aux agences `standard` et imprimées
  au pied du PDF quand elles existent. Aucun contrôle de forme du NINEA ni du RCCM (dette D-68).

*Écarté* : une numérotation par compteur stocké (table de séquences) — un second objet à tenir
cohérent avec les factures, quand le `MAX` sous verrou de la ligne parent suffit au volume d'une
agence.

### 8. Facture d'intervention : une pièce reçue, payée par la même chaîne

`ServiceProviderBill` est un modèle propre — c'est une pièce **reçue**, alors qu'`Invoice` est une
pièce **émise** vers un `Customer`. Elle naît d'un observateur sur `MaintenanceRequest` au passage à
`completed`, avec un prestataire assigné et un montant (coût réel, à défaut devis approuvé), sans
exception attendue (une demande n'a qu'une facture ouverte, par index unique partiel et
`insertOrIgnore`). Elle se valide ou se rejette par l'agence, et se paie par un `Payout`
`payee_role = service_provider` : même seuil, mêmes quatre yeux, même destination vérifiée. Pas de PDF
au nom du prestataire.

## Conséquences

- `POST /api/payouts` change de contrat : il prend des identifiants de pièces et refuse tout montant
  (`prohibited`), ainsi que `lease_id` / `booking_id`. Les clients existants doivent passer par
  `GET /api/payouts/preparation`.
- Le CHECK « `lease_id` OU `booking_id` » de models-spec §28 ne tient plus dès qu'un reversement
  couvre plusieurs baux : l'origine se garantit à l'écriture (au moins une pièce), et les pivots la
  portent. La spec est à corriger.
- Une agence de deux personnes qui active le seuil ne peut plus payer seule ; c'est le prix voulu.
- La plateforme ne peut plus payer avec un seul super-admin : un second est un prérequis de mise en
  service, pas une option.
- Le décaissement reste humain : la référence saisie est la seule preuve, et le rapprochement
  bancaire (TCK-593) la confronte au débit.
- Le masquage des destinations est provisoire jusqu'à TCK-601, qui branche son masqueur à la place
  de `PayoutMethod::mask()`.

## Application

- `App\Support\SegregationOfDuties` ; `PayoutService::approve|markProcessed`,
  `PlatformPayoutService::approve|markPaid`. Tests : `PayoutApprovalTest`,
  `PlatformPayoutSegregationTest`, chacun rougit à l'ablation de l'appel.
- `App\Services\Payout\PayoutCalculator`, `PayoutPreparationService`, index uniques des pivots :
  `PayoutPreparationTest`, `PayoutItemScopeTest`.
- `InvoiceNumberAllocator` : `InvoiceNumberingTest` énumère ses sites d'appel.
- `CapabilityEnforcementInventory` : `payouts.approve` et `agency.update_billing` en sortent ;
  `scripts/check-capability-readers.mjs` les voit lues.
