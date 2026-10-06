---
id: TCK-602
title: "Aucun payeur ne voit « Payer en ligne », un locataire sans compte ne peut pas payer et un webhook rejeté ne laisse aucune trace : passerelle réparée, lien de paiement par échéance, pilote Free Money et journal des webhooks rejouable"
status: todo
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: [TCK-293, TCK-593]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#110-documents--contrats
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#29-documentsharelink-
    - docs/models-spec.md#31-integration-
    - docs/models-spec.md#63-integrationwebhooklog-
tags: [back, front, paiement, webhook, integration, free-money, public, console, documents, securite, donnees-personnelles, adr-requise]
---

## Objectif utilisateur

- **Locataire et client** : le bouton « Payer en ligne » apparaît dès que l'agence a activé un
  fournisseur — Wave, Orange Money ou Free Money — et le paiement aboutit.
- **Bailleur** : son locataire, même sans compte Takussan, paie le loyer depuis un lien reçu par
  message, et reçoit sa quittance — sans que personne ne saisisse le paiement à la main.
- **Admin d'agence** : une intégration de paiement qu'il enregistre fonctionne, ou est refusée
  avec le champ manquant ; jamais acceptée puis cassée.
- **Super-admin** : chaque webhook entrant (paiement, SMS, WhatsApp) est visible, accepté ou non,
  avec la raison d'un échec ; il rejoue sans risque un traitement échoué et voit d'un coup d'œil
  les paiements en échec, en retard et les webhooks qui n'ont trouvé aucun paiement.

## Contexte

Issu de l'analyse par acteur du 2026-10-06 (vague 73) : points O6 (rapport propriétaire) et S8
(rapport super-admin), complétés par la passe de correction du même jour. Chaque constat est
re-mesuré sur `e3ab4a4e`.

### 1. Le paiement en ligne est inaccessible aux payeurs (O6)

- **Aucun payeur ne voit le bouton, même avec un compte.** `usePaymentProviders.ts:25-35` lit
  `GET /api/integrations`, qui rend **403** à quiconque n'est ni super-admin ni admin d'agence
  (`IntegrationController.php:21-23`). La liste reste vide, et `PayOnlineButton.tsx:36-38` ne rend
  alors rien. C'est le cas de l'échéancier du bail (`LeaseSchedule.tsx:45`), du détail d'une
  réservation (`BookingDetail.tsx:102`) et de la facture (`InvoiceDetailDialog.tsx:59`). Seul
  l'admin d'agence, qui ne paie rien, voit « Payer en ligne ».
- De plus, le même appel filtre `agency_id` exact (`usePaymentProviders.ts:32`). Il ignore donc le
  repli sur l'intégration globale que `resolveIntegration` applique (`PaymentGatewayService.php:38-51`).
- **Sans compte, il n'y a aucun chemin** : `routes/api/payments.php:8-27` place `initiate` et
  `verify` sous `auth:sanctum`, et `PaymentGatewayController.php:32-33` exige un utilisateur puis
  `authorize('update', $payment)`. Or le locataire saisi par l'agence n'a souvent pas de compte
  (`customers.user_id` nullable, `2026_04_17_160006_create_customers_table.php:13`). Le retour du
  fournisseur atterrit sur `/app/payments/return` (`PaymentProviderPicker.tsx:102-104`), sous
  `(dashboard)/layout.tsx`, qui exige une session (`getMeAction()`).
- **Un paiement passé à `paid` par la passerelle ne prévient personne.**
  `PaymentGatewayService::applyStatusToPayment` (l.246-294) écrit le statut et sauve, que l'appel
  vienne du webhook (l.152) ou du relevé forcé `verify()` (l.131). Les seules notifications de
  paiement sont dans le chemin manuel `LeasePaymentService::markPaid` (l.52-76). Aucun observateur
  de `LeasePayment` ne notifie (`AppServiceProvider.php:384,390`).
- La quittance (`routes/api/leases.php:60-61`) est sous `auth:sanctum`, et
  `DocumentPdfController::receipt:28-45` ne vérifie pas que l'échéance est payée. **TCK-593 porte ce
  second défaut** (Delta `DocumentPdfController::receipt` + AC2 de 593).
- **Les pilotes renvoient au client le corps de réponse du fournisseur.**
  `abort(502, 'Wave checkout failed: '.$response->body())` (`WaveDriver.php:55`, et l.81 pour
  `verify`), de même pour Orange Money (`OrangeMoneyDriver.php:58,86`). Le gestionnaire
  d'exceptions renvoie le message tel quel (`bootstrap/app.php:80-84`). Sur une route publique,
  c'est un anonyme qui le lirait.

### 2. Free Money est déclaré, jamais branché

- `PaymentMethod.php:12` déclare `free_money`, mais `PaymentProvider.php:7-9` ne connaît que `wave`,
  `orange_money` et `lemon_squeezy`. `PaymentGatewayService::driverFor` (l.55-60) n'a aucun bras
  Free Money (`default => abort(422)`), et `IntegrationProviderRegistry.php:12-18` n'enregistre
  aucun `FreeMoneyProvider`. Un webhook `POST /api/webhooks/payments/free_money` rend 404
  (`PaymentWebhookController.php:33-34`).
- **Aucun écran ne propose aujourd'hui Free Money comme paiement en ligne** :
  `PaymentProviderPicker.tsx:31-35`, `usePaymentProviders.ts:15` et `useInitiatePayment.ts:19` ne
  listent que Wave, Orange Money et Lemon Squeezy. Free Money n'apparaît que comme mode de
  versement **déclaré** (`CreatePayoutDialog.tsx:260` via `constants.ts:104`), qui enregistre un
  versement fait hors plateforme et aboutit donc. Il n'y a rien à masquer aujourd'hui, mais la
  règle de masquage devient une contrainte dès que le pilote existe.
- La documentation marchande du fournisseur est absente du dépôt :
  `grep -rniE "free_?money" docs` ne trouve que `features.md:214`.

### 3. Une intégration de paiement enregistrée ne fonctionne pas

- **Orange Money** : le pilote lit `access_token` (`OrangeMoneyDriver.php:33,75`), alors que le
  schéma du fournisseur demande `merchant_key`, `api_key` et `webhook_secret`
  (`OrangeMoneyProvider.php:22-28`) et que `IntegrationService::update` ne valide que ce schéma
  (`IntegrationService.php:57-66`). Une intégration Orange Money configurée par l'écran rend donc **500** à
  chaque initiation (`OrangeMoneyDriver.php:133`). Les tests passent parce qu'ils écrivent
  `access_token` directement en base (`PaymentGatewayInitiateTest.php:82`).
- **Côté agence**, le formulaire écrit `api_key`, `api_secret` et `webhook_url`
  (`lib/schemas/setting.ts:217-222`), jamais `webhook_secret` ni `merchant_key`.
  `StoreIntegrationRequest.php:31-34` n'exige aucune clé par fournisseur, et `provider` est une
  chaîne libre. Une intégration Wave d'agence est donc **acceptée**, puis chaque webhook résolu
  sur elle rend 500 (`WaveDriver.php:147`). Comme `handleWebhook` préfère aujourd'hui les
  intégrations d'agence (`PaymentGatewayService.php:145`), une seule intégration d'agence de ce
  type casse les webhooks Wave de toute la plateforme, jusqu'à TCK-293.

### 4. Un webhook n'est journalisé qu'après un succès (S8)

- `PaymentWebhookController.php:36-37` : `recordWebhook(…, 'processed', …)` vient **après**
  `handleWebhook`. Une signature invalide (`WaveDriver.php:97`), un identifiant manquant (l.103),
  un fournisseur inconnu (contrôleur l.34) ou un sous-paiement (`PaymentGatewayService.php:334-338`)
  sortent avant cet appel et ne laissent aucune trace.
- Un webhook dont le `transaction_id` n'apparie aucun payable (`paymentsForEvent:369-398` rend
  `[]`) est journalisé `processed` : on ne peut pas le distinguer d'un succès.
- `IntegrationService::recordWebhook:141-144` rattache **toujours** le webhook à l'intégration
  globale (`whereNull('agency_id')`). La piste d'une intégration d'agence
  (`GET /api/admin/integrations/{id}/webhooks`, `routes/api/admin.php:180`) est donc vide par
  construction.
- Le corps est tronqué à 4000 caractères (`IntegrationService.php:153`), stocké sans expurgation
  et en clair (`IntegrationWebhookLog.php:21`, cast `array`). Or `models-spec` §63 promet un
  « payload brut conservé pour rejeu ». TCK-343 l'a établi : les quatre HMAC du dépôt se calculent
  sur le corps brut, donc rejouer depuis la base est aujourd'hui impossible par construction.
- La purge à 30 jours s'exécute **à la lecture** (`IntegrationService.php:127`) **et sur le chemin
  du webhook** (l.140). `routes/console.php` ne planifie aucune purge. Le test
  `IntegrationAdminTest::test_webhook_trail_prunes_entries_older_than_30_days` (l.97) fige ce
  comportement.
- Les webhooks SMS (`app/Http/Controllers/Webhook/{Orange,Mtarget,LAfricaMobile}SmsStatusController`)
  et WhatsApp (`WhatsappStatusController`) ne journalisent rien. Leurs rejets se produisent en
  partie dans le middleware `restrict.ip` (`routes/api/sms-webhooks.php:20-30`), avant le
  contrôleur. Orange répond par un 404 silencieux quand aucun envoi ne correspond
  (`OrangeSmsStatusController.php:86-89`). TCK-217 avait choisi de ne pas les journaliser, parce
  que les tables de livraison suffisaient. Elles ne gardent pourtant que les accusés **appariés**,
  si bien qu'un rejet ou un non-apparié n'y laisse rien. Ce ticket revient sur ce choix.
- **Lemon Squeezy** : la route du paquet (`LemonSqueezyServiceProvider.php:37-41`) n'a ni
  journal ni limite de débit, et la signature y est refusée par le middleware du contrôleur du
  paquet (`VerifyWebhookSignature.php:21-23`, 403). Le paquet permet pourtant de reprendre la
  route à son compte (`LemonSqueezy::ignoreRoutes()`, `LemonSqueezy.php:103`). Le rejet est donc
  journalisable.
- La console n'a aucune surface de paiements : aucune route `payment` dans `routes/api/admin.php`,
  aucune entrée dans `SuperAdminSidebar.tsx:90-150`. Les statuts `failed` et `late` existent
  pourtant (`PaymentStatus.php:9,11`). **Après TCK-593** (point 6 de ses contraintes), une
  échéance n'est plus jamais `failed` : elle garde son statut ouvert, et l'échec se lit dans
  `metadata.gateway.last_failed_at`. Seuls `BookingPayment` et `Invoice` écrivent encore `failed`.
  Or `recordInitiation` réécrit tout le bloc `metadata.gateway` à chaque initiation
  (`PaymentGatewayService.php:347-354`) : une nouvelle tentative après un échec effacerait la trace,
  et la console ne compterait pas l'échec.

### 5. Les liens de partage de documents (D-52)

Le partage réparé en D-52 sert de modèle au lien de paiement, mais il porte trois défauts :
- le jeton est un UUID (`DocumentShareLinkService.php:18`) stocké **en clair**
  (`create_document_share_links_table.php:14`) : une lecture de la table ouvre tous les documents
  partagés ;
- les routes publiques n'ont **aucune limite de débit** (`routes/api/documents.php:28-29`) ;
- un mauvais mot de passe rend 401 sans aucun compteur (`DocumentShareLinkService.php:38-43`) :
  le mot de passe d'un lien se devine sans limite.

Le principe opaque, expirant (l.19), révocable (l.55-58) et 410 (l.30-31) est bon : le lien de
paiement le reprend, et les deux reçoivent le même stockage haché.

### 6. Pourquoi TCK-293 d'abord

`PaymentGatewayService::handleWebhook:142-146` résout encore l'intégration sans scope d'agence
(D-50 : le secret d'une agence valide les paiements des autres). Ouvrir un chemin d'initiation
**sans authentification** multiplie les paiements que ce webhook peut solder à tort. Le journal a
aussi besoin de connaître l'intégration qui a validé la signature, et c'est TCK-293 qui la fixe.

## Contrat de données

**Nouveau modèle `LeasePaymentLink`** (table `lease_payment_links`) : `lease_payment_id` (FK,
`cascadeOnDelete`), `token_hash` (`char(64)`, unique, SHA-256 du jeton), `token` (`text`, cast
`encrypted`, pour renvoyer le même lien à chaque relance), `expires_at`, `revoked_at`,
`last_accessed_at`, `access_count`, `created_by_id` (FK users, nullable : `null` = émis par le
système), timestamps. Un seul lien actif par échéance : un index unique partiel sur
`lease_payment_id` `WHERE revoked_at IS NULL`, nommé explicitement.

**`document_share_links` modifié** (§29) : `token_hash` (`char(64)`, unique, index nommé) ; `token`
passe en `text` avec cast `encrypted`, et perd son index unique. La migration hache et chiffre
les jetons existants : un lien déjà envoyé reste valide.

**`integration_webhook_logs` étendu** (§63) : `channel` (`payment|sms|whatsapp`), `agency_id`
(FK nullable, `nullOnDelete`, indexée), `body` (`text`, cast `encrypted`, octets exacts), `body_sha256`,
`body_truncated` (bool), `headers` (`text`, cast `encrypted:array`, liste blanche par canal),
`authenticated_at` (posé quand jeton, IP et signature ont passé), `http_status`, `error_code`,
`error_message`, `external_id` (transaction ou identifiant de message, indexé), `matched_count`,
`attempts`, `replayed_at`, `replayed_by_id`. `payload` (jsonb) devient la **vue expurgée**. Index
`(status, created_at)`, `(channel, provider, created_at)` et `(agency_id, created_at)`, tous nommés
explicitement.

**`PaymentProvider::FreeMoney = 'free_money'`**, en XOF, dont `paymentMethod()` rend
`PaymentMethod::FreeMoney`. Pas de migration : `integrations.provider` est une chaîne.

**Endpoints publics** (nouveau fichier `routes/api/pay.php`, sans `auth`) :

| Route | Rôle | Débit |
|---|---|---|
| `GET /api/pay/{token}` | `amount_due`, `late_fee_outstanding`, `late_fee_payable_online` (mêmes valeurs que `LeasePaymentResource` de TCK-593), devise, période, échéance, statut, titre et quartier du bien, nom de l'agence, fournisseurs disponibles | `throttle:30,1` |
| `POST /api/pay/{token}/initiate` | `{provider}` → `checkout_url` | `throttle:10,1` |
| `POST /api/pay/{token}/verify` | relève le statut chez le fournisseur | `throttle:6,1` |
| `GET /api/pay/{token}/receipt` | quittance PDF, **uniquement** si `paid` | `throttle:10,1` |

`GET /api/share/{token}` passe à `throttle:30,1` et `GET /api/share/{token}/download` à
`throttle:10,1`.

**Endpoints authentifiés** :
- `GET /api/{paymentType}/{paymentId}/providers` (même contrainte de chemin que `initiate`) : la
  liste des fournisseurs que l'initiation acceptera pour ce payable.
- `POST /api/lease-payments/{payment}/payment-link` : renvoie l'URL du lien actif, ou en émet un.
  `regenerate=true` révoque le lien actif et en émet un nouveau.
- `DELETE /api/lease-payments/{payment}/payment-link` : révoque le lien.
- Super-admin, sous `auth:sanctum` + `super-admin` :
  - `GET /api/admin/webhook-logs` avec `filter[channel|provider|status|agency_id|unmatched]`,
    `sort` et `fields` ;
  - `GET /api/admin/webhook-logs/{log}` (vue expurgée, jamais `body` ni `headers`) ;
  - `POST /api/admin/webhook-logs/{log}/replay` ;
  - `GET /api/admin/payments`, qui couvre `lease_payments` et `booking_payments` avec
    `filter[status]=failed|late`, `filter[provider]`, `filter[agency_id]` et une période ;
  - `GET /api/admin/payments/summary`, qui compte par fournisseur les paiements en échec, en retard
    et les webhooks non appariés sur 7 et 30 jours.
  - **Ce que « en échec » veut dire** (les deux routes, une seule définition dans
    `PaymentSupervisionService`) : pour `lease_payments`, `metadata.gateway.last_failed_at` posé
    **dans la période**, quel que soit le statut courant
    (`(metadata->'gateway'->>'last_failed_at')::timestamptz`), et **jamais** `status = failed`, qui
    n'existe plus après TCK-593 ; le fournisseur est `metadata.gateway.provider`. Pour
    `booking_payments`, `status = failed`, inchangé. La ligne de la liste montre le statut courant.
    Les lignes rouvertes par la migration de 593 (`metadata.reopened_from_failed_at`, sans
    `last_failed_at`) ne comptent pas.

## Direction UX / Artistique

- **Payer en ligne, avec un compte** : l'action apparaît sur l'échéance, la réservation ou la
  facture dès que le serveur annonce au moins un fournisseur pour ce payable. Elle ne propose que
  ceux-là. Elle ne renvoie jamais vers « contactez l'administrateur » quand le serveur en accepte un.
- **Page publique de paiement** : on doit pouvoir la lire sur un téléphone d'entrée de gamme, en
  3G, souvent ouverte depuis WhatsApp. Elle donne d'abord le montant, puis le bien, la période et
  l'agence, puis un gros bouton par fournisseur disponible. Le montant est celui que le
  fournisseur demandera ; une pénalité que l'agence n'encaisse pas en ligne se lit à part,
  « à régler auprès de l'agence », sans jamais gonfler le bouton. Elle ne propose aucun fournisseur que
  l'agence n'a pas activé, et ne demande aucune connexion. Après le retour du fournisseur, elle
  dit clairement si le paiement est payé, en attente ou en échec, et propose la quittance une fois
  le paiement payé. Un lien expiré ou révoqué affiche une page calme qui dit à qui s'adresser (le
  nom de l'agence), pas une erreur technique. La page existe en fr, en et wo, et suit la palette
  Lin et les guidelines (`docs/design-guidelines.md`).
- **Free Money** apparaît comme Wave et Orange Money, avec son nom, et seulement quand il est
  disponible pour ce payable.
- **Intégrations de l'agence** : pour un fournisseur de paiement, le formulaire demande exactement
  les champs que ce fournisseur exige, et signale le champ manquant.
- **Côté agence** : sur la ligne d'une échéance non payée, une action permet de copier ou de
  partager le lien de paiement, et de le révoquer.
- **Console « Paiements »** : une nouvelle entrée du groupe finances de la barre latérale
  super-admin. Elle s'ouvre sur trois compteurs par fournisseur (en échec, en retard, non
  appariés), puis le journal filtrable. Le détail d'un webhook montre le statut, l'erreur et la
  charge **expurgée**. Le bouton « Rejouer » n'apparaît que sur une ligne rejouable et demande
  une confirmation.

## Contraintes strictes (métier)

**Fournisseurs proposés**
- **Une seule règle**, `PaymentGatewayService::availableProviders(Model $payment): list<PaymentProvider>` :
  un fournisseur y figure si `resolveIntegration` rend une intégration active pour l'agence du
  payable (repli global compris), si `driverFor` sait la servir, et si
  `supportsCurrency($currency)` l'accepte. L'écran authentifié, la page publique et les deux
  `initiate` lisent cette méthode. Un `provider` hors de la liste rend 422 sur les deux `initiate`.
- Le front ne lit plus jamais `GET /api/integrations` pour savoir quoi proposer à un payeur.

**Pilotes et intégrations**
- **Un pilote ne renvoie jamais le corps de réponse du fournisseur au client.** Il le journalise
  (sans en-tête d'authentification) et lève une erreur 502 dont le message est la clé
  `__('payments.gateway.provider_unavailable')`. Un identifiant manquant donne
  `__('payments.gateway.misconfigured')`, sans le nom de la clé. Ces `abort` réécrits sont à 602
  (règle commune n°1 : la version du ticket de domaine gagne sur 588).
- **Le schéma du fournisseur est la seule liste des clés.** Chaque pilote déclare les clés qu'il
  lit (`public const CREDENTIAL_KEYS`), et chacune est un champ `required` du schéma de son
  `IntegrationProvider`. `OrangeMoneyProvider::schema` est aligné sur ce que le pilote lit. Si la
  documentation d'Orange impose un jeton OAuth obtenu par `client_id`/`client_secret` plutôt
  qu'un `access_token` stocké, le pilote l'obtient et le met en cache. La documentation tranche,
  et le test de cohérence garde le résultat.
- `StoreIntegrationRequest` et `UpdateIntegrationRequest` (agence) : `provider` ∈ clés de
  `IntegrationProviderRegistry`. Pour la catégorie `payments`, `credentials` est validé par
  `IntegrationProvider::validate()`, avec des erreurs sous `credentials.<clé>`. La fusion avec
  les secrets existants en édition suit `IntegrationService::update`.

**Free Money**
- Le pilote implémente `PaymentDriverContract` tel quel : initiation, relevé, webhook. La
  signature est vérifiée sur le **corps brut** par `hash_equals`, et un échec rend 401. Le montant
  est re-divisé par 100 (XOF, principe n°3). `return_url` et `cancel_url` viennent de `$meta`.
- Il ne figure dans aucune liste tant qu'aucune intégration `free_money` active ne couvre
  l'agence du payable (règle `availableProviders`). Le mode de versement déclaré `free_money` des
  reversements (TCK-594) ne change pas.
- **Prérequis de la sous-partie 6 seule** : la documentation marchande du fournisseur, versée au
  dépôt. Elle doit couvrir l'URL et l'authentification de l'initiation, la forme du retour, le
  relevé de statut, le schéma de signature du webhook, la liste des statuts et l'environnement
  de test. L'offre a pu changer de nom depuis le passage de Free Sénégal à la marque Yas : c'est
  à confirmer avec le fournisseur, pas à supposer. Sans cette documentation, les sous-parties 0 à
  5 se livrent, et la sous-partie 6 attend.

**Lien de paiement**
- Le jeton est **opaque**, fait d'au moins 32 octets aléatoires encodés en base64url, et
  n'apparaît jamais en clair en base hors de la colonne `token` chiffrée. La recherche se fait par
  `token_hash`. Le jeton ne figure ni dans le journal d'activité, ni dans les logs applicatifs,
  ni dans les rapports d'erreur. **Même règle pour les liens de partage de documents.**
- Un jeton inconnu rend **404**, un jeton révoqué ou expiré **410**. Une échéance `refunded` ou
  supprimée rend 410, et une échéance `paid` refuse l'initiation avec **409**.
- **Ce que la page révèle est minimal** : ni nom ni téléphone du locataire, ni adresse complète
  du bien, ni identifiant interne autre que la référence de l'échéance.
- `return_url` et `cancel_url` sont **construits par le serveur** vers la page publique du lien,
  et jamais lus depuis la requête (redirection ouverte).
- La page publique pose `Referrer-Policy: no-referrer` et `noindex`, sans quoi le jeton fuit vers
  le fournisseur par l'en-tête `Referer`.
- **Le montant payé par le lien est `PaymentGatewayService::amountDue()` de TCK-593**, et rien
  d'autre : l'`initiate` public délègue à `PaymentGatewayService::initiate`, qui fige ce montant
  (`metadata.gateway_expected_amount`) et refuse une échéance non payable (409
  `payment_not_payable`). Le contrôleur public ne calcule aucun montant.
  - **Réglage d'agence désactivé** (`settings.late_fee_online_collection` absent ou `false`, le
    défaut) : `amount_due = remaining_amount`. Une pénalité restant due est montrée **à part**,
    « à régler auprès de l'agence », avec le nom de l'agence ; elle n'est ni additionnée au montant
    ni présentée comme payable par le lien.
  - **Réglage activé** : `amount_due = remaining_amount + late_fee_outstanding`, décomposé à
    l'écran (loyer, puis pénalité).
  - Échéance `paid` dont la pénalité reste due : `amount_due = 0`, pas de bouton de paiement, la
    quittance et la pénalité « à régler auprès de l'agence ».
  - La page affiche les valeurs du serveur : aucune addition côté client.
- La quittance publique est le PDF de TCK-593 (pénalité sur une ligne distincte, « acquittée » ou
  « restant due, à régler auprès de l'agence ») : 602 ne crée pas de second gabarit.
- **Passage à `paid` par la passerelle** : l'événement `LeasePaymentSettledOnline` est émis **à
  la transition seulement** (statut précédent ≠ `paid`), que la transition vienne du webhook, d'un
  rejeu ou de `verify()`. Une même échéance ne produit donc qu'**une** quittance. La quittance
  part par WhatsApp, avec repli SMS, puis e-mail, au téléphone du locataire **même sans compte**
  (`Notification::route`, ou `ContactSansCompte::fromCustomer` si TCK-588 est fusionné). Le
  message contient le lien `/pay/{token}`, qui sert la quittance. Le bailleur est prévenu. Tous les
  textes passent par des clés `__()` du bloc `payments.pay_link.*` (règle commune n°1).
- La quittance publique n'est servie que pour une échéance `paid`, quel que soit l'état du
  correctif de TCK-593 sur la route authentifiée.
- **Aucune livraison du lien public avant que TCK-293 soit `done`.**

**Liens de partage de documents**
- Les jetons sont générés et stockés comme ceux du lien de paiement (haché + chiffré).
- Les mots de passe faux sont comptés **par lien** (`RateLimiter`, clé `share-password:{link_id}`) :
  5 essais par 15 minutes, puis 429, même avec le bon mot de passe, jusqu'à la fin de la fenêtre.

**Journal des webhooks**
- La ligne est écrite **avant tout traitement**, avec le statut `received`, par un middleware
  placé juste après `throttle` (le débit protège la table) et avant `restrict.ip` et la signature.
  Elle aboutit toujours à `processed`, `rejected` ou `failed`.
  - **`rejected`** : authentification (jeton, IP, signature) ou validation refusée. Une ligne
    `rejected` n'est **jamais** rejouable, sinon le rejeu deviendrait un contournement de
    signature.
  - **`failed`** : erreur après authentification, comme une exception ou un 5xx.
  - **`processed` avec `matched_count = 0`** : c'est un « non apparié ». Le 404 d'Orange SMS sur un
    accusé non apparié est de ce type.
- Le corps est stocké tel que reçu, en **`text` chiffré**, et jamais en `jsonb`, qui normalise et
  casse le HMAC (TCK-343). Au-delà de 256 Kio, il n'est pas conservé : `body_truncated = true`, et
  la ligne n'est pas rejouable.
- Le segment `{token}` des URL SMS et WhatsApp n'est **jamais** stocké. Les en-têtes passent par
  une liste blanche : signatures, type de contenu, identifiant de requête ; jamais
  `Authorization` ni cookie.
- `payload` (jsonb, la vue d'affichage) passe par une **liste blanche de champs par canal**. Les
  numéros de téléphone sont masqués sauf les 4 derniers chiffres, et les noms et e-mails sont
  retirés. L'API admin ne renvoie jamais `body` ni `headers`.
- **Rejeu** : il n'est permis que si `authenticated_at` est posé, si le statut est `failed`, ou
  `processed` avec `matched_count = 0`, et si `body_truncated` est faux. La requête est
  reconstituée et repasse par le **même gestionnaire**, signature **re-vérifiée** quand le canal en
  a une. L'idempotence existe déjà côté métier (`gateway_events` du paiement,
  `DeliveryAttemptUpdater` pour le SMS). Deux rejeux simultanés de la même ligne se sérialisent
  par `lockForUpdate()` sur la ligne du journal. Chaque rejeu incrémente `attempts` et écrit une
  activité `super_admin_webhook_replayed`.
- Le rattachement `integration_id` / `agency_id` vient de l'intégration **qui a validé la
  signature**, telle que TCK-293 la résout, et non plus de `whereNull('agency_id')`.
- **Lemon Squeezy** : la route du paquet est reprise à l'**URL identique** (`/{lemon-squeezy.path}/webhook`,
  nom `lemon-squeezy.webhook`, hors préfixe `/api`) vers le `WebhookController` du paquet,
  derrière `throttle:60,1` et le middleware du journal. Le tableau de bord Lemon Squeezy n'a
  rien à changer. `authenticated_at` est posé par un écouteur de `WebhookReceived`.
- La purge se fait **au scheduler uniquement** : elle est retirée de `webhooks()` et de
  `recordWebhook()`. La rétention est configurable par canal (option retenue par défaut : 90 jours
  pour les paiements, 30 jours pour la messagerie).

**Coordination avec la vague 73**
- **TCK-293** : dépendance dure (`blocks: [TCK-602]` déjà posé). Le journal lit l'intégration
  qu'il résout. Si l'option retenue est « une URL de webhook par agence », le middleware du journal
  prend le segment d'agence comme les autres segments secrets : il ne le stocke pas, il le résout.
  Le formulaire d'intégration (sous-partie 4) affiche alors cette URL ; c'est un ajout voisin.
- **TCK-588** : il possède `SendLeasePaymentReminders`, les canaux et la prose. **588 prévoit
  dans le rappel l'emplacement du lien, 602 le génère** par
  `LeasePaymentLinkService::urlFor(LeasePayment): string`, qui est idempotent et renvoie le lien
  actif. 602 crée sa propre classe de notification de quittance (`app/Notifications/Payments/`)
  sur les canaux existants, sans modifier `Notifications/Channels/*`. Les `abort` des pilotes de
  paiement sont à 602, et 588 ne les convertit pas.
- **TCK-593** : il possède `PaymentGatewayService::amountDue` (ex-`paymentAmount`), la garde
  `payment_not_payable`, `recordInitiation` (montant figé), les blocs `SUCCESS`/`FAILED` de
  `applyStatusToPayment`, `Agency::collectsLateFeesOnline`, `LeasePaymentResource`, `LeaseSchedule`
  et `DocumentPdfController::receipt`. 602 lit `amountDue`, `late_fee_outstanding` et le réglage
  sans les modifier, et réutilise le rendu de quittance de 593. Dans `recordInitiation`, 602
  n'ajoute **qu'une** reprise de `gateway.last_failed_at` (Delta § 1). Il ajoute l'action « lien de
  paiement » à la ligne d'échéance comme un ajout voisin. Dans `LeaseSchedule`, `BookingDetail` et
  `InvoiceDetailDialog`, 602 ne change que la ligne qui obtient la liste des fournisseurs.
  **Ordre de fusion : 593 avant 602** (602 lit `amountDue`, `metadata.gateway.last_failed_at` et
  les champs de pénalité que 593 crée).
- **TCK-587** : il possède `LeasePaymentPolicy` et `DocumentShareLinkController::authorizeDocument`.
  602 utilise `authorize('update', $payment)` tel quel, sans nouvelle méthode, et en hérite la
  restriction. Pour les liens de partage, 602 ne touche que `DocumentShareLinkService`, sa
  migration et les deux routes publiques ; le contrôleur reste inchangé (le cast déchiffre
  `token`).
- **TCK-539** : il possède la lecture du média dans `DocumentShareLinkController.php:95-96` ; aucun
  recouvrement.
- **TCK-594** : le mode de versement `free_money` reste tel quel ; aucun recouvrement.
- **TCK-600** : il possède `AlertableEvents`, les niveaux `support`/`viewer` et `EnsureSuperAdmin`.
  602 émet un événement `WebhookProcessingFailed` sans l'abonner aux alertes. Les lectures
  console seront ouvertes aux niveaux de lecture quand 600 les branchera ; le rejeu reste réservé
  au super-admin plein.
- **Dans `PaymentGatewayService`**, 602 touche `applyEventToMatchingPayment` (qui renvoie
  désormais le nombre de payables appariés), `applyStatusToPayment` (émission de l'événement à la
  transition vers `paid`), `driverFor` et `extractProvider` (bras Free Money), et ajoute
  `availableProviders`, plus la reprise de `gateway.last_failed_at` dans `recordInitiation`. 293
  touche `handleWebhook`, et 593 `amountDue`, `initiate`, `recordInitiation` et les blocs
  `SUCCESS`/`FAILED`. **Ordre : 293, puis 593, puis 602.**
- **Hors carte** : `IntegrationController` (agence), `Store/UpdateIntegrationRequest`,
  `IntegrationsManager` et `lib/schemas/setting.ts` ne sont attribués à aucun ticket de la vague.
  602 les prend pour la seule catégorie `payments`.
- **ADR requis avant le code** (voir le Delta).

## Delta à produire

### 0. Décision
- [ ] **ADR à écrire et accepter avant le code** : *« Un lien porteur peut-il donner accès à une
      échéance et en déclencher le paiement sans compte, et que doit-on garder d'un webhook
      entrant ? »* L'ADR tranche la forme du jeton (opaque, haché et chiffré, appliquée aussi aux
      liens de partage), sa durée de vie avant et après paiement, ce que la page révèle, la
      rétention du journal par canal, et ce qui est chiffré ou expurgé.

### 1. Journal des webhooks (S8) — à livrer en premier
- [ ] Migration `extend_integration_webhook_logs_for_journal` : colonnes et index du Contrat,
      `down()` réversible.
- [ ] `App\Http\Middleware\JournalizeIncomingWebhook` (alias `webhook.journal:{channel}`) et un
      service à portée de requête `App\Services\Webhooks\WebhookJournal`
      (`open`, `authenticated`, `annotate`, `close`).
- [ ] `App\Services\Webhooks\WebhookPayloadRedactor`, avec une liste blanche par canal et
      fournisseur.
- [ ] Brancher le middleware sur `payments.webhook`, `sms.webhook.{orange,mtarget,lafricamobile}`
      et `whatsapp.webhook.status`. Les contrôleurs annotent `authenticated`, `external_id` et
      `matched_count`.
- [ ] `PaymentGatewayService::applyEventToMatchingPayment` renvoie `int` (payables appariés) ;
      `handleWebhook` le transmet au journal.
- [ ] Lemon Squeezy : `LemonSqueezy::ignoreRoutes()` dans `AppServiceProvider::register()`, route
      reprise à l'URL et au nom identiques avec `throttle:60,1` et `webhook.journal:payment`, et un
      écouteur de `WebhookReceived` qui pose `authenticated`.
- [ ] Supprimer `IntegrationService::recordWebhook`, ou le réduire à un appel au journal, et
      retirer `pruneWebhookLogs()` de `webhooks()`.
- [ ] Commande `webhooks:prune` planifiée dans `routes/console.php` (`dailyAt('03:45')`,
      `withoutOverlapping()`), et `config/webhooks.php` pour les rétentions.
- [ ] `App\Services\Webhooks\WebhookReplayer`, le contrôleur `Admin\WebhookLogController`
      (`index`, `show`, `replay`) et `ReplayWebhookLogRequest`.
- [ ] `Admin\PaymentSupervisionController` (`index`, `summary`) et
      `App\Services\Admin\PaymentSupervisionService`, avec la définition unique de « en échec »
      du Contrat : `lease_payments` par `metadata.gateway.last_failed_at` dans la période,
      `booking_payments` par `status = failed`. Aucune lecture de `lease_payments.status = failed`.
- [ ] `PaymentGatewayService::recordInitiation` : le nouveau bloc `metadata.gateway` reprend
      `last_failed_at` de l'ancien s'il existe (une ligne, après TCK-593). Sans elle, une nouvelle
      tentative efface l'échec avant que la console le compte.
- [ ] Front : la page console « Paiements » et son entrée de navigation. La piste par intégration
      existante lit le nouveau journal.
- [ ] Tests : `WebhookJournalTest`, `WebhookReplayTest`, `WebhookPayloadRedactionTest`,
      `LemonSqueezyWebhookJournalTest`, `PaymentSupervisionTest`, `PruneWebhookLogsCommandTest`.
      Réécrire `IntegrationAdminTest::test_webhook_trail_prunes_entries_older_than_30_days` pour
      qu'il vérifie que la lecture **ne** purge **pas**.

### 2. Lien de paiement (O6)
- [ ] Migration `create_lease_payment_links_table`, avec un index unique partiel nommé.
- [ ] Modèle `LeasePaymentLink` et `App\Services\Payments\LeasePaymentLinkService`
      (`urlFor`, `regenerate`, `revoke`, `resolve`).
- [ ] `routes/api/pay.php` et `Api\PublicPaymentLinkController` (`show`, `initiate`, `verify`,
      `receipt`), avec `InitiatePublicPaymentLinkRequest`. `show` rend `amount_due`,
      `late_fee_outstanding` et `late_fee_payable_online` lus par `amountDue` et
      `Agency::collectsLateFeesOnline` (TCK-593) ; `initiate` délègue à
      `PaymentGatewayService::initiate` ; `receipt` sert le PDF de quittance de 593.
- [ ] `Api\LeasePaymentLinkController` (`store`, `destroy`).
- [ ] Événement `LeasePaymentSettledOnline`, émis dans `applyStatusToPayment` à la seule
      transition vers `paid` d'un `LeasePayment` (webhook, rejeu, `verify()`), et l'écouteur
      `SendRentReceiptAfterOnlinePayment`, qui prévient le locataire sans compte et le bailleur.
- [ ] Clés i18n `payments.pay_link.*` en fr, en et wo, côté API et côté front.
- [ ] Front : la page publique `/pay/{token}` et l'action « lien de paiement » sur l'échéance. La
      page affiche `amount_due` tel quel ; une pénalité non incluse (`late_fee_payable_online =
      false`, `late_fee_outstanding > 0`) apparaît à part, « à régler auprès de l'agence ».
- [ ] Tests : `PublicPaymentLinkTest`, `LeasePaymentLinkTest`, `RentReceiptAfterOnlinePaymentTest`.

### 3. Les payeurs voient les fournisseurs que le serveur accepte
- [ ] `PaymentGatewayService::availableProviders(Model $payment)` (règle des Contraintes).
- [ ] Route `GET {paymentType}/{paymentId}/providers` dans `routes/api/payments.php` (groupe
      `auth:sanctum`, mêmes `where` que `initiate`), et `PaymentGatewayController::providers`, qui
      appelle `authorize('update', $payment)` comme `initiate`. Réponse :
      `{ data: { providers: ["wave", …] } }`.
- [ ] `PaymentGatewayController::initiate` et `PublicPaymentLinkController::initiate` rendent 422
      quand le fournisseur demandé n'est pas dans `availableProviders`.
- [ ] Front : l'action « Payer en ligne » obtient la liste de ce point d'entrée, par payable, sur
      l'échéance, la réservation et la facture. La lecture de `/api/integrations` pour cet usage
      disparaît.
- [ ] Tests : `PaymentProvidersEndpointTest` ; test front de l'action sur l'échéancier vu par un
      locataire.

### 4. Les intégrations de paiement enregistrées fonctionnent
- [ ] `CREDENTIAL_KEYS` sur `WaveDriver`, `OrangeMoneyDriver` (puis `FreeMoneyDriver`), et
      `OrangeMoneyProvider::schema` aligné sur ce que lit le pilote (voir Contraintes).
- [ ] `Store/UpdateIntegrationRequest` (agence) : `provider` borné au registre ; `credentials`
      validé par le schéma pour la catégorie `payments`.
- [ ] Pilotes Wave, Orange Money et Lemon Squeezy : plus aucun corps de réponse ni nom de clé
      dans un message d'erreur (clés `payments.gateway.provider_unavailable` et
      `payments.gateway.misconfigured`, fr/en/wo) ; le corps est journalisé côté serveur.
- [ ] Front : le formulaire d'intégration de l'agence, pour un fournisseur de paiement, présente
      les champs du schéma du fournisseur et affiche les erreurs `credentials.<clé>`.
- [ ] Tests : `PaymentDriverCredentialsTest` (unitaire), `IntegrationStoreValidationTest`,
      `PaymentDriverErrorLeakTest`.

### 5. Liens de partage de documents (D-52)
- [ ] Migration `hash_document_share_links_tokens` : `token_hash` (unique, nommé), `token` en
      `text`, retrait de l'index unique sur `token`, et hachage + chiffrement des jetons existants
      (`down()` qui rétablit la colonne en clair à partir du déchiffrement).
- [ ] `DocumentShareLink` : cast `token` → `encrypted`. `DocumentShareLinkService` : jeton de 32
      octets en base64url, `token_hash` à la création, recherche par `token_hash` dans
      `validate`, compteur d'essais de mot de passe par lien.
- [ ] `routes/api/documents.php:28-29` : `throttle:30,1` sur `share.show`, `throttle:10,1` sur
      `share.download`.
- [ ] Tests : `DocumentShareLinkTokenStorageTest`, `DocumentShareLinkThrottleTest`.

### 6. Pilote Free Money — livré en dernier, prérequis : documentation marchande
- [ ] Verser la documentation marchande du fournisseur au dépôt (`docs/infra/paiements/free-money.md` :
      endpoints, authentification, signature, statuts, bac à sable, date du relevé et source).
- [ ] `PaymentProvider::FreeMoney` (`supportedCurrencies` = `['XOF']`, `paymentMethod()` =
      `PaymentMethod::FreeMoney`).
- [ ] `App\Services\Payments\Drivers\FreeMoneyDriver` (`initiate`, `verify`, `handleWebhook`,
      `CREDENTIAL_KEYS`), selon les Contraintes.
- [ ] `PaymentGatewayService::driverFor` et `extractProvider` : bras `free_money`.
- [ ] `App\Domain\Integrations\Providers\FreeMoneyProvider` (catégorie `payments`, schéma = les
      clés du pilote), enregistré dans `IntegrationProviderRegistry`.
- [ ] `WebhookPayloadRedactor` : liste blanche `payment/free_money`.
- [ ] Front : Free Money dans la sélection du fournisseur (page authentifiée et page publique),
      affiché seulement quand la liste du serveur le contient ; Free Money proposé dans le
      formulaire d'intégration de l'agence ; libellés fr/en/wo.
- [ ] Tests : `FreeMoneyDriverTest` (réponses simulées `Http::fake`), `PaymentGatewayFreeMoneyTest`.

## Critères d'acceptation

**Journal des webhooks**
- [ ] **AC1** — Un `POST /api/webhooks/payments/wave` à la signature invalide crée **une** ligne
      `rejected`, avec `authenticated_at` nul et `http_status = 401`. *Ce test rougit sur le code
      actuel, où aucune ligne n'est créée.*
- [ ] **AC2** — Un webhook valide dont le `transaction_id` n'apparie aucun payable produit une
      ligne `processed` avec `matched_count = 0`, et
      `GET /api/admin/webhook-logs?filter[unmatched]=1` la renvoie. *Ce test rougit sur le code
      actuel, où la ligne n'a pas de compte d'appariement.*
- [ ] **AC3** — Une exception levée **après** la vérification de signature (forcée dans le test)
      produit une ligne `failed`. Le `POST …/replay` de cette ligne passe alors le paiement à
      `paid`. Un second rejeu ne modifie plus le paiement et ne crée aucune nouvelle entrée dans
      `gateway_events`.
- [ ] **AC4** — Le rejeu d'une ligne `rejected` rend **422** et ne mute rien. Ce test devient
      **rouge si l'on retire la condition sur `authenticated_at`** (ablation).
- [ ] **AC5** — Le rejeu d'un webhook Wave réussit parce que la signature, recalculée sur `body`
      déchiffré, est identique. La vérification n'est pas contournée : le test devient rouge si
      l'on altère un octet de `body`.
- [ ] **AC6** — Un payload WhatsApp ou SMS contenant un numéro `221771234567` et un e-mail ne
      laisse apparaître ni l'un ni l'autre en clair dans `payload`, ni dans la réponse
      `GET /api/admin/webhook-logs/{id}`. Une lecture SQL brute de `body` ne contient pas la
      chaîne `221771234567`, parce que la colonne est chiffrée. *Rougit sur le code actuel : le
      numéro est en clair dans `payload.truncated`.*
- [ ] **AC7** — Le segment `{token}` des URL SMS et WhatsApp n'apparaît dans aucune colonne d'une
      ligne de journal.
- [ ] **AC8** — `GET /api/admin/integrations/{id}/webhooks` ne supprime aucune ligne vieille de
      31 jours. `php artisan webhooks:prune` supprime une ligne de paiement de 91 jours et une
      ligne SMS de 31 jours, mais conserve une ligne de paiement de 89 jours.
- [ ] **AC9** — Un webhook validé par l'intégration de l'agence A est rattaché à
      `integration_id` = celle de A et `agency_id` = A, et non à l'intégration globale. *Rougit
      sur le code actuel (`IntegrationService.php:141-144`) ; redevient rouge si l'on rétablit
      `whereNull('agency_id')`.*
- [ ] **AC10** — Jeu construit **par le chemin réel** (webhook `failed` traité par
      `applyEventToMatchingPayment`, pas une fabrique qui écrit `status = failed`) : 2 échéances
      Wave `pending` qui reçoivent un webhook `failed` (elles restent `pending`, TCK-593), dont
      une est **ré-initiée** ensuite ; 1 `BookingPayment` Wave `failed` ; 1 échéance `late` Orange
      Money ; 3 webhooks Wave non appariés. `GET /api/admin/payments/summary` rend, sur 7 jours :
      Wave `failed = 3`, `late = 0`, `unmatched = 3` ; Orange Money `failed = 0`, `late = 1`.
      `GET /api/admin/payments?filter[status]=failed` liste les 2 échéances (statut `pending`) et la
      réservation. *Rougit sur le code actuel (les routes n'existent pas). Redevient rouge si le
      service compte `lease_payments.status = failed` (Wave `failed = 1`), ou si `recordInitiation`
      cesse de reprendre `last_failed_at` (Wave `failed = 2`).* Un agent ou un admin d'agence reçoit
      403 sur les quatre routes `admin/payments` et `admin/webhook-logs`.
- [ ] **AC11** — Un webhook Wave valide dont le corps fait **10 000 octets** est conservé à
      l'identique : `body` déchiffré === corps envoyé, `body_sha256` = `hash('sha256', corps)`,
      `body_truncated = false`. Un corps de 300 Kio donne `body` nul, `body_truncated = true`, et
      son rejeu rend 422. *Rougit sur le code actuel (troncature à 4000, `IntegrationService.php:153`).*
- [ ] **AC12** — Un `POST /api/webhooks/sms/orange/status/{token}` depuis une IP hors liste rend
      403 et crée une ligne `rejected`, `channel = sms`, `http_status = 403`. Un accusé Orange
      authentifié qui n'apparie aucun envoi rend 404 et crée une ligne `processed`,
      `matched_count = 0`, `http_status = 404`. *Rougit sur le code actuel : aucune ligne.*
- [ ] **AC13** — Un `POST /lemon-squeezy/webhook` au `X-Signature` faux rend 403 et crée une
      ligne `rejected`, `provider = lemon_squeezy`. Avec une signature juste, la ligne est
      `processed` et `authenticated_at` est posé. *Rougit sur le code actuel : aucune ligne.*

**Lien de paiement**
- [ ] **AC14** — Pour un locataire **sans compte**, `GET /api/pay/{token}` rend 200 avec le
      montant, le titre du bien et les fournisseurs disponibles de **son** agence. La réponse ne
      contient ni son nom ni son téléphone. Un fournisseur actif uniquement chez une autre agence
      n'y figure pas.
- [ ] **AC15** — Un jeton inconnu rend 404. Un jeton révoqué rend 410, et un jeton expiré rend
      410. `initiate` sur une échéance `paid` rend 409. `initiate` avec un `provider` non
      disponible pour l'agence rend 422.
- [ ] **AC16** — `initiate` ignore tout `return_url` fourni : l'URL transmise au pilote pointe
      vers la page publique du lien. Le test devient rouge si le contrôleur relit `return_url` dans
      la requête.
- [ ] **AC17** — `token` en base n'est pas égal au jeton en clair, et la recherche par jeton en
      clair dans `token_hash` ne trouve rien. Deux appels successifs à `urlFor` rendent la même
      URL, alors que `regenerate` en rend une nouvelle et fait passer l'ancienne à 410.
- [ ] **AC18** — Un webhook `paid` sur une échéance dont le locataire n'a pas de compte envoie
      **une** notification de quittance au téléphone du `Customer`, et une notification au
      bailleur. *Ce test rougit sur le code actuel, où aucune notification n'est envoyée.*
      `GET /api/pay/{token}/receipt` rend un PDF pour une échéance `paid`, et 409 pour une
      échéance `pending`.
- [ ] **AC19** — Sur la même échéance, le même webhook `paid` reçu deux fois, puis rejoué, puis
      suivi d'un `verify()` qui relit `succeeded`, produit **une seule** quittance au total. Une
      échéance passée à `paid` par `verify()` seul (sans webhook) en produit une. *Redevient rouge
      si l'événement est émis sans tester le statut précédent (ablation).*
- [ ] **AC20** — La 31ᵉ requête `GET /api/pay/{token}` dans la minute, depuis la même IP, rend
      429.
- [ ] **AC21** — La page publique sert `Referrer-Policy: no-referrer` et
      `<meta name="robots" content="noindex">`. Elle s'affiche en fr, en et wo, et sans session.
- [ ] **AC34 — le lien paie `amountDue`, deux réglages.** Échéance de 150 000 XOF,
      `late_fee_amount = 7 500`, pénalité non réglée, pilote Wave simulé :
      - réglage d'agence **désactivé** (clé absente) : `GET /api/pay/{token}` rend
        `amount_due = 150000`, `late_fee_outstanding = 7500`, `late_fee_payable_online = false`, et
        `POST /api/pay/{token}/initiate` transmet au pilote **15 000 000** ;
      - réglage **activé** : `amount_due = 157500`, `late_fee_payable_online = true`, et le pilote
        reçoit **15 750 000**.
      Dans les deux cas, ces trois valeurs sont égales à celles de `LeasePaymentResource` pour la
      même échéance. Une échéance `paid` dont la pénalité reste due rend `amount_due = 0`,
      `late_fee_outstanding = 7500`, et son `initiate` rend 409. *Rougit sur le code actuel (la
      route n'existe pas). Redevient rouge si le contrôleur lit `amount` ou `remaining_amount`
      (cas activé), ou ajoute la pénalité sans lire le réglage (cas désactivé).*
- [ ] **AC35 — Front, page publique, deux réglages.** Test Vitest de `/pay/{token}` :
      avec `amount_due = 150000`, `late_fee_outstanding = 7500`, `late_fee_payable_online = false`,
      le montant à payer vaut « 150 000 » et la pénalité « 7 500 » figure à part avec « à régler
      auprès de l'agence » et le nom de l'agence ; aucun nœud n'affiche « 157 500 ». Avec
      `amount_due = 157500` et `late_fee_payable_online = true`, le montant vaut « 157 500 »,
      décomposé en « 150 000 » et « 7 500 », sans « à régler auprès de l'agence ». *Redevient rouge
      si la page additionne `late_fee_outstanding` à `amount_due` (« 165 000 »).*

**Fournisseurs proposés**
- [ ] **AC22** — Un locataire **avec compte**, sur une échéance d'un bail de l'agence A qui a une
      intégration Wave active, obtient `GET /api/lease-payments/{p}/providers` → 200,
      `providers = ["wave"]`. Une échéance d'une agence sans intégration propre, alors qu'une
      intégration Orange Money globale est active, donne `["orange_money"]`. Une intégration
      inactive n'y figure pas, ni Lemon Squeezy sur une échéance en XOF. L'admin d'une agence B
      reçoit 403. *Rougit sur le code actuel : la route n'existe pas, et le seul moyen du front
      (`GET /api/integrations`) rend 403 au locataire.*
- [ ] **AC23** — `POST /api/lease-payments/{p}/initiate` avec `provider=lemon_squeezy` sur une
      échéance en XOF, ou avec un fournisseur sans intégration couvrant l'agence, rend **422** avant
      tout appel au fournisseur (`Http::assertNothingSent`).
- [ ] **AC24** — Front : l'échéancier vu par un locataire affiche « Payer en ligne » quand le point
      d'entrée rend `["wave"]`, et ne l'affiche pas quand il rend `[]`. *Rougit sur le code actuel,
      qui lit `/api/integrations`.*

**Intégrations et pilotes**
- [ ] **AC25** — `POST /api/integrations` par un admin d'agence avec `provider=wave` et
      `credentials = {api_key, api_secret}` rend **422** avec une erreur sur
      `credentials.webhook_secret`. `provider=inconnu` rend 422. *Rougit sur le code actuel (201).*
- [ ] **AC26** — `PaymentDriverCredentialsTest` : pour chaque fournisseur de paiement qui a un
      pilote, chaque clé de `CREDENTIAL_KEYS` est un champ `required` du schéma de son
      `IntegrationProvider`. *Rougit sur le code actuel pour Orange Money (`access_token` absent du
      schéma) ; redevient rouge si l'on retire une clé du schéma (ablation).*
- [ ] **AC27** — Le fournisseur simulé répond 500 avec le corps `UPSTREAM-SECRET-42` :
      `POST /api/lease-payments/{p}/initiate` rend 502, et la réponse ne contient pas
      `UPSTREAM-SECRET-42`. Même chose pour `verify`, pour Wave et Orange Money. *Rougit sur le
      code actuel (`WaveDriver.php:55`).*

**Liens de partage de documents**
- [ ] **AC28** — Après création d'un lien, une lecture SQL brute de `document_share_links.token`
      ne contient pas le jeton en clair, et `GET /api/share/{jeton}` rend 200. Un lien créé
      **avant** la migration (UUID) s'ouvre toujours après. *Rougit sur le code actuel (colonne en
      clair).*
- [ ] **AC29** — La 31ᵉ requête `GET /api/share/{token}` dans la minute, depuis la même IP, rend
      429. *Rougit sur le code actuel.*
- [ ] **AC30** — Sur un lien protégé, 5 mots de passe faux depuis 5 IP différentes, puis le bon
      mot de passe depuis une 6ᵉ : la 6ᵉ requête rend **429**. *Rougit sur le code actuel (401
      puis 200) ; redevient rouge si le compteur est indexé par IP au lieu du lien.*

**Free Money**
- [ ] **AC31** — `FreeMoneyDriverTest` (`Http::fake`) : l'initiation d'une échéance de 15 000 XOF
      envoie le montant **15000** (pas 1 500 000) et l'URL de retour reçue dans `$meta`, puis rend
      `checkout_url` et l'identifiant de transaction lus dans la réponse documentée. Un webhook à
      la signature juste rend un `PaymentEvent` du type attendu pour **chaque** statut de la
      documentation. Un octet altéré du corps rend 401, et un identifiant absent 422.
- [ ] **AC32** — Avec une intégration `free_money` active pour l'agence A : `providers` liste
      `free_money`, `initiate` rend un `checkout_url`, et le webhook `paid` signé passe l'échéance
      à `paid` avec une entrée `gateway_events`. Sans intégration active, `free_money` est absent
      de `providers` et `initiate` rend 422. *Rougit sur le code actuel :
      `POST /api/webhooks/payments/free_money` rend 404 et `initiate` refuse `free_money` (422 de
      validation).*
- [ ] **AC33** — Front : la sélection du fournisseur affiche Free Money si et seulement si la
      liste du serveur le contient ; le formulaire de reversement garde son mode `free_money`.

## Hors périmètre

- Liens de paiement pour une réservation (`BookingPayment`) ou une facture (`Invoice`) :
  amélioration.
- Paiement partiel par le lien : amélioration.
- Notification d'une réservation ou d'une facture réglée en ligne : amélioration. Aucun chemin,
  manuel compris, ne notifie aujourd'hui un `BookingPayment` réglé (`BookingPaymentService` n'a
  aucun `notify`). Ce n'est donc pas un écart propre à la passerelle.
- Le contenu et la planification des relances, et la notification `recorded` du chemin manuel
  vers un locataire sans compte : TCK-588 les porte (§ C « Le destinataire d'une échéance »).
- Le contrôle de statut de la quittance authentifiée : TCK-593 (Delta `DocumentPdfController::receipt`, AC2).
- La correction de la résolution d'intégration du webhook : c'est TCK-293.
- Les règles d'alerte sur les échecs de webhook (TCK-600, `AlertableEvents`), et le rapprochement
  bancaire (TCK-593).
- Le passage de Mtarget au tirage des accusés (TCK-294).

## Notes d'implémentation

_(à remplir par implementing-specs)_
