# ADR-0039 — Les sorties d'argent : brut calculé, bénéficiaire explicite, quatre yeux, décaissement manuel tracé, factures numérotées à l'émission

- **Statut** : Accepté, **amendé le 2026-10-23** (cf. § *Amendement du 2026-10-23 — le remboursement déjà sorti devient un `Payout` constaté*)
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

**Une agence `individual` ne reverse qu'à son hôte** (VERIF-594 m-1) : `PayoutService::create`
refuse un bénéficiaire qui ne tient pas d'`AgencyAdminProfile` dans l'agence (422
`payout.individual_third_party`). L'argent d'une agence individuelle sort par la chaîne plateforme ;
le `Payout` n'y trace que ce que la plateforme rend à l'hôte. **Exception délibérée** : la facture
d'intervention (§8). `createForBill` reste permis à une agence `individual` — son prestataire est
celui de l'hôte, qu'il a lui-même assigné et dont il valide la facture ; le lui interdire laisserait
la pièce sans aucune chaîne de paiement.

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
  l'agence sur **27 jours glissants** (`pending`, `scheduled`, `processing`, `completed` sans
  `approved_by_id`), atteint le seuil ⇒ `awaiting_approval` (VERIF-594 M-1 : jugé reversement par
  reversement, il se contournait en fractionnant). **27 et non 30** (VERIF-594 passe 2, N-3,
  décision de session réversible) : un mois fait 28 jours au moins, une cadence mensuelle ne se
  cumule donc plus avec elle-même — sur 30 jours, un bailleur payé chaque mois de plus de la moitié
  du seuil passait en approbation un mois sur deux — quand un fractionnement DANS le mois reste pris.
  La valeur vit dans `PayoutApprovalRule::WINDOW_DAYS` seule ; l'écran la lit dans la préparation
  (`approval_window_days`). Une règle, `PayoutApprovalRule`, lue sous le
  verrou de la ligne agence, prise en dernier après les pièces ; la création, la préparation et la
  **caution rendue** l'empruntent (VERIF-594 M-3 : la caution naissait `pending` à côté du seuil —
  c'est une sortie d'argent, seule sa destination reste hors contrôle, le locataire n'ayant pas
  toujours de compte). Une caution **refusée** (`cancel`) ou dont le virement **échoue**
  (`mark-failed`) n'a rien rendu : son montant quitte `deposit_refunded_amount` sous le verrou du bail
  (`deposit_refunded_at` à nul si le solde revient à zéro), sa ligne `deposit_refund` passe `failed`,
  l'activité `deposit_refund_reversed` le trace, et elle se rend de nouveau — une seule fois par
  reversement (VERIF-594 passe 2, N-2 ; défaut hérité de TCK-088 que M-3 rendait courant). **Sa
  facture de retenue tombe avec elle** (VERIF-594 passe 3, P3-1 : la restitution suivante en créait
  une seconde, et la retenue se facturait deux fois) : la restitution porte `metadata.invoice_id` et
  `metadata.lease_payment_id`, et le refus ou l'échec annule la facture par le chemin de toute facture
  (`InvoiceService::cancel`) — un brouillon s'annule, une facture émise se contrepasse par un avoir ;
  payée, elle reste. **La retenue vivante est déduite du restituable** (VERIF-594 passe 4, P4-1 et
  P4-2) : `deposit_remaining` vaut `deposit_amount − deposit_refunded_amount −` la somme des factures
  de retenue vivantes du bail — liées par le `metadata.invoice_id` d'une restitution, de type
  `invoice`, `draft`, `sent`, `overdue` ou `paid` (`Lease::liveDepositRetention`), jamais une autre
  facture du bail. `refund`, `GET deposit-refund` et l'écran lisent cette seule valeur. Une
  restitution partielle retient le reste et **solde la caution** : une seconde restitution est
  refusée (`deposit_refund.already_refunded`) — elle facturait une retenue de plus, jusqu'à dépasser la
  caution. Une retenue **payée** survit à l'échec de sa restitution, et la suivante rend la caution
  moins cette retenue, sans seconde facture. La caution ne se rouvre que si la restitution est
  refusée ou échoue (sa facture tombe), ou si l'agence annule elle-même la facture de retenue — elle
  renonce à retenir, et ce montant redevient restituable. `state` dit `full` quand toute la caution
  est rendue, `partial` quand une part l'est ; le bouton de l'écran suit `deposit_remaining`, jamais
  l'état. La restitution lit la retenue sous le verrou du bail, que le refus et l'échec prennent
  aussi avant de toucher la facture ; une annulation à la main concurrente ne peut qu'agrandir le
  restituable après coup. **La ligne `deposit_refund` se retrouve par ce lien, jamais par son montant**
  (VERIF-594 passe 3, P3-2) : elle passe `failed` au refus ou à l'échec, `paid` (avec `paid_at`) au
  paiement ; payée, elle reste une sortie, et la clôture plateforme (`PlatformPayoutService`) ne la
  compte pas parmi les encaissements reversés à l'agence — ni le revenu de l'agence, ni le flux du
  bailleur, ni le revenu de la plateforme, ni le rapprochement d'un crédit du relevé (VERIF-594
  passe 4, P4-5 : `LeasePayment::exceptDepositRefunds` ; passe 5, P5-2 : ni suggérée, ni trouvée
  par la recherche manuelle, et la confirmation la refuse en 422 — son débit se rapproche de son
  reversement). Elle n'est pas non plus une échéance du
  locataire (P4-7, défaut hérité de TCK-088) : ni pénalité de retard, ni relance, ni règlement en
  ligne, et elle ne se marque pas payée à la main (422 `lease_payment.deposit_refund_paid_by_payout`)
  — seul son reversement la règle. Payée, elle ne donne pas de « Quittance de loyer » (VERIF-594
  passe 5, P5-3 : 422 `lease_payment.receipt_not_a_payment`, `receipt_available` faux, aucun bouton) :
  le document attesterait que le locataire a payé ce que l'agence lui a rendu. L'activation est refusée (422) tant que moins de deux membres actifs détiennent
  `payouts.approve`. Changer le seuil exige `payouts.approve` et se journalise
  (`agency_payout_threshold_changed`). **Le relâcher exige deux personnes** (VERIF-594 M-2 : celui
  qui allait payer le coupait seul, payait seul, puis le remettait) : un passage à `null` ou une
  hausse reste en attente (`agencies.pending_payout_threshold*`, réponse 202) jusqu'à la
  confirmation d'un **second** détenteur, avisé aussitôt ; le demandeur ne confirme pas sa propre
  demande, et une agence qui n'a qu'un détenteur ne relâche pas son seuil (403). **La demande expire au
  bout de 7 jours** (VERIF-594 passe 2, N-4) : confirmée après, 422 `payout.threshold_request_expired`,
  et elle est effacée (`agency_payout_threshold_relax_expired`) ; l'API ne rend plus une demande
  expirée, et rend `expires_at` pour les autres. **La confirmation porte la valeur confirmée**
  (VERIF-594 passe 2, N-5) : `expected_threshold`, présent même nul ; si la demande en cours diffère
  — le demandeur l'a remplacée entre la lecture et la confirmation —, 409
  `payout.threshold_request_changed` et rien n'est appliqué. Un resserrement
  (activation, baisse) reste immédiat et retire la demande en attente. **Le seuil ne se lit que par
  qui prépare ou approuve** les reversements de l'agence (`payouts.create`, `payouts.approve`) :
  `AgencyResource` ne le rend à personne d'autre, puisque le connaître aide à fractionner sous lui
  (VERIF-594 m-2). L'approbation est un état (`awaiting_approval`) que
  `mark-processed` et `mark-failed` refusent ; elle ne se rejoue pas (elle n'est permise que depuis
  cet état) ; le net approuvé est figé dans `metadata.approved_net_amount` et un paiement dont le net
  a changé depuis est refusé. **L'approbation couvre aussi la destination** (VERIF-594 M-4) : elle
  fige `approved_payout_method_id`, la forme masquée que l'approbateur a lue et une empreinte du
  numéro (HMAC sous la clé de l'application, jamais un hachage nu : un numéro se retrouve par force
  brute). Le paiement refuse (422) une autre destination, la même dont le numéro a changé, et toute
  destination pour un reversement approuvé sans (espèces et chèque restent permis). L'API rend la
  destination prévue, masquée, avant l'approbation. **Un reversement ne reste pas sans destination par
  défaut** (VERIF-594 passe 2, N-1 : approuvé sans, il ne se payait plus qu'en espèces) : préparé sans
  en citer, il prend la destination par défaut du bénéficiaire **vérifiée pour l'agence** (`create`
  comme `createForBill`) ; et l'approbateur peut **fixer ou remplacer** la destination en approuvant,
  par une destination du bénéficiaire vérifiée pour l'agence (sinon 422 `payout.unverified_destination`),
  qui entre dans l'empreinte figée. Pour la choisir, il lit les destinations masquées du bénéficiaire
  (`PayoutMethodPolicy::viewHolder`) ; il ne les vérifie pas. Les gestes qui suivent la préparation (`approve`,
  `mark-processed`, `mark-failed` et `cancel`) jugent le statut sur la ligne **verrouillée**
  (VERIF-594 M-5), et **on ne sort jamais de `completed`** : le modèle refuse toute transition depuis
  cet état, `failed` et `cancelled` compris, puisqu'elles détacheraient les pièces d'un argent parti.
- **Chaîne plateforme → agence** : approbation **toujours** exigée, sans seuil. `closed_by_id`,
  `approved_by`, `paid_by_id` sont des colonnes ; `payment_reference` est obligatoire au paiement.
  Un second super-admin doit être coopté (`SuperAdminCooptationService`) avant la mise en service.
- **Le second facteur (TCK-589, ADR-0033)** : ce qui décide qu'un argent sort, et vers où, exige un
  TOTP saisi sur le jeton il y a moins de 10 min (`ProtectedActions::STEP_UP`) — approuver, marquer
  payé, payer une facture d'intervention, ajouter, modifier ou retirer une destination (le
  titulaire, bailleur ou prestataire, configure donc un second facteur avant sa première
  destination), **vérifier une destination** pour l'agence, et les gestes plateforme. La
  vérification y est entrée à la passe 4 (VERIF-594 P4-6, décision de session réversible) : qui
  vérifie décide où l'argent part, et elle passe par `useApiMutation`, donc par
  `GardeDoubleFacteur`, qui rejoue la requête après la saisie du code ; la conséquence est assumée
  — un membre sans second facteur, agent compris, ne vérifie plus. Préparer, refuser, marquer en
  échec et confirmer un relâchement du seuil exigent la 2FA de l'agence (`AGENCY_TWO_FACTOR`), sans
  step-up : la confirmation passe par une server action, qui ne sait pas rejouer après la saisie
  d'un code. **La restitution de caution** (`LeaseDepositRefundController@store`) reste sous la
  2FA de l'agence, sans step-up : elle ne fait sortir aucun argent — elle naît comme tout
  reversement, sous le seuil des quatre yeux, et c'est son paiement (`mark-processed`), sous
  step-up, qui le fait sortir ; sa destination n'est pas contrôlée, le locataire n'ayant pas
  toujours de compte, si bien que le step-up ne protégerait aucune destination de plus.

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
VERIF-594 B-1) : ce téléphone se change et se revérifie en libre-service. Depuis TCK-589, remplacer
un numéro vérifié exige une preuve (`PhoneChangeGuard` : code envoyé à l'ancien numéro, mot de passe
ou step-up récent) et l'ancien numéro en reçoit l'avis par SMS (`account.phone_changed`) ; mais une
session prise avec son step-up fournit cette preuve, et l'avis part après coup. Après une prise de
compte, la vérification d'office appartiendrait donc toujours à l'attaquant, et retirerait la seule
défense de cette section (VERIF-594 passe 4, P4-8 : la raison écrite datait d'avant 589 ; la
décision ne change pas). Un reversement mobile money ou virement ne se marque payé que vers une
destination **du bénéficiaire**, vérifiée **par l'agence du reversement** — et pas par la main
qui paie : le membre qui a vérifié une destination ne la paie pas dans les **24 h** qui suivent,
approbation ou non (403, VERIF-594 M-4), le temps que l'avis au titulaire agisse. **La même règle
vaut pour l'approbateur qui fixe une destination** (VERIF-594 passe 3, P3-3) : s'il l'a vérifiée
lui-même il y a moins de 24 h, il ne la cite pas en approuvant (403
`payout.approver_verified_destination_recently`) — sinon il vérifie un numéro neuf, le fixe, et plus
personne ne le revoit avant le payeur. La règle porte sur la destination **fixée**, citée ou non
(VERIF-594 passe 4, P4-3) : approuver sans rien citer fixe la destination du reversement — la
destination par défaut, ou celle que le préparateur a citée —, et l'approbateur qui l'a vérifiée
dans les 24 h ne l'approuve pas davantage. Une destination vérifiée par un tiers, il la fixe. **La
destination figée est vérifiée pour l'agence, citée ou non** (VERIF-594 passe 5, P5-1) : citée à la
préparation, elle n'était contrôlée que pour son titulaire, et l'approbateur pouvait l'approuver puis
la vérifier lui-même — l'ordre des gestes contournait la règle. Non vérifiée (ou modifiée depuis par
son titulaire), l'approbation rend 422 `payout.unverified_destination` ; sans destination (espèces,
chèque), rien à vérifier. Le `rib` du profil bailleur reste une pièce KYC.

### 7. Factures : numéro à l'émission, unicité par agence, avoir

- Le numéro est **continu par `(agency_id, kind, année)`** — `FA-2026-00001` pour une facture,
  `AV-2026-00001` pour un avoir — et attribué **à l'émission** (premier passage hors `draft`) par un
  seul point, `App\Services\Invoice\InvoiceNumberAllocator`. Un brouillon ne consomme aucun numéro ;
  payer un brouillon vaut émission. Le compteur se lit sous verrou de la **ligne agence**
  (`Agency::whereKey()->lockForUpdate()`, puis `MAX` hors verrou d'agrégat), **dans une
  transaction** — hors d'elle, le verrou se relâche aussitôt l'instruction finie. L'allocateur ouvre
  la sienne, et chaque site d'appel écrit l'émission et le numéro dans la même : y compris la
  vérification forcée de la passerelle (`PaymentGatewayService::verify`), qui l'appliquait en
  autocommit (VERIF-594 m-4). On ne renumérote jamais une facture déjà émise : les `INV-…`
  existantes restent.
- L'unicité de `reference_number` devient `(agency_id, reference_number)`, plus un index partiel
  pour `agency_id IS NULL` ; un index unique porte `(agency_id, kind, sequence_year, sequence_number)`.
- Une facture émise ne s'annule que par un **avoir** (`kind = credit_note`, `credited_invoice_id`,
  même montant), créé dans la même transaction. Annuler un brouillon reste un changement de statut.
- Émettre, régler et annuler jugent le statut sur la **ligne facture relue sous verrou**, jamais sur
  le modèle de l'appelant (VERIF-594 m-5 : deux émissions concurrentes d'un même brouillon passaient
  toutes deux) ; le verrou de la facture précède celui de la ligne agence.
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
`completed`, avec un prestataire assigné et un montant (coût réel, à défaut devis approuvé —
**arrondi à l'unité de la devise**, la règle de `PayoutCalculator::round`, à la création comme au
paiement par `createForBill` : VERIF-594 m-3), sans
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

## Amendement du 2026-10-23 — le remboursement déjà sorti devient un `Payout` constaté

Décision du porteur du 2026-10-23, sur la piste P110.01 (angle 110 du fichier de pistes,
`docs/plans/2026-10-15-pistes-d-amelioration.md`). Il ajoute au § 4 une sortie d'argent qui ne
passe pas par les trois gestes, parce qu'elle a déjà eu lieu. Relu sur `pre-dev` 4a12ba515.

### Constat

- **Un débit du relevé ne se rapproche que d'un `Payout` `completed`.** Trois points l'imposent :
  - le matcher, `ReconciliationMatcher::fetchPayoutCandidates` (l. 130-148) ;
  - la recherche manuelle, `PaymentSearchService::searchPayouts` (l. 138-165) ;
  - la confirmation, `ReconciliationManager::confirmMatch`, avec sa garde de sens et son refus d'un
    reversement non `completed`.
- **Les remboursements d'acompte et de loyer ne créent aucun `Payout`.** Il en existe deux chemins :
  - le geste manuel `POST /api/booking-payments/{p}/refund`, pour l'acompte seul
    (`BookingPaymentService::refund`, l. 81-135) ;
  - le webhook, pour le loyer ou l'acompte (branche `PaymentDriverStatus::REFUNDED` de
    `PaymentGatewayService`, l. 796, et `applyPendingRefund`, l. 1382).

  Les deux n'écrivent que le statut et `refund_amount` du payable.
- **Mesuré** par l'explorateur et le mesureur, le 2026-10-22, avec un test temporaire passant par
  les services : un acompte de 100 000 payé puis remboursé en entier, et un débit de 100 000 à J+4.
  - `suggestFor` rend `null` ;
  - `search(…, Debit)` rend 0 candidat ;
  - `confirmMatch` du débit sur l'acompte rend 422 `payment_type` ;
  - `finalize` rend `partially_reconciled`.

  Le relevé ne peut plus se clore « rapproché » qu'en ignorant la ligne.
- La caution rendue, elle, a son pendant : un `Payout` `tenant`, que le débit trouve (§ 4). Mais
  elle naît **avant** que l'argent sorte (`DepositRefundService`, statut donné par
  `PayoutService::initialStatus` : `awaiting_approval`, `pending` ou `scheduled`, jamais
  `completed`), et c'est son paiement qui la fait sortir. Un remboursement déjà sorti n'a pas ce
  cycle.

### Décision

**Un remboursement d'acompte ou de loyer déjà sorti donne naissance à un `Payout` « constaté ».**

1. **Né `completed`, dans la transaction du remboursement.** Il naît dans la transaction qui écrit
   le remboursement sur le payable : celle de `BookingPaymentService::refund` pour le geste manuel,
   celle de la branche `REFUNDED` ou d'`applyPendingRefund` pour le webhook. Il ne passe par aucun
   autre statut, et le modèle refuse déjà toute sortie de `completed` (VERIF-594 M-5).
2. **Hors du seuil d'approbation et des trois gestes.** L'argent est déjà sorti : il n'y a rien à
   approuver ni à payer. `PayoutApprovalRule` ne le juge pas. `approved_by_id` reste nul, et
   `SegregationOfDuties` ne s'applique pas, faute de geste. Le contrôle a eu lieu en amont : sur le
   geste manuel, par la **2FA de l'agence** ; sur le webhook, par le prestataire de paiement.
   *Correction du 2026-10-23 (porteur)* : la décision initiale disait « sous step-up ». Le code dit
   autre chose, et c'est lui qui est retenu : `BookingPaymentController@refund` figure dans
   `ProtectedActions::AGENCY_TWO_FACTOR` (l. 182) et pas dans `STEP_UP`, comme la restitution de
   caution (§ 4). `MoneyOutTwoFactorTest` garde cette 2FA. Rien ne change dans le code sur ce point.
3. **`payee_role = tenant`**, le rôle que la caution rendue emploie déjà (§ 2). L'argent revient au
   locataire ou au client de la réservation. **`landlord_id`** suit la convention du § 2 : pour un
   loyer, le bailleur du bail ; pour un acompte, qui n'a pas de bail, **le bailleur du bien de la
   réservation** (`properties.user_id` du bien de `bookings.property_id`). Décidé par le porteur le
   2026-10-23.
4. **Un `Payout` par remboursement sorti, au montant de ce remboursement.** Le débit du relevé
   porte ce montant, et c'est lui que le rapprochement compare (`net_amount`, ±0,01). Pour un
   second remboursement partiel du même acompte, le montant est la part neuve, pas le cumul
   `refund_amount` du payable. Le brut vaut le net. Il n'y a ni commission ni frais.
5. **Il porte ses propres colonnes de rapprochement bancaire**, `bank_reconciled_at` et
   `bank_statement_line_id`, celles que `payouts` porte depuis TCK-593. Le débit du relevé s'y
   rapproche. Les colonnes du payable remboursé restent celles de son **crédit** d'origine
   (TCK-1522 dit déjà ce qu'il advient d'un payable rapproché puis remboursé).
6. **`processed_at`** est la date où l'argent est sorti : celle du geste, ou celle que porte
   l'événement du prestataire. C'est autour d'elle que le matcher cherche (fenêtre de
   `fetchPayoutCandidates`).
7. **Il ne s'attache à aucun pivot** (`payout_lease_payment`, `payout_booking_payment`). Ces pivots
   disent « cette pièce a été reversée au bailleur ». Leurs index uniques refuseraient un constaté
   pour un loyer déjà reversé. Ils retireraient aussi de la préparation un acompte partiellement
   remboursé, encore `paid` (P76.02), dont le reste est dû au bailleur.
8. **Deux colonnes additives sur `payouts` portent à la fois la marque et le lien** (décision du
   porteur du 2026-10-23) : `refunded_payment_type` et `refunded_payment_id`, nullables, un
   `nullableMorphs('refunded_payment')`. Elles désignent le `LeasePayment` ou le `BookingPayment`
   remboursé, sur le modèle de `bank_statement_lines.matched_payment_type` / `matched_payment_id`
   (la relation se nomme `refundedPayment`). **Un `Payout` constaté est exactement un `Payout` dont
   ces colonnes sont non nulles.** Cela le distingue de la caution rendue, également `tenant`, dont
   elles restent nulles. Les colonnes sont nulles pour tout `Payout` existant : la migration est
   additive, sans reprise de données.
9. **Un paiement encaissé par une intégration de la plateforme ne donne pas de `Payout` constaté**
   (décision du porteur du 2026-10-23). L'argent y est chez la plateforme (TCK-1160,
   `PlatformPayoutService::isSettledByPlatform`), et le geste manuel le refuse déjà. Son
   remboursement, par webhook, sort du compte de la plateforme et non de celui de l'agence : le
   relevé de l'agence ne porte aucun débit à rapprocher. La branche `REFUNDED` et
   `applyPendingRefund` ne créent donc le constaté que pour un payable que la plateforme n'a pas
   encaissé.

### Qui le lit, et qui doit l'écarter

`payee_role = tenant` écarte déjà le constaté de tout lecteur qui somme des « reversements au
bailleur » (`payee_role = landlord`, § 2). Mais `tenant` ne le distingue pas de la caution rendue.
Les lecteurs qui tiennent « `tenant` + `lease_id` » pour une caution lisent donc la marque du point
8 : `refunded_payment_id` non nul.

**Relevé des lecteurs de `Payout` sous `takussan-api/app`.** Commande :
`grep -rlnE "\bPayout\b|'payouts'|payouts\.|payout_(lease|booking)_payment" app`, plus
`PayoutResource.php`, que ce motif ne voit pas. Le tri à la main écarte ensuite trois sortes de
fichiers :

- ceux qui ne nomment que la capacité `payouts.*` ;
- ceux qui ne lisent que `PlatformPayout` ;
- ceux qui ne déclarent qu'une relation sans lecteur (`Agency::payouts`, `Lease::payouts`,
  `User::payouts`, `LeasePayment::payouts`, `BookingPayment::payouts`, aucun appelant sous `app/`).

Il reste **22 fichiers**.

| # | Fichier — lecture | Effet sur le constaté | Pourquoi |
|---|---|---|---|
| 1 | `Services/Payout/PayoutApprovalRule.php` — `unapprovedRecentNet` | **écarte (à changer, le seul)** — `whereNull('refunded_payment_id')` | Le cumul des 27 jours somme les `tenant` `completed` sans `approved_by_id`, par le locataire du bail. Un loyer remboursé gonflerait ce cumul et ferait passer la caution suivante du même locataire en `awaiting_approval` sans raison. |
| 2 | `Models/Lease.php` — `liveDepositRetention` | **écarte** (déjà, de fait) | Il ne lit que les `tenant` du bail qui portent `metadata.invoice_id`. Un constaté n'en porte jamais. La marque du point 8 rend l'exclusion explicite. |
| 3 | `Services/Payout/PayoutCalculator.php` — préparation, exclusion par les pivots | **écarte** (par construction) | Le constaté n'a pas de pivot (point 7) : il ne retire aucune pièce du reversement au bailleur. |
| 4 | `Services/Model/PayoutService.php` — `create` (pièces déjà reversées, par les pivots) | **écarte** (par construction) | Même raison que le n° 3. |
| 5 | `Services/Payout/OwnerStatementService.php` — `payoutsCarrying` (relevé de gérance, `payouts:send-owner-statements`, `OwnerStatementController`) | **écarte** (déjà) | Il filtre `payee_role = landlord` et passe par les pivots. |
| 6 | `Services/Dashboard/PortfolioMetrics.php` — `netPaidOutByMonth` (accueil du bailleur, tableau de bord de l'agence) | **écarte** (déjà) | Il filtre `payee_role = landlord`. La carte « reversements à venir » de l'accueil du bailleur filtre aussi `payee_role=landlord` et `upcoming` (`overview/owner/page.tsx`). |
| 7 | `Services/Accounting/ReconciliationMatcher.php` — `fetchPayoutCandidates` | inchangé | C'est le but : un `completed` non rapproché, de l'agence, au montant du débit. Le nom affiché (`resolvePayerName`) est celui du bailleur (`landlord_id`), comme pour la caution. |
| 8 | `Services/Accounting/PaymentSearchService.php` — `searchPayouts` | inchangé | La recherche manuelle doit le trouver. |
| 9 | `Services/Accounting/ReconciliationManager.php` — `confirmMatch`, `expectedAmount`, `resolvePaymentAgencyId` | inchangé | Débit, `completed`, `net_amount`, `agency_id` : il remplit déjà chaque garde. |
| 10 | `Http/Controllers/Api/Accounting/BankStatementLineController.php` — type `payout` | inchangé | Il charge le `Payout` désigné par la confirmation. |
| 11 | `Http/Resources/Accounting/BankStatementLineResource.php` — libellé du type | inchangé | Le rapprochement reste un rapprochement de `payout`. |
| 12 | `Http/Controllers/Api/PayoutController.php` — `index`, `show`, gestes | montre, marqué | Le personnel doit voir la sortie que le relevé lui présente. `approve`, `mark-processed`, `mark-failed` et `cancel` sont refusés par le statut (`completed`). |
| 13 | `Http/Resources/PayoutResource.php` | montre, marqué | La ressource rend `refunded_payment_type` et `refunded_payment_id`, pour que l'écran ne le présente pas comme un reversement à approuver. |
| 14 | `Services/Export/ExportDataService.php` — `payouts` | montre, marqué | L'export des sorties d'argent le contient. Il a déjà la colonne `payee_role`, et gagne celles du payable remboursé. |
| 15 | `Services/Admin/AdminGlobalSearchService.php` — `payouts` | inchangé | Retrouver une sortie par sa référence est utile. |
| 16 | `Services/Model/ReferenceNumberGenerator.php` | inchangé | Le constaté reçoit une référence unique, comme tout `Payout`. |
| 17 | `Console/Commands/Payouts/RemindDuePayouts.php` | inchangé | Il ne lit que `pending` et `scheduled`. |
| 18 | `Services/Model/PayoutService.php` — `approve`, `markProcessed`, `markFailed`, `cancel`, `releaseDeposit`, `depositRefundLine` | inchangé | Tous partent d'un état ouvert, et le constaté naît `completed`. `releaseDeposit` tient « `tenant` + `lease_id` » pour une caution, mais il ne joue qu'à la sortie d'un état qui tenait la caution, ce qui n'arrive jamais à un constaté. La marque du point 8 le dit explicitement. |
| 19 | `Models/Payout.php` — garde de transition, `beneficiaryUserId` | inchangé | La garde de `completed` protège le constaté. `beneficiaryUserId` rend le compte du locataire du bail, ou `null` pour un acompte (pas de bail). |
| 20 | `Policies/PayoutPolicy.php` | inchangé | La lecture suit les règles actuelles. Les gestes sont refusés par le statut. |
| 21 | `Http/Requests/Api/MarkProcessedPayoutRequest.php` | inchangé | Le constaté n'est jamais marqué payé. |
| 22 | `Models/ServiceProviderBill.php` (`imputedPayout`, `payouts`), `Services/Payout/Disbursement/ManualDisbursementDriver.php` | inchangé | Pas de facture d'intervention, pas de décaissement : le constaté n'en a pas. |

**Lecteurs indirects, sans lecture propre :** `PayoutPreparationService` (par les n° 1 et 3),
`DepositRefundService` (par `initialStatus`, donc le n° 1), `SendOwnerStatements` et
`OwnerStatementController` (par le n° 5), `ServiceProviderBillController` (par `createForBill`).
L'écouteur `NotifyTenantOfDepositRefund` ne suit que l'événement de la caution.

**Ce qui ne lit pas `Payout`, vérifié :**

- la **clôture plateforme** (`Billing\PlatformPayoutService`) ne lit que les encaissements et
  `PlatformPayout` ;
- les **revenus** (`PlatformReportingService`, `PlatformMetricsSnapshotter`,
  `DashboardAgencyService`, `AgencyMeMetrics`, `CollectedPayments`, `KpiResolver`) ne lisent pas
  `payouts` ;
- le **grand livre des commissions** (`CommissionLedgerService`) non plus.

Le constaté ne change aucun de leurs chiffres. Le remboursement y est déjà compté par le statut et
`refund_amount` du payable.

### Points tranchés le 2026-10-23

Le premier jet de cet amendement laissait cinq points ouverts. Le porteur les a tranchés le jour
même, et ils sont écrits plus haut :

- le second facteur du geste manuel est la 2FA de l'agence, pas le step-up (point 2) ;
- `landlord_id` d'un acompte remboursé est le bailleur du bien de la réservation (point 3) ;
- la marque et le lien sont les colonnes `refunded_payment_type` / `refunded_payment_id` (point 8) ;
- un paiement encaissé par la plateforme ne donne pas de constaté (point 9) ;
- `PayoutApprovalRule::unapprovedRecentNet` est le seul lecteur à changer (n° 1 du tableau).

### Application

- Une migration additive : `nullableMorphs('refunded_payment')` sur `payouts`, `$fillable` et
  relation `refundedPayment()` sur `Payout`.
- Les deux chemins de remboursement créent le constaté dans leur transaction (points 1 à 9), sauf
  pour un payable encaissé par la plateforme.
- `PayoutApprovalRule::unapprovedRecentNet` l'écarte (`whereNull('refunded_payment_id')`, n° 1).
  `Lease::liveDepositRetention` et `PayoutService::releaseDeposit` / `depositRefundLine` lisent
  la même marque, pour que « `tenant` + `lease_id` » ne vaille plus caution sans condition.
- `PayoutResource` et l'export rendent les deux colonnes.
- **Gardes** :
  - le scénario mesuré de P110.01 : acompte payé puis remboursé, débit à J+4, le débit est
    suggéré puis confirmé, et le relevé se clôt `reconciled` ;
  - le même scénario par le webhook d'un loyer ;
  - une caution rendue après un loyer remboursé du même locataire ne passe pas en
    `awaiting_approval` à cause de lui ;
  - un acompte partiellement remboursé reste préparable pour le bailleur ;
  - le remboursement par webhook d'un acompte encaissé par la plateforme ne crée aucun `Payout` ;
  - le constaté d'un acompte porte en `landlord_id` le bailleur du bien.

  Chaque garde se vérifie par ablation.
