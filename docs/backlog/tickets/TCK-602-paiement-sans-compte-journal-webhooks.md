---
id: TCK-602
title: "Un locataire sans compte ne peut pas payer en ligne, et un webhook rejeté ne laisse aucune trace : lien de paiement par échéance et journal des webhooks rejouable"
status: todo
phase: P1
family: full
estimate: L
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: [TCK-293]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#63-integrationwebhooklog-
    - docs/models-spec.md#31-integration-
tags: [back, front, paiement, webhook, public, console, securite, donnees-personnelles, adr-requise]
---

## Objectif utilisateur

- **Bailleur** : son locataire, même sans compte Takussan, paie le loyer depuis un lien Wave ou
  Orange Money reçu par message, et reçoit sa quittance — sans que personne ne saisisse le paiement
  à la main.
- **Super-admin** : chaque webhook entrant (paiement, SMS, WhatsApp) est visible, accepté ou non,
  avec la raison d'un échec ; il rejoue sans risque un traitement échoué et voit d'un coup d'œil
  les paiements en échec, en retard et les webhooks qui n'ont trouvé aucun paiement.

## Contexte

Issu de l'analyse par acteur du 2026-10-06 (vague 73) : points O6 (rapport propriétaire) et S8
(rapport super-admin). Chaque constat est re-mesuré sur `e3ab4a4e`.

### 1. Le paiement en ligne exige un compte (O6)

- `routes/api/payments.php:8-27` : `initiate` et `verify` vivent sous `auth:sanctum`, et
  `PaymentGatewayController.php:32-33` exige un utilisateur puis `authorize('update', $payment)`.
- Le cas courant d'un locataire saisi par l'agence n'a pas de compte :
  `customers.user_id` est nullable (`2026_04_17_160006_create_customers_table.php:13`).
- Le retour du fournisseur atterrit sur `/app/payments/return`
  (`PaymentProviderPicker.tsx:102-104`), sous `(dashboard)/layout.tsx`, qui exige une session
  (`getMeAction()`).
- **Un paiement passé à `paid` par webhook ne prévient personne** : `PaymentGatewayService::applyStatusToPayment`
  (`app/Services/Payments/PaymentGatewayService.php:246-294`) écrit le statut et sauve ; les seules
  notifications de paiement sont dans le chemin manuel `LeasePaymentService::markPaid:52-76`, et
  seulement vers `tenant->user`. Aucun observateur de `LeasePayment` ne notifie
  (`AppServiceProvider.php:384,390`).
- La quittance (`routes/api/leases.php:60-61`) est sous `auth:sanctum`, et
  `DocumentPdfController::receipt:28-45` ne vérifie pas que l'échéance est payée (relevé aussi par
  TCK-593).
- **Corrigé par rapport au rapport** : il n'existe pas de fournisseur Free Money.
  `PaymentProvider.php:7-9` ne connaît que `wave`, `orange_money`, `lemon_squeezy`. `free_money`
  n'existe que comme moyen de saisie manuelle (`PaymentMethod.php:12`).
- **Corrigé par rapport au rapport** : le partage de documents réparé en D-52 n'utilise pas un
  jeton *signé*. C'est un UUID opaque (`DocumentShareLinkService.php:18`) stocké **en clair**
  (`create_document_share_links_table.php:14`), qui expire (l.19), se révoque (l.55-58) et rend
  410 (l.30-31). Ses routes publiques n'ont **aucune limite de débit** (`routes/api/documents.php:28-29`).
  Ce ticket reprend le principe opaque, expirant, révocable et 410, mais pas le stockage en clair
  ni l'absence de limite de débit.
- La liste des fournisseurs côté front (`usePaymentProviders.ts:30-33`) filtre `agency_id` exact.
  Elle ignore donc le repli sur l'intégration globale, alors que `resolveIntegration`
  (`PaymentGatewayService.php:38-51`) l'applique. Le front et le back ne disent donc pas la même
  chose.

### 2. Un webhook n'est journalisé qu'après un succès (S8)

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
- La console n'a aucune surface de paiements : aucune route `payment` dans `routes/api/admin.php`,
  aucune entrée dans `SuperAdminSidebar.tsx:90-150`. Les statuts `failed` et `late` existent
  pourtant (`PaymentStatus.php:9,11`).

### 3. Pourquoi TCK-293 d'abord

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

**`integration_webhook_logs` étendu** (§63) : `channel` (`payment|sms|whatsapp`), `agency_id`
(FK nullable, `nullOnDelete`, indexée), `body` (`text`, cast `encrypted`, octets exacts), `body_sha256`,
`body_truncated` (bool), `headers` (`text`, cast `encrypted:array`, liste blanche par canal),
`authenticated_at` (posé quand jeton, IP et signature ont passé), `http_status`, `error_code`,
`error_message`, `external_id` (transaction ou identifiant de message, indexé), `matched_count`,
`attempts`, `replayed_at`, `replayed_by_id`. `payload` (jsonb) devient la **vue expurgée**. Index
`(status, created_at)`, `(channel, provider, created_at)` et `(agency_id, created_at)`, tous nommés
explicitement.

**Endpoints publics** (nouveau fichier `routes/api/pay.php`, sans `auth`) :

| Route | Rôle | Débit |
|---|---|---|
| `GET /api/pay/{token}` | montant, devise, période, échéance, statut, titre et quartier du bien, nom de l'agence, fournisseurs actifs | `throttle:30,1` |
| `POST /api/pay/{token}/initiate` | `{provider}` → `checkout_url` | `throttle:10,1` |
| `POST /api/pay/{token}/verify` | relève le statut chez le fournisseur | `throttle:6,1` |
| `GET /api/pay/{token}/receipt` | quittance PDF, **uniquement** si `paid` | `throttle:10,1` |

**Endpoints authentifiés** :
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

## Direction UX / Artistique

- **Page publique de paiement** : on doit pouvoir la lire sur un téléphone d'entrée de gamme, en
  3G, souvent ouverte depuis WhatsApp. Elle donne d'abord le montant, puis le bien, la période et
  l'agence, puis un gros bouton par fournisseur actif. Elle ne propose aucun fournisseur que
  l'agence n'a pas activé, et ne demande aucune connexion. Après le retour du fournisseur, elle
  dit clairement si le paiement est payé, en attente ou en échec, et propose la quittance une fois
  le paiement payé. Un lien expiré ou révoqué affiche une page calme qui dit à qui s'adresser (le
  nom de l'agence), pas une erreur technique. La page existe en fr, en et wo, et suit la palette
  Lin et les guidelines (`docs/design-guidelines.md`).
- **Côté agence** : sur la ligne d'une échéance non payée, une action permet de copier ou de
  partager le lien de paiement, et de le révoquer.
- **Console « Paiements »** : une nouvelle entrée du groupe finances de la barre latérale
  super-admin. Elle s'ouvre sur trois compteurs par fournisseur (en échec, en retard, non
  appariés), puis le journal filtrable. Le détail d'un webhook montre le statut, l'erreur et la
  charge **expurgée**. Le bouton « Rejouer » n'apparaît que sur une ligne rejouable et demande
  une confirmation.

## Contraintes strictes (métier)

**Lien de paiement**
- Le jeton est **opaque**, fait d'au moins 32 octets aléatoires encodés en base64url, et
  n'apparaît jamais en clair en base hors de la colonne `token` chiffrée. La recherche se fait par
  `token_hash`. Le jeton ne figure ni dans le journal d'activité, ni dans les logs applicatifs,
  ni dans les rapports d'erreur.
- Un jeton inconnu rend **404**, un jeton révoqué ou expiré **410**. Une échéance `refunded` ou
  supprimée rend 410, et une échéance `paid` refuse l'initiation avec **409**.
- **Ce que la page révèle est minimal** : ni nom ni téléphone du locataire, ni adresse complète
  du bien, ni identifiant interne autre que la référence de l'échéance.
- `return_url` et `cancel_url` sont **construits par le serveur** vers la page publique du lien,
  et jamais lus depuis la requête (redirection ouverte).
- La page publique pose `Referrer-Policy: no-referrer` et `noindex`, sans quoi le jeton fuit vers
  le fournisseur par l'en-tête `Referer`.
- Les fournisseurs proposés et acceptés sont ceux que `PaymentGatewayService::resolveIntegration`
  rend pour l'agence du bail, **la même règle que `initiate`**. Un `provider` hors de cette liste
  rend 422.
- Le montant affiché est celui que l'initiation facturera (`paymentAmount`). Si TCK-593 y ajoute
  la pénalité de retard, la page la montre aussi.
- Dès qu'une échéance passe à `paid` **par la passerelle**, la quittance est envoyée : par
  WhatsApp, avec repli SMS, puis e-mail, au téléphone du locataire **même sans compte**
  (`Notification::route`). Le message contient le lien `/pay/{token}`, qui sert la quittance. Le
  bailleur est prévenu. Tous les textes passent par des clés `__()` du bloc `payments.pay_link.*`
  (règle commune n°1).
- La quittance publique n'est servie que pour une échéance `paid`, quel que soit l'état du
  correctif de TCK-593 sur la route authentifiée.
- **Aucune livraison avant que TCK-293 soit `done`.**

**Journal des webhooks**
- La ligne est écrite **avant tout traitement**, avec le statut `received`, par un middleware
  placé juste après `throttle` (le débit protège la table) et avant `restrict.ip` et la signature.
  Elle aboutit toujours à `processed`, `rejected` ou `failed`.
  - **`rejected`** : authentification (jeton, IP, signature) ou validation refusée. Une ligne
    `rejected` n'est **jamais** rejouable, sinon le rejeu deviendrait un contournement de
    signature.
  - **`failed`** : erreur après authentification, comme une exception ou un 5xx.
  - **`processed` avec `matched_count = 0`** : c'est un « non apparié ».
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
- La purge se fait **au scheduler uniquement** : elle est retirée de `webhooks()` et de
  `recordWebhook()`. La rétention est configurable par canal (recommandation : 90 jours pour les
  paiements, 30 jours pour la messagerie).

**Coordination avec la vague 73**
- **TCK-293** : dépendance dure. Il doit déclarer `blocks: [TCK-602]`. Le journal lit
  l'intégration qu'il résout. Si l'option retenue est « une URL de webhook par agence », le
  middleware du journal prend le segment d'agence comme les autres segments secrets : il ne le
  stocke pas, il le résout.
- **TCK-588** : il possède `SendLeasePaymentReminders`, les canaux et la prose. **588 prévoit
  dans le rappel l'emplacement du lien, 602 le génère** par
  `LeasePaymentLinkService::urlFor(LeasePayment): string`, qui est idempotent et renvoie le lien
  actif. 602 crée sa propre classe de notification de quittance (`app/Notifications/Payments/`)
  sur les canaux existants, sans modifier `Notifications/Channels/*`.
- **TCK-593** : il possède `PaymentGatewayService::paymentAmount`, `LeaseSchedule` et
  `DocumentPdfController::receipt`. 602 ajoute l'action « lien de paiement » à la ligne
  d'échéance comme un ajout voisin, et il lit `paymentAmount` sans le modifier.
- **TCK-587** : il possède `LeasePaymentPolicy`. 602 utilise `authorize('update', $payment)` tel
  quel, sans nouvelle méthode, et en hérite la restriction.
- **TCK-600** : il possède `AlertableEvents`, les niveaux `support`/`viewer` et `EnsureSuperAdmin`.
  602 émet un événement `WebhookProcessingFailed` sans l'abonner aux alertes. Les lectures
  console seront ouvertes aux niveaux de lecture quand 600 les branchera ; le rejeu reste réservé
  au super-admin plein.
- **Dans `PaymentGatewayService`**, 602 ne touche que `applyEventToMatchingPayment` (qui renvoie
  désormais le nombre de payables appariés) et l'émission de l'événement de passage à `paid`.
- **ADR requis avant le code** (voir le Delta).

## Delta à produire

### 0. Décision
- [ ] **ADR à écrire et accepter avant le code** : *« Un lien porteur peut-il donner accès à une
      échéance et en déclencher le paiement sans compte, et que doit-on garder d'un webhook
      entrant ? »* L'ADR tranche la forme du jeton (opaque, haché et chiffré), sa durée de vie
      avant et après paiement, ce que la page révèle, la rétention du journal par canal, et ce
      qui est chiffré ou expurgé.

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
- [ ] Lemon Squeezy : journaliser par un écouteur de `WebhookReceived` / `WebhookHandled` du
      paquet.
- [ ] Supprimer `IntegrationService::recordWebhook`, ou le réduire à un appel au journal, et
      retirer `pruneWebhookLogs()` de `webhooks()`.
- [ ] Commande `webhooks:prune` planifiée dans `routes/console.php` (`dailyAt('03:45')`,
      `withoutOverlapping()`), et `config/webhooks.php` pour les rétentions.
- [ ] `App\Services\Webhooks\WebhookReplayer`, le contrôleur `Admin\WebhookLogController`
      (`index`, `show`, `replay`) et `ReplayWebhookLogRequest`.
- [ ] `Admin\PaymentSupervisionController` (`index`, `summary`) et
      `App\Services\Admin\PaymentSupervisionService`.
- [ ] Front : la page console « Paiements » et son entrée de navigation. La piste par intégration
      existante lit le nouveau journal.
- [ ] Tests : `WebhookJournalTest`, `WebhookReplayTest`, `WebhookPayloadRedactionTest`,
      `PaymentSupervisionTest`, `PruneWebhookLogsCommandTest`. Réécrire
      `IntegrationAdminTest::test_webhook_trail_prunes_entries_older_than_30_days` pour qu'il
      vérifie que la lecture **ne** purge **pas**.

### 2. Lien de paiement (O6)
- [ ] Migration `create_lease_payment_links_table`, avec un index unique partiel nommé.
- [ ] Modèle `LeasePaymentLink` et `App\Services\Payments\LeasePaymentLinkService`
      (`urlFor`, `regenerate`, `revoke`, `resolve`).
- [ ] `routes/api/pay.php` et `Api\PublicPaymentLinkController` (`show`, `initiate`, `verify`,
      `receipt`), avec `InitiatePublicPaymentLinkRequest`.
- [ ] `Api\LeasePaymentLinkController` (`store`, `destroy`).
- [ ] Événement `LeasePaymentSettledOnline`, émis par la passerelle au passage à `paid`, et
      l'écouteur `SendRentReceiptAfterOnlinePayment`, qui prévient le locataire sans compte et le
      bailleur.
- [ ] Clés i18n `payments.pay_link.*` en fr, en et wo, côté API et côté front.
- [ ] Front : la page publique `/pay/{token}` et l'action « lien de paiement » sur l'échéance.
- [ ] Tests : `PublicPaymentLinkTest`, `LeasePaymentLinkTest`, `RentReceiptAfterOnlinePaymentTest`.

## Critères d'acceptation

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
      chaîne `221771234567`, parce que la colonne est chiffrée.
- [ ] **AC7** — Le segment `{token}` des URL SMS et WhatsApp n'apparaît dans aucune colonne d'une
      ligne de journal.
- [ ] **AC8** — `GET /api/admin/integrations/{id}/webhooks` ne supprime aucune ligne vieille de
      31 jours. `php artisan webhooks:prune` supprime une ligne de paiement de 91 jours et une
      ligne SMS de 31 jours, mais conserve une ligne de paiement de 89 jours.
- [ ] **AC9** — Un webhook validé par l'intégration de l'agence A est rattaché à
      `integration_id` = celle de A et `agency_id` = A, et non à l'intégration globale.
- [ ] **AC10** — `GET /api/admin/payments/summary`, sur un jeu de 2 paiements `failed` Wave, 1
      `late` Orange Money et 3 webhooks non appariés Wave, rend exactement ces valeurs par
      fournisseur. Un agent ou un admin d'agence reçoit 403 sur les quatre routes `admin/payments`
      et `admin/webhook-logs`.
- [ ] **AC11** — Pour un locataire **sans compte**, `GET /api/pay/{token}` rend 200 avec le
      montant, le titre du bien et les fournisseurs actifs de **son** agence. La réponse ne
      contient ni son nom ni son téléphone. Un fournisseur actif uniquement chez une autre agence
      n'y figure pas.
- [ ] **AC12** — Un jeton inconnu rend 404. Un jeton révoqué rend 410, et un jeton expiré rend
      410. `initiate` sur une échéance `paid` rend 409. `initiate` avec un `provider` non actif
      pour l'agence rend 422.
- [ ] **AC13** — `initiate` ignore tout `return_url` fourni : l'URL transmise au pilote pointe
      vers la page publique du lien. Le test devient rouge si le contrôleur relit `return_url` dans
      la requête.
- [ ] **AC14** — `token` en base n'est pas égal au jeton en clair, et la recherche par jeton en
      clair dans `token_hash` ne trouve rien. Deux appels successifs à `urlFor` rendent la même
      URL, alors que `regenerate` en rend une nouvelle et fait passer l'ancienne à 410.
- [ ] **AC15** — Un webhook `paid` sur une échéance dont le locataire n'a pas de compte envoie
      **une** notification de quittance au téléphone du `Customer`, et une notification au
      bailleur. Ce test rougit sur le code actuel, où aucune notification n'est envoyée.
      `GET /api/pay/{token}/receipt` rend un PDF pour une échéance `paid`, et 409 pour une
      échéance `pending`.
- [ ] **AC16** — La 31ᵉ requête `GET /api/pay/{token}` dans la minute, depuis la même IP, rend
      429.
- [ ] **AC17** — La page publique sert `Referrer-Policy: no-referrer` et
      `<meta name="robots" content="noindex">`. Elle s'affiche en fr, en et wo, et sans session.

## Hors périmètre

- Liens de paiement pour une réservation (`BookingPayment`) ou une facture (`Invoice`).
- Paiement partiel par le lien, et Free Money (aucun pilote n'existe).
- Le contenu et la planification des relances : TCK-588 les porte, ce ticket fournit l'URL.
- La correction de la résolution d'intégration du webhook : c'est TCK-293.
- Les règles d'alerte sur les échecs de webhook (TCK-600, `AlertableEvents`), et le rapprochement
  bancaire (TCK-593).
- Les rejets de signature Lemon Squeezy, refusés par le middleware du paquet avant tout code
  applicatif.
- Le passage de Mtarget au tirage des accusés (TCK-294).

## Notes d'implémentation

_(à remplir par implementing-specs)_
