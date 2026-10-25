# ADR-0039 — Les sorties d'argent : brut calculé, bénéficiaire explicite, quatre yeux, décaissement manuel tracé, factures numérotées à l'émission

- **Statut** : Accepté, **amendé le 2026-10-23** (cf. § *Amendement du 2026-10-23 — le remboursement déjà sorti devient un `Payout` constaté*), **le 2026-10-24** (cf. § *Amendement du 2026-10-24 — la reprise au bailleur, le relevé lu par la copie, la pénalité de retard reversée*) **le 2026-10-25** (cf. § *Amendement du 2026-10-25 — la facture d'une intervention contestée ou annulée*) et **le 2026-10-25 (bis)** (cf. § *Amendement du 2026-10-25 (bis) — la restitution de caution bornée à la caution encaissée*)
- **Date** : 2026-10-07
- **Tickets** : [TCK-594](../backlog/tickets/TCK-594-sorties-d-argent-calculees-et-validees.md), [TCK-2270](../backlog/tickets/TCK-2270-facture-d-intervention-contestee-ou-annulee.md) (amendement du 2026-10-25), [TCK-2340](../backlog/tickets/TCK-2340-restitution-de-caution-bornee-a-l-encaisse.md) (amendement du 2026-10-25, bis)
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

## Amendement du 2026-10-24 — la reprise au bailleur, le relevé lu par la copie, la pénalité de retard reversée

Décisions du porteur du 2026-10-24, sur six pistes du fichier de pistes
(`docs/plans/2026-10-15-pistes-d-amelioration.md`) : P177.01 (option a), P205.01 (option b), P205.02,
P205.03, P206.01 (option a) et P206.04 (option a). Elles complètent le § 3 et l'amendement du
2026-10-23. Le premier jet laissait cinq points ouverts ; le porteur les a tranchés le jour même
(cf. *Points tranchés le 2026-10-24*). Relu sur 54f0f14b4.

### Constat

- **Un reversement versé ne voit rien de ce qui arrive ensuite à ses pièces.**
  - Une pièce rattachée à un pivot n'est plus jamais éligible, et seules les pièces `paid` entrent au
    calcul (`PayoutCalculator.php:67`, `:74-77`, `:91`, `:98-101`).
  - Les deux chemins de remboursement ne lisent pas les pivots : le geste déclaré
    (`BookingPaymentService::refund`, l. 133-185) et le webhook (`PaymentGatewayService::applyRefund`,
    l. 1354-1367).
  - La relecture des pièces (`assertItemsStillPaid`, `refundedSincePreparation`,
    `PayoutService.php:607-633`) ne joue qu'à l'approbation et au paiement, jamais après `completed`.
  - **Mesuré** (P205.01, test temporaire) : loyer de 150 000 et avance de 50 000, bail à 10 %,
    reversement de 180 000 `completed`, puis les deux pièces remboursées. Le reversement suivant,
    sur un loyer neuf de 100 000, verse 90 000. Les 180 000 ne sont repris nulle part.
- **Le relevé de gérance relit les pièces du jour, pas ce que le reversement a pris.** Il ne garde
  que les pièces `paid` de la période (`OwnerStatementService.php:53-54`), à `montant −
  refund_amount` (`PayoutCalculator::kept`, l. 251-254), et retrouve les reversements par ces seules
  pièces (`payoutsCarrying`, l. 106-119). TCK-2017 copie dans le pivot `amount`, `commission_rate` et
  `commission_amount` (migration `2026_10_24_010000_add_line_copy_to_payout_pivots.php`), mais le
  relevé n'en relit que le taux (`retainedRates`, l. 147-160). **Mesuré** (P177.01) : loyer de
  200 000 et charges de 20 000 à 10 %, reversement de 198 000. Loyer remboursé de 50 000 : le relevé
  imprime un net de 153 000 à côté d'un versé de 198 000. Les deux pièces remboursées en entier : le
  versement de 198 000 n'apparaît plus sur aucun relevé.
- **Aucune date de remboursement n'existe sur les pièces** : ni `lease_payments` ni
  `booking_payments` n'en portent. Le `Payout` constaté de l'amendement du 2026-10-23 est daté
  (`processed_at`), mais il n'existe pas pour une pièce soldée par la plateforme
  (`ObservedRefundPayout.php:40`, point 9).
- **L'accueil du bailleur garde le versé d'un mois remboursé.** `netPaidOutByMonth`
  (`PortfolioMetrics.php:290-303`) somme `net_amount` des reversements `completed`. **Mesuré**
  (P205.03, sur le service) : après le scénario de P205.01, le versé reste à 180 000 et l'encaissé de
  ces pièces tombe à 0.
- **Le geste déclaré ne dit pas qu'un acompte est déjà reversé.** `BookingPaymentResource` ne rend
  aucun champ de reversement, et la tâche « remboursement à traiter » liste tous les acomptes `paid`
  (`BookingRefundTaskService.php:68`). Aucun avis ne part à l'agence (mesuré : 0 avant, 0 après).
- **La pénalité de retard réglée n'est jamais reversée.**
  - Elle n'est pas une pièce : elle vit sur la ligne du loyer (`late_fee_amount`,
    `late_fee_paid_at`).
  - Le type `penalty` du § 3 est l'indemnité de résiliation anticipée, son seul écrivain
    (`LeaseService.php:341`).
  - `PayoutCalculator` ne lit aucune colonne `late_fee_*`.
  - **Mesuré** (P206.01) : un loyer de 150 000 réglé avec 7 500 de pénalité donne un brut de 150 000,
    à la préparation comme au relevé.
  - La clôture plateforme, elle, met au brut de l'agence la pénalité réglée par son checkout
    (`PlatformPayoutService.php:345-355`). L'agence la reçoit et ne la reverse pas, alors que TCK-594
    la donne au bailleur (« elles reviennent au bailleur, entrent dans le brut et portent
    commission »).
- **Un remboursement ne sait pas rendre la pénalité.**
  - Il est plafonné au montant du loyer (`PaymentGatewayService.php:1382`), et le modèle refuse
    `refund_amount > amount` (`HasPaymentAttributes.php:108-115`).
  - **Mesuré** (P206.04) : un checkout de 157 500, pénalité de 7 500 comprise, remboursé en entier
    par webhook, donne `refund_amount 150000`. `late_fee_paid_at` reste posé. Les 7 500 rendus ne
    sont tracés nulle part.

### Décision

**Un remboursement d'une part déjà reversée au bailleur crée une reprise. C'est sa seule trace
négative, au relevé comme à l'accueil. Le relevé lit un reversement versé par la copie de ses
lignes. La pénalité de retard réglée est une ligne du reversement, et un remboursement s'impute
d'abord à elle.**

#### 1. Le relevé lit un reversement versé par sa copie (P177.01)

Une pièce portée par un reversement au bailleur `completed` se lit **par son pivot**, quel que soit
son statut du jour. Ses montants sont ceux de la copie : `amount`, `commission_rate`,
`commission_amount`. Elle reste au mois de son `paid_at`. Les autres pièces se lisent comme
aujourd'hui (`paid`, `montant − refund_amount`). Une ligne de pivot sans copie, antérieure à
TCK-2017, se lit aussi comme aujourd'hui (la règle de sa migration). La pénalité de retard prise par
un reversement `completed` se lit de même, par sa copie sur la ligne du loyer (point 6).

Conséquence : le mois d'un reversement versé ne change plus quand ses pièces sont remboursées. Le
remboursement apparaît au mois où il a lieu, sous la forme de la reprise (point 2).

#### 2. La reprise (P205.01)

1. **Quand.** Une pièce, ou la part de pénalité d'une ligne (points 6 et 7), portée par un reversement au
   bailleur `completed` est remboursée en tout ou en partie, par le geste déclaré ou par webhook,
   quel que soit le montant. Le reversement porteur se relit **sous verrou**, dans la transaction du
   remboursement et après la ligne de la pièce. `markProcessed` relit déjà les pièces sous le verrou
   du reversement. Si un remboursement est concurrent du paiement, il aboutit donc à l'un de deux
   états : un reversement qui refuse de passer `completed` (`payout.items_changed`, TCK-1158), ou une
   reprise. Jamais aux deux, jamais à aucun.
2. **Quel que soit l'encaisseur.** Une pièce soldée par la plateforme et reversée au bailleur (après
   le paiement de son `PlatformPayout`, TCK-2064) donne une reprise comme les autres. C'est le
   bailleur qui doit, pas le compte qui a rendu l'argent.
3. **Combien.** Une reprise par remboursement et par part reversée, au montant **net de
   commission** : `R − arrondi(R × taux / 100)`. `R` est la part neuve de ce remboursement, comme
   pour le constaté (point 4 du 2026-10-23). Le taux est celui de la copie, et l'arrondi est celui
   de `PayoutCalculator::round`. L'agence renonce à sa commission sur la part rendue. Le bailleur
   rend ce qu'il en a reçu.
4. **Datée** par l'instant du remboursement : celui du geste, ou celui de l'événement du
   prestataire. C'est la date que P177.01 n'avait pas.
5. **Imputée au reversement suivant du même bailleur dans la même agence**, à sa création
   (`createLocked`), sous verrou. Les reprises en cours sont prises de la plus ancienne à la plus
   récente, après les pièces et avant la ligne agence, qui reste la dernière (VERIF-594 M-1).
   L'imputation va jusqu'au net avant reprise. `net_amount` vaut `brut − commission − frais −
   reprise imputée`, et c'est l'argent qui part.
6. **Report, et non plus blocage.** Le refus `payout.net_negative` (`PayoutService.php:458`) ne
   juge plus que le net **avant** reprise. Une reprise plus grande que ce net y est imputée à
   hauteur de ce net. Le reliquat reste dû et passe au reversement suivant.

   **Un reversement dont la reprise absorbe tout le net naît à `net_amount = 0`.** Il prend ses
   pièces et son imputation comme tout reversement, et passe par les gestes du § 4, mais **sans
   décaissement** :
   - le paiement (`mark-processed`) n'exige ni moyen de paiement, ni référence, ni destination
     (`MarkProcessedPayoutRequest`, aujourd'hui `payment_method` et `transaction_id` requis) ;
   - il n'appelle pas `DisbursementDriverContract::disburse` (`PayoutService.php:319`) ;
   - l'approbation ne fige aucune destination ;
   - aucun débit bancaire ne lui correspond, et le rapprochement ne le propose jamais : il cherche un
     `net_amount` égal à un débit.

   Sans lui, les pièces du mois attendraient un mois plus riche, et le reste dû de la reprise ne
   baisserait pas.
7. **Un reversement `cancelled` ou `failed` rend ses reprises**, comme ses pièces (§ 3) : son
   imputation se détache, et le reliquat revient. Un reversement `completed` ne rend rien (§ 4).
8. **L'agence et le bailleur reçoivent chacun un avis**, par un code neuf, à chaque reprise, quel
   que soit le chemin du remboursement. Le webhook ne se refuse pas (P205.01 : aucune route ne
   rembourse un loyer), et l'avis est le seul signal sur ce chemin. Celui du bailleur lui dit que
   son prochain reversement baissera, et de combien.
9. **Une reprise qu'aucun reversement n'impute reste due par le bailleur**, par exemple après la fin
   du mandat. L'agence la voit : la préparation des reversements de ce bailleur et la liste des
   reprises en cours de l'agence la rendent, avec son reste dû. **L'agence la solde à la main.**
   - **Le geste.** Il est réservé à qui prépare les reversements (`payouts.create`), sous la 2FA de
     l'agence, sans step-up, comme la préparation (§ 4). Une note est obligatoire : la référence du
     règlement reçu hors reversement, ou son motif.
   - **Ce qu'il écrit.** Sous le verrou de la reprise, il fige son reste dû dans `settled_amount`
     et pose `settled_at`, `settled_by_id` et `settlement_note`. Le geste est journalisé.
   - **Le reste dû** vaut `amount − imputations des reversements qui gardent leurs pièces −
     settled_amount`. Une reprise soldée n'est plus imputée.
   - **Refus.** Le geste est refusé (422) tant qu'un reversement pas encore `completed` porte une
     imputation de la reprise. Son annulation rouvrirait sinon une reprise déjà soldée.
   - **Pas de ligne neuve.** Le relevé ne porte rien de plus : la reprise y figure déjà, à sa date
     (point 4).

Pas de reprise pour une pièce jamais reversée. Le bailleur n'en a rien reçu : la préparation la
compte déjà à `montant − refund_amount` (TCK-1214), ou l'écarte une fois `refunded`. Pas de reprise
non plus pour une pièce d'un reversement pas encore `completed` : TCK-1158 le bloque jusqu'à son
annulation.

**Pas de reprise sans copie** (confirmé par le porteur). Il faut une base et un taux figés. Une
pièce d'un pivot sans copie reste lue au jour au point 1. Une reprise s'y ajouterait au retrait de la pièce, et compterait le
remboursement deux fois. Ces pivots datent d'avant le 2026-10-24, et l'API n'a jamais servi en
production.

#### 3. Une seule ligne négative par remboursement : la reprise, et non le constaté

**La forme retenue.** La reprise est l'unique ligne négative d'un remboursement, au relevé comme à
l'accueil. Le `Payout` constaté reste écarté du relevé (n° 5 du tableau du 2026-10-23, inchangé).
Le reversement qui impute une reprise compte au versé **avant** reprise.

Le constaté ne peut pas porter cette ligne, pour quatre raisons :

- il est au montant rendu au locataire, **brut**, alors que le bailleur n'a reçu que le net ;
- il naît aussi pour une pièce jamais reversée, dont le bailleur ne doit rien ;
- il ne naît pas pour une pièce soldée par la plateforme (point 9 du 2026-10-23) ;
- lu à côté de la reprise, il ferait **deux** lignes pour un remboursement : le constaté au mois du
  remboursement, puis le reversement suivant diminué de la reprise.

Le constaté trace la sortie vers le locataire, que le relevé bancaire rapproche. La reprise trace la
dette du bailleur. Ce sont deux objets.

La reprise n'est pas un `Payout` : un `Payout` au net négatif entrerait chez les 22 lecteurs de
l'amendement du 2026-10-23 (rapprochement bancaire, seuil des quatre yeux, export, recherche). Aucun
débit bancaire ne lui correspond.

**La lacune « pièce soldée par la plateforme, sans constaté » de P177.01 est fermée** pour ce qui
regarde le bailleur. La reprise naît sans le constaté (point 2.2), et sa date est la sienne. Reste
hors de cet amendement l'autre côté de la même pièce : la plateforme a rendu l'argent après l'avoir
reversé à l'agence (le reste de P76.01, qui suit P39.07).

#### 4. Le versé, au relevé et à l'accueil (P205.03)

Depuis P177.03 (TCK-2041), le relevé et l'accueil lisent le versé par une seule règle. Elle devient :

> **versé d'un mois** = Σ (`net_amount` + reprise imputée) des reversements au bailleur `completed`
> dont `processed_at` tombe dans le mois − Σ des reprises datées du mois.

La reprise est ainsi un **versé négatif daté de son mois**, comme l'a décidé le porteur. Le
reversement qui l'impute compte avant reprise. Sinon, la reprise sortirait deux fois du versé : une
fois à sa date, une fois dans le net diminué. Sur l'ensemble des mois, le versé vaut l'argent parti
moins les reprises qu'aucun reversement n'a imputées. Ce sont celles encore dues, et celles soldées
à la main (point 2.9), que le bailleur a rendues hors reversement.

Au relevé, la reprise est **une ligne** de la période. Elle porte le remboursement `R`, la commission
rendue et le net repris. Elle diminue d'autant le net dû (`totals.net`) et le versé
(`totals.paid_out`). La liste des reversements rend `net_amount`, l'argent parti, et la reprise
imputée à côté, comme une mention et non comme une ligne.

`net_amount` ne change pas de sens. Le rapprochement bancaire, `PayoutApprovalRule` et l'export le
lisent tel quel.

**Exemple** (le scénario mesuré de P177.01). Septembre : loyer de 200 000 et charges de 20 000 à
10 %, reversement de 198 000 versé en septembre. Octobre : le loyer est remboursé de 50 000, d'où
une reprise de 45 000 (50 000 − 5 000). Novembre : un loyer neuf de 200 000 donne un net de 180 000
avant reprise, la reprise de 45 000 est imputée, et 135 000 partent.

| Mois | Net dû du relevé | Versé (relevé et accueil) |
|---|---|---|
| septembre | 198 000, inchangé après le remboursement | 198 000, inchangé |
| octobre | − 45 000 (la reprise) | − 45 000 |
| novembre | 180 000 | 180 000 (135 000 partis + 45 000 imputés) |
| **total** | **333 000** | **333 000** = 198 000 + 135 000 partis |

L'*Encaissé* de l'accueil (ADR-0057 § 2) ne change pas. Il retire toujours le remboursement au mois
du `paid_at` de la pièce. La ligne de reprise explique l'écart entre ce mois et celui du
remboursement.

#### 5. Le geste déclaré (P205.02)

- L'acompte porté par un reversement `completed` rend ce reversement : sa référence et sa date
  (`processed_at`). Ces champs figurent dans `BookingPaymentResource`, dans la tâche
  « remboursement à traiter » et dans le dialogue de remboursement.
- Le dialogue **avertit sans refuser** : l'acompte a déjà été reversé, et le remboursement créera
  une reprise sur le prochain reversement du bailleur.
- L'API ne refuse pas. La reprise et l'avis suivent (point 2).

#### 6. La pénalité de retard réglée est une ligne du reversement (P206.01, rappel de TCK-594)

Le § 3 est complété. La pénalité de retard réglée n'est pas un type de pièce : elle vit sur la ligne
du loyer.

- **Ligne propre du calcul.** La pénalité dont `late_fee_paid_at` tombe dans la période devient une
  ligne du `PayoutCalculator`, quel que soit le statut du loyer, sauf `cancelled`. Son montant vaut
  `late_fee_amount − late_fee_refund_amount` (point 7). Elle entre au brut et porte la commission
  **du bail**, à défaut celle de l'agence, ligne par ligne.
- **Éligibilité propre.** Une colonne nullable, `lease_payments.late_fee_payout_id`, désigne le
  reversement qui l'a prise. Une pénalité réglée après le reversement de son loyer reste donc
  reversable. La création verrouille la ligne comme une pièce (§ 3).
- **Copie figée.** Trois colonnes, à côté de `late_fee_payout_id`, figent ce que le reversement a pris
  de la pénalité : `late_fee_payout_amount`, `late_fee_payout_commission_rate` et
  `late_fee_payout_commission_amount`. Elles sont posées avec lui, à la création. C'est la copie du
  pivot (TCK-2017) pour une ligne qui n'a pas de pivot. Le relevé la relit (point 1), et la reprise
  d'une pénalité y prend sa base et son taux (point 2.3).
- **Détachement.** Un reversement `cancelled` ou `failed` remet les quatre colonnes à nul.
- **Encaisseur.** Une pénalité réglée dans un checkout de la plateforme (la règle de
  `PlatformPayoutService::lateFeeSettledWith`) suit TCK-2064 : elle n'est reversable qu'une fois
  son `PlatformPayout` `paid`. Réglée chez l'agence (`LateFeeSettlement`), elle est reversable
  aussitôt.
- **Lecteurs.** La préparation, la création et le relevé la lisent, puisqu'ils partagent le
  calculateur.

#### 7. Un remboursement s'impute d'abord à la pénalité (P206.04)

- **Ordre.** Un remboursement d'un checkout qui portait la pénalité s'impute d'abord à la pénalité,
  puis au loyer.
- **Plafond.** Il passe de `amount` à `amount` + la pénalité de ce checkout
  (`reportedRefundAmount`, l. 1369-1383).
- **Trace.** La part de pénalité rendue s'écrit dans une colonne neuve,
  `lease_payments.late_fee_refund_amount`, et non dans `refund_amount`, qui reste plafonné au loyer
  (`HasPaymentAttributes.php:108-115`, inchangé). Une colonne et non `metadata` : le calculateur,
  l'*Encaissé* (ADR-0057) et la clôture plateforme l'agrègent en SQL.
- **Clôture plateforme.** `lateFeeSettledWith` et `refundedSinceClosing` en retranchent la part
  rendue.
- **Une pénalité rendue en entier est remise : ni acquittée, ni due.**
  - `late_fee_paid_at` garde sa valeur, et la part rendue se lit dans `late_fee_refund_amount`.
  - `LeasePayment::lateFeeOutstanding` (l. 75-86) reste donc à 0 : ni relance, ni pénalité à
    recouvrer (ADR-0057).
  - Le reversement, l'*Encaissé* et la clôture la comptent pour `late_fee_amount −
    late_fee_refund_amount`, soit 0.
  - `LeasePaymentResource` rend `late_fee_refund_amount`, pour que l'échéancier et la quittance la
    disent remise, et non acquittée.
  - Remettre `late_fee_paid_at` à nul l'aurait rendue **de nouveau due** : c'est écarté.
- **Reprise.** Une pénalité reversée puis remboursée suit le point 2. La part de pénalité et la part
  de loyer d'un même remboursement sont deux montants distincts, repris chacun une fois.
- **Constaté.** Le `Payout` constaté porte toujours le remboursement entier : c'est le débit du
  relevé bancaire.

### Schéma, en ajout seul

| Objet | Colonnes | Pourquoi |
|---|---|---|
| table `payout_clawbacks` | `agency_id`, `landlord_id`, `nullableMorphs('refunded_payment')` (le modèle de l'amendement du 2026-10-23), `part` (`payment` \| `late_fee`, chaîne, ADR-0007), `source_payout_id` (le reversement `completed` porteur), `refund_amount`, `commission_rate`, `commission_amount`, `amount` (le net repris), `currency`, `refunded_at` | la reprise, sa base, son taux, sa date (points 2 et 3) |
| table `payout_clawback_imputations` | `payout_id`, `payout_clawback_id`, `amount` | une reprise se reporte sur plusieurs reversements (point 2.6). Ce qui reste dû vaut `amount` moins les imputations des reversements qui gardent leurs pièces (`PayoutStatus::holdingItems`) |
| `payout_clawbacks` (suite) | `settled_amount`, `settled_at`, `settled_by_id`, `settlement_note`, nullables | le solde à la main (point 2.9) |
| `payouts.clawback_amount` | decimal nullable | la reprise imputée, à côté de `fees_amount` |
| `lease_payments.late_fee_payout_id` | nullable, vers `payouts` | éligibilité de la pénalité (point 6) |
| `lease_payments.late_fee_payout_amount`, `late_fee_payout_commission_rate`, `late_fee_payout_commission_amount` | decimal nullables | la copie de la pénalité reversée (point 6) |
| `lease_payments.late_fee_refund_amount` | decimal nullable | la part de pénalité rendue (point 7) |

Aucune reprise de données : tout est nul ou vide pour l'existant.

### Ce qui change chez les lecteurs de `Payout` et du calculateur

Ce relevé repart du tableau du 2026-10-23 et des appelants de `PayoutCalculator`.

| # | Fichier — lecture | Changement |
|---|---|---|
| 1 | `Services/Payout/PayoutCalculator.php` — `leasePayments`, `compute`, `exceptAwaitingPlatform` | la ligne de pénalité (point 6) ; les reprises imputées au total (`clawback`, net après reprise) ; la règle de TCK-2064 pour la pénalité réglée par la plateforme |
| 2 | `Services/Payout/PayoutPreparationService.php` | montre les reprises en cours, leur imputation et le reliquat, et les lignes de pénalité |
| 3 | `Services/Model/PayoutService.php` — `createLocked` (l. 406-497) | verrouille et impute les reprises ; `net_negative` sur le net avant reprise ; pose `late_fee_payout_id` et sa copie |
| 4 | `Services/Model/PayoutService.php` — `detachItems` (l. 906-911) | détache aussi les imputations, `late_fee_payout_id` et sa copie |
| 5 | `Services/Model/PayoutService.php` — `assertItemsStillPaid`, `refundedSincePreparation` (l. 607-633) | lisent aussi la part de pénalité rendue depuis la préparation |
| 6 | `Services/Payout/OwnerStatementService.php` — `statement`, `payoutsCarrying`, `payoutsPaidIn`, `retainedRates` | la copie (point 1), la ligne de reprise et le versé (point 4), la ligne de pénalité |
| 7 | `Services/Dashboard/PortfolioMetrics.php` — `netPaidOutByMonth` (l. 290-303) | la règle du point 4. Ses lecteurs suivent : `DashboardOwnerService` (l. 63, 139), `DashboardAgencyService` (l. 81) |
| 8 | `Http/Resources/PayoutResource.php` | rend `clawback_amount` et les reprises imputées |
| 9 | `Services/Export/ExportDataService.php` — `payouts` | colonne `clawback_amount` |
| 10 | `Services/Model/BookingPaymentService.php` — `refund` (l. 133-185) ; `BookingPaymentResource` ; `BookingRefundTaskService` | la reprise et l'avis ; le reversement porteur rendu (point 5) |
| 11 | `Services/Payments/PaymentGatewayService.php` — `applyRefund`, `reportedRefundAmount`, `applyPendingRefund` | l'imputation pénalité d'abord et le plafond (point 7) ; la reprise et l'avis (point 2) |
| 12 | `Services/Billing/PlatformPayoutService.php` — `lateFeeSettledWith` (l. 499-508), `refundedSinceClosing` (l. 195-205) | la part de pénalité rendue est retranchée |
| 13 | `Services/Model/PayoutService.php` — `approve`, `markProcessed` (l. 319) ; `Http/Requests/Api/MarkProcessedPayoutRequest.php` | le reversement à `net_amount = 0` : ni destination, ni moyen, ni référence, ni décaissement (point 2.6). Au tableau du 2026-10-23, `MarkProcessedPayoutRequest` (n° 21) était inchangé : il change ici |
| 14 | un service et une route neufs des reprises | la liste des reprises en cours de l'agence, et le solde à la main (point 2.9) |
| 15 | `Http/Resources/LeasePaymentResource.php` | rend `late_fee_refund_amount` : la pénalité remise (point 7) |

**Inchangés**, parce que la reprise n'est pas un `Payout` et que `net_amount` reste l'argent parti :
`PayoutApprovalRule`, `ReconciliationMatcher`, `PaymentSearchService`, `ReconciliationManager`,
`BankStatementLineController` et sa ressource, `AdminGlobalSearchService`, `RemindDuePayouts`, la
garde de `completed` du modèle, `PayoutPolicy`. `ObservedRefundPayout` ne change pas : le constaté
naît comme avant, et reste hors du relevé.

### Points tranchés le 2026-10-24

Le premier jet de cet amendement laissait cinq points ouverts. Le porteur les a tranchés le jour
même, selon les recommandations, et ils sont écrits plus haut :

- la pénalité reversée est figée par trois colonnes de copie à côté de `late_fee_payout_id`
  (point 6) ;
- un reversement dont la reprise absorbe tout le net naît à `net_amount = 0` et passe par les
  gestes du § 4, sans décaissement (point 2.6) ;
- une reprise qu'aucun reversement n'impute reste due par le bailleur, est montrée à l'agence, et
  l'agence la solde à la main (point 2.9) ;
- une pénalité rendue en entier est remise, ni acquittée ni due (point 7) ;
- le bailleur reçoit lui aussi un avis à chaque reprise, par un code neuf (point 2.8).

Le porteur a aussi confirmé trois choix du premier jet :

- la reprise est la seule ligne négative d'un remboursement (point 3) ;
- pas de reprise pour un pivot sans copie (point 2) ;
- `net_negative` ne juge que le net avant reprise (point 2.6).

### Application

- Une migration en ajout seul (le schéma ci-dessus), le modèle `PayoutClawback` et ses relations,
  et les quinze lecteurs du tableau.
- **Gardes**, chacune vérifiée par ablation :
  - le scénario de P177.01. Le relevé de septembre garde `gross 220000, net 198000, paid_out
    198000` après le remboursement. Celui d'octobre porte une seule ligne de − 45 000, et rien du
    constaté. Celui de novembre porte `paid_out` 180 000 pour 135 000 partis ;
  - le même scénario, deux pièces remboursées en entier : le reversement de 198 000 figure toujours
    au relevé de septembre ;
  - le scénario de P205.01 : le reversement suivant porte la reprise. Une reprise plus grande que
    le net y est imputée à hauteur du net, et le reliquat passe au suivant ;
  - la même pièce soldée par la plateforme et remboursée par webhook : une reprise, aucun constaté ;
  - un remboursement concurrent de `markProcessed` donne une reprise ou un refus
    `payout.items_changed`, jamais les deux, jamais aucun ;
  - un reversement annulé rend sa reprise ;
  - `netPaidOutByMonth` rend la reprise au mois du remboursement, et le reversement qui l'impute
    avant reprise ;
  - le cas de P206.01. La préparation, la création et le relevé portent 157 500 de brut. Une
    pénalité réglée le mois suivant le reversement de son loyer est reversée au reversement suivant ;
  - le cas de P206.04. Un remboursement total de 157 500 donne `refund_amount 150000` et
    `late_fee_refund_amount 7500`, et la clôture plateforme ne compte plus la pénalité. Un
    remboursement partiel de 7 500 laisse le loyer `paid` et entier ;
  - un acompte reversé rend la référence et la date de son reversement. Son remboursement déclaré
    passe, avec un avis à l'agence et un avis au bailleur ;
  - une reprise qui absorbe tout le net : le reversement naît à `net_amount = 0`, se marque payé
    sans moyen ni référence, et n'appelle pas le pilote de décaissement ;
  - une reprise sans reversement suivant reste due, et se solde à la main. Le geste est refusé tant
    qu'un reversement pas encore `completed` porte une imputation. Une fois soldée, elle n'est plus
    imputée ;
  - une pénalité reversée garde sa copie quand le taux du bail change, au relevé comme dans sa
    reprise ;
  - une pénalité rendue en entier n'est ni relancée, ni comptée à recouvrer, ni reversée.

## Amendement du 2026-10-25 — la facture d'une intervention contestée ou annulée

Décision du porteur du 2026-10-25, sur les pistes P224.01 à P224.04 (angle 224 du fichier de pistes,
`docs/plans/2026-10-15-pistes-d-amelioration.md`). Elle complète le § 8 : elle dit qui pose
`cancelled` sur une facture de prestataire, et ce que devient une facture validée, payée ou imputée
quand le travail qu'elle paie n'est plus rendu. Relu sur `pre-dev` b4d905cd3. Ticket :
[TCK-2270](../backlog/tickets/TCK-2270-facture-d-intervention-contestee-ou-annulee.md).

### Constat

- La facture naît au passage à `completed` (`MaintenanceRequestObserver`), et la table d'états permet
  ensuite `completed → in_progress` (la contestation du demandeur) puis `in_progress → cancelled`.
  Aucun chemin ne touchait la facture : `ServiceProviderBillStatus::Cancelled` n'avait aucun
  écrivain (réservé par TCK-1307).
- `validate` ne jugeait que `pending_validation`, `createForBill` que `validated`, et
  `PayoutCalculator::rechargeableBills` que le statut de la facture et son imputation. Aucun ne
  lisait l'état de l'intervention. **Mesuré** (P224.01) : intervention contestée puis annulée,
  facture de 50 000 toujours `pending_validation`, `validate` → 200, `pay` → 201, refacturable au
  bailleur.
- L'index partiel `sp_bills_one_open_per_request` et l'`insertOrIgnore` de l'observateur ignoraient
  la seconde fin des travaux : une réassignation après contestation ne facturait jamais le second
  prestataire (P224.02), et une seconde fin à un autre coût réel laissait l'ancien montant
  (P224.03).

### Décision

**Une facture de prestataire ne se valide, ne se paie et ne s'impute que pour un travail rendu :
une intervention `completed` ou `closed`. Quand l'intervention quitte cet état (contestation) ou
est annulée, sa facture ouverte est annulée si aucun geste d'argent ne la tient, et gardée, avec un
avis à l'agence, sinon.**

1. **Le déclencheur** : l'intervention quitte `completed`/`closed`, ou entre en `cancelled`. Le geste
   vit dans l'observateur qui fait naître la facture (`MaintenanceRequestObserver`, après le commit),
   par `App\Services\Maintenance\ReopenedRequestBills`, sous le verrou de la demande puis de ses
   factures ouvertes. Une demande revenue au travail rendu entre-temps n'est pas touchée.
2. **Passe à `cancelled`** : une facture `pending_validation` ; une facture `validated` sans
   reversement vivant au prestataire (`PayoutStatus::holdingItems()`) et non imputée
   (`imputed_payout_id` nul). La fin des travaux suivante en fait naître une neuve, au coût réel et
   au prestataire du moment : c'est ce qui ferme P224.02 et P224.03 sans code propre.
3. **Reste** : une facture `paid`, une facture imputée à un reversement au bailleur, et une facture
   `validated` dont un reversement au prestataire est vivant. Elle n'est pas défaite : un geste
   d'argent ne se défait pas en silence. Les membres actifs de l'agence qui détiennent
   `payouts.create` reçoivent l'avis `service_provider_bill.kept_on_reopen` (référence, montant,
   intervention ; cible `/app/payments?tab=bills`), non désactivable comme les autres avis de sortie
   d'argent, à la contestation et de nouveau à l'annulation. La reprise passe par la main de
   l'agence.
4. **La garde**, qui relit l'état de l'intervention, ferme la fenêtre entre le commit de la
   contestation et l'observateur :
   - `POST …/validate` → 422 `service_provider_bill.request_not_completed` ;
   - `POST …/pay` (`createForBill`, sous le verrou de la facture) → même refus ;
   - `rechargeableBills` ne propose pas la facture, et `POST /api/payouts` la refuse comme une pièce
     inéligible (`service_provider_bill_ids`), avant le verrou puis sous lui. Cela vaut aussi pour
     une facture payée restée : elle ne se refacture au bailleur qu'une fois le travail de nouveau
     rendu.
   - Le rejet n'est pas gardé : rejeter ferme une facture, quel que soit l'état de l'intervention.

### Ce qui n'est pas gardé

- **La reprise d'une facture payée ou imputée** n'a aucun geste : l'avis la signale, l'agence la
  traite à la main (reversement annulé, reprise, ou nouvelle facture convenue avec le prestataire).
  Tant qu'elle reste ouverte, l'index partiel empêche la naissance d'une facture neuve pour la même
  intervention.
- **Une facture `validated` dont le reversement vivant est ensuite annulé** reste `validated` sur
  une intervention qui n'est plus rendue : la garde refuse de la payer, rien ne l'annule.
- **La relecture sous verrou dans `createLocked`** n'a pas de test propre : la course qu'elle ferme
  (une annulation entre `assertItemsInScope` et le verrou) n'est pas reproduite ; l'ablation de la
  garde d'imputation la retire avec le contrôle d'avant le verrou.
- L'écran des factures (P224.04) ne change pas : une facture `pending_validation` n'existe plus que
  pour une intervention `completed` ou `closed`.

### Application

- `ServiceProviderBill::BILLABLE_REQUEST_STATUSES`, `requestIsBillable()`,
  `scopeWhereRequestBillable()` ; `ReopenedRequestBills` ; les gardes de
  `ServiceProviderBillController::validateBill`, `PayoutService::createForBill`,
  `assertItemsInScope`, `createLocked` et `PayoutCalculator::rechargeableBills`.
- `ServiceProviderBillStatus::Cancelled` n'est plus réservé (`CasDEnumReservesTest`).
- La fabrique `ServiceProviderBillFactory` fait naître sa demande `completed`.
- **Gardes**, chacune vérifiée par ablation (`tests/Feature/Maintenance/FactureDInterventionRouverteTest.php`) :
  - contestation puis annulation : facture `cancelled`, `validate` et `pay` en 422, absente de
    `rechargeableBills` ;
  - facture validée sans reversement ni imputation : `cancelled` ;
  - facture payée : reste, avis aux détenteurs de `payouts.create` (ni au prestataire ni au
    bailleur), un second à l'annulation, et pas refacturable ;
  - facture imputée, facture en cours de paiement : restent, avec l'avis ;
  - la garde seule, intervention repartie `in_progress` hors d'Eloquent : `validate`, `pay`,
    `rechargeableBills` et `POST /api/payouts` refusent ; revenue `completed` ou `closed`, ils
    acceptent ;
  - P224.02 : contestation, réassignation, fin des travaux de B → une facture ouverte, celle de B,
    et celle de A `cancelled` ;
  - P224.03 : seconde fin à 80 000 → facture ouverte de 80 000, `exceeds_quote`, la première
    `cancelled`.

## Amendement du 2026-10-25 (bis) — la restitution de caution bornée à la caution encaissée

Décision du porteur du 2026-10-25, sur la piste P04.10 (angle 4 du fichier de pistes,
`docs/plans/2026-10-15-pistes-d-amelioration.md`). Elle précise le § 4, qui définit le restituable
(`deposit_remaining`). Relu sur `pre-dev` f10a94ff3. Ticket :
[TCK-2340](../backlog/tickets/TCK-2340-restitution-de-caution-bornee-a-l-encaisse.md).

### Constat

- Le restituable valait `deposit_amount − deposit_refunded_amount −` la retenue vivante : il partait
  du montant écrit au bail, et aucune ligne ne lisait une échéance `deposit` payée
  (`DepositRefundService::refund`, `Lease::getDepositRemainingAttribute`). **Mesuré** : bail terminé,
  caution de 600 000 au bail, aucune échéance payée → restitution de 600 000 acceptée ; caution
  encaissée à 300 000 → restitution partielle de 200 000 avec une retenue facturée de 400 000.
- Les rapports définissaient déjà la caution détenue autrement : `Σ deposit payés − Σ deposit_refund
  payés` (`PortfolioMetrics::depositsHeld`, `AgingBalanceService::depositsHeld`). La restitution était
  la seule à suivre une autre règle.

### Décision

**La restitution d'une caution est bornée à la caution réellement encaissée : Σ des échéances
`deposit` payées − déjà rendu − retenue vivante, la définition qu'emploient déjà les rapports.**

1. **L'encaissé** est `Lease::collectedDeposit()` : la somme des échéances `deposit` payées du bail,
   lue par le scope `LeasePayment::paidDepositMovements()` (lignes `deposit` et `deposit_refund`
   payées), que les deux rapports lisent aussi. La définition vit en un endroit.
2. **Le restituable** devient `min(deposit_amount, encaissé) − deposit_refunded_amount −` la retenue
   vivante, borné à 0. « Déjà rendu » reste `deposit_refunded_amount` : il compte une restitution en
   cours et la retire quand elle est refusée ou échoue (`PayoutService::releaseDeposit`) ; le compter
   par les seules lignes `deposit_refund` payées laisserait rendre deux fois une caution dont le
   premier reversement attend son approbation. Le montant du bail reste un plafond : une échéance
   payée au-delà ne se rend pas au-delà.
3. **La retenue** d'une restitution partielle suit : elle vaut le restituable moins le rendu, donc
   jamais plus que ce qui est entré.
4. **Rien d'encaissé** : `refund` refuse avec `deposit_refund.not_collected` (422), et non plus
   `already_refunded`. L'écran suit `deposit_remaining`, comme avant : le bouton disparaît.
5. **Une caution reçue hors plateforme** entre dans l'encaissé par le `mark-paid` de son échéance
   (TCK-681) ; l'échéance naît de l'échéancier, jamais à la main (TCK-1920).

### Ce qui n'est pas gardé

- **Une restitution déjà faite au-delà de la borne n'est ni réécrite ni annulée** : sa ligne
  `deposit_refund`, son reversement et `deposit_refunded_amount` restent tels quels, le restituable
  vaut 0 et une nouvelle restitution est refusée. Aucune migration ne relit l'existant.
- **Un bail sans échéance de caution** (bail importé, caution remise avant l'échéancier) ne se
  restitue plus par la plateforme tant que son échéance n'est pas posée et réglée. Aucune dérogation
  « caution remise hors plateforme » n'est ouverte.
- Le titre du bandeau de l'écran ne distingue pas « non encaissée » de « à rembourser ».

### Application

- `LeasePayment::scopePaidDepositMovements()` ; `Lease::collectedDeposit()` ;
  `Lease::getDepositRemainingAttribute()` ; le refus de `DepositRefundService::refund` ; le code
  `deposit_refund.not_collected` (`lang/{fr,en,wo}/errors.php`, `wo` = `fr`).
- La fabrique `LeaseFactory::withCollectedDeposit()` pose l'échéance payée des tests qui restituent.
- **Gardes**, vérifiées par ablation (`tests/Feature/Lease/DepositRefundBoundedToCollectedTest.php`) :
  rien d'encaissé → refus et rien de créé ; encaissé en partie → restitution et retenue bornées ;
  seules les échéances `deposit` payées du bail comptent ; le montant du bail plafonne l'encaissé ;
  une restitution passée au-delà de la borne reste intacte.
