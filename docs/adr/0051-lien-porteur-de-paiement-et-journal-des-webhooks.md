# ADR-0051 — Un lien porteur paie UNE échéance sans compte, et tout webhook entrant laisse une trace chiffrée, expurgée et rejouable

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-602](../backlog/tickets/TCK-602-paiement-sans-compte-journal-webhooks.md)
- **Lit** : [ADR-0046](0046-un-webhook-de-paiement-par-integration.md) (l'intégration qui valide un
  webhook, et son autorité), [ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md) (codes d'erreur et de
  notification, contact sans compte), [ADR-0034](0034-l-agenda-sort-par-un-lien-secret-en-lecture-seule.md)
  (jeton haché d'un lien secret), le principe non négociable n° 3 (montant ×100 à la frontière du
  pilote).

## Contexte

Relu sur `dev` à `0e3c9027` (après TCK-293, 593, 594) :

- **Un locataire saisi par l'agence n'a souvent pas de compte** (`customers.user_id` nullable), et
  le paiement en ligne n'existe que sous `auth:sanctum` : il ne peut pas payer son loyer en ligne,
  et le retour du fournisseur atterrit sur `/app/payments/return`, qui exige une session.
- **Un paiement soldé par la passerelle ne prévient personne** : seules les écritures manuelles
  (`LeasePaymentService::markPaid`) notifient.
- **Un webhook n'est journalisé qu'après un succès**, et rattaché à l'intégration globale
  (`whereNull('agency_id')`) ; son corps est tronqué à 4000 caractères et stocké en clair dans un
  `jsonb`, ce qui rend le rejeu impossible par construction (les HMAC se calculent sur les octets
  bruts, TCK-343). Les webhooks SMS, WhatsApp et Lemon Squeezy (route du paquet) ne laissent rien.
- **Les liens de partage de documents** (D-52) portent un UUID stocké en clair, sans limite de débit,
  et un mot de passe qui se devine sans compteur.

Deux questions, liées parce qu'elles partagent leur stockage : *un lien porteur peut-il donner accès à
une échéance et en déclencher le paiement sans compte ?* et *que garde-t-on d'un webhook entrant ?*

## Décision

### 1. Un lien porteur, par échéance, est un droit d'accès suffisant pour PAYER cette échéance

Le porteur du lien peut lire le montant dû de **son** échéance, la payer chez un fournisseur que
l'agence a activé, et relire sa quittance une fois payée. Rien d'autre : ni le bail, ni une autre
échéance, ni une écriture autre que l'initiation d'un checkout.

- **Le jeton** : 32 octets d'un CSPRNG (`random_bytes`), encodés en base64url sans remplissage
  (43 caractères, 256 bits). Il est **opaque** : il ne contient ni identifiant, ni date.
- **Stockage, la même forme qu'ADR-0046** : `token_hash` = SHA-256 hexadécimal (`char(64)`,
  unique, index nommé) — c'est par lui seul qu'on cherche — et `token` = le clair **chiffré**
  (`text`, cast `encrypted`, clé `APP_KEY`), parce qu'il faut **renvoyer le même lien** à chaque
  relance (TCK-588 l'insère dans le rappel) sans le régénérer. Un vidage de la base sans `APP_KEY`
  ne donne aucun lien. Les deux colonnes sont `$hidden` et hors de toute ressource ;
  `LeasePaymentLink` ne porte pas `LogsActivity`, et aucune ligne de journal applicatif ne cite le
  jeton.
- **Un lien actif par échéance** : index unique partiel nommé sur `lease_payment_id`
  `WHERE revoked_at IS NULL`. `urlFor()` est idempotent (il rend le lien actif non expiré, ou en
  émet un en révoquant l'expiré) ; `regenerate()` révoque l'actif et en émet un neuf dans la même
  transaction.
- **Durée de vie** :
  - **avant paiement** : `expires_at` = la plus tardive de (aujourd'hui, échéance) **+ 60 jours**
    (`payments.pay_link.ttl_days_after_due`) — le lien d'un rappel d'impayé tient tant que la
    relance a un sens ;
  - **après paiement** : à la transition vers `paid`, `expires_at` est ramené à **`paid_at` +
    30 jours** (`payments.pay_link.receipt_days`) s'il était plus tardif — le temps de télécharger
    sa quittance, pas davantage.
- **Réponses** : jeton inconnu → **404** ; révoqué ou expiré → **410** (code
  `pay_link.gone`, qui porte le nom de l'agence pour dire à qui s'adresser) ; échéance supprimée,
  `refunded`, `cancelled` (TCK-596) ou non payable par nature (`deposit_refund`, TCK-594) → **410** ;
  échéance `paid` → la page s'affiche (quittance), mais l'initiation rend **409**
  (`payment.not_payable`, la garde de TCK-593).
- **Ce que la page révèle** — et rien de plus : `amount_due`, `late_fee_outstanding`,
  `late_fee_payable_online` (les valeurs de `LeasePaymentResource`, lues par `amountDue()` et le
  réglage d'agence), la devise, la période, l'échéance, le statut, **la référence de l'échéance**
  (seul identifiant), le **titre** du bien et son **quartier**, le **nom de l'agence**, et les
  fournisseurs disponibles. **Jamais** le nom ni le téléphone du locataire, l'adresse complète du
  bien, ni un identifiant interne.
- **La quittance** servie par le lien est le PDF de TCK-593, **uniquement** pour une échéance `paid`
  (409 sinon). Elle nomme le locataire et l'adresse du bien : c'est **son** document, et c'est
  pourquoi le lien expire 30 jours après le paiement.
- **Le montant payé est `PaymentGatewayService::amountDue()`**, et l'initiation publique délègue à
  `PaymentGatewayService::initiate()` : le contrôleur public ne calcule rien.
- **`return_url` et `cancel_url` sont construits par le serveur**, vers la page publique du lien
  (`/pay/{jeton}?status=…`), et jamais lus dans la requête (redirection ouverte). Le jeton atteint
  donc le fournisseur dans l'URL de retour : c'est inévitable (le payeur doit revenir), et c'est
  aussi pourquoi la page pose `Referrer-Policy: no-referrer` et `noindex` — sans quoi le jeton
  fuirait **en plus** par l'en-tête `Referer` vers toute ressource tierce.
- **Débit** (par IP) : lecture 30/min, initiation 10/min, relevé 6/min, quittance 10/min.

### 2. Le passage à `paid` par la passerelle produit UNE quittance

`applyStatusToPayment` émet `LeasePaymentSettledOnline` **à la seule transition** (statut précédent
≠ `paid`) d'une échéance — webhook, rejeu ou `verify()`. L'événement est distribué après la
validation de la transaction (`ShouldDispatchAfterCommit`). Son écouteur prévient :

- le **locataire**, même sans compte : son compte s'il en a un, sinon son téléphone
  (`ContactSansCompte::fromCustomer`, WhatsApp s'il y a consenti, sinon SMS — ADR-0032 §3), par le
  code `lease_payment.settled_online`, dont le paramètre `receipt_url` est le lien `/pay/{jeton}` ;
- le **bailleur**, par le code existant `lease_payment.received_landlord`.

Les textes sont des clés de `lang/*/notifications.php` (ADR-0032) : il n'y a pas de bloc
`payments.pay_link.*` côté API, contrairement à ce que prévoyait le ticket, parce que TCK-588 a fait
de la notification un code.

### 3. Un fournisseur n'est proposé que si le serveur l'acceptera

`PaymentGatewayService::availableProviders(Model $payment)` est la seule règle : un fournisseur y
figure si `resolveIntegration()` rend une intégration active pour l'agence du payable (repli global
compris), si `driverFor()` sait la servir **et que ses identifiants (`CREDENTIAL_KEYS` du pilote)
sont remplis**, et si le fournisseur accepte la devise du payable. Le quatrième critère est un ajout
au ticket : une intégration acceptée mais incomplète ne doit pas apparaître pour casser au clic.
L'écran authentifié, la page publique et `initiate()` la lisent ; un fournisseur hors liste rend 422
**avant** tout appel au fournisseur.

### 4. Tout webhook entrant laisse une ligne, écrite AVANT tout traitement

Un middleware, `webhook.journal:{canal}`, placé juste après `throttle` (le débit protège la table) et
avant `restrict.ip` et la signature, écrit la ligne `received`, puis la ferme toujours sur l'un de :

| Statut | Quand | Rejouable |
|---|---|---|
| `rejected` | jeton d'URL, IP ou signature refusés, ou validation refusée (4xx) | **jamais** |
| `failed` | erreur après authentification (exception, 5xx) | oui |
| `processed` | traité ; `matched_count = 0` = **non apparié** (le 404 d'Orange SMS compris) | si non apparié |

- **Le corps est gardé tel que reçu**, en `text` **chiffré** (cast `encrypted`), jamais en `jsonb`
  (qui normalise et casse le HMAC). `body_sha256` le résume. Au-delà de **256 Kio**, il n'est pas
  gardé (`body_truncated = true`), et la ligne n'est pas rejouable.
- **Les en-têtes** passent par une liste blanche par canal (signatures, type de contenu, identifiant
  de requête), chiffrée (`encrypted:array`). Jamais `Authorization` ni cookie.
- **Les segments secrets de l'URL ne sont jamais stockés** : ni le `{token}` des URL SMS et
  WhatsApp, ni le jeton d'intégration des URL de paiement (ADR-0046), qui est **résolu** en
  `integration_id` / `agency_id`. Une signature stockée ne vaut que pour son corps exact, et ne
  sert à rien sans le jeton de l'URL, qui n'est nulle part dans le journal.
- **`payload` (jsonb) est la vue d'affichage**, construite par liste blanche de champs par canal et
  fournisseur : les numéros sont masqués sauf leurs 4 derniers chiffres, les noms et e-mails
  retirés, et une dernière passe masque toute suite de chiffres de 9 caractères ou plus et toute
  adresse e-mail qui aurait traversé la liste. L'API d'administration ne rend **jamais** `body` ni
  `headers`.
- **Le rattachement** `integration_id` / `agency_id` vient de l'intégration **qui a validé la
  signature** (`PaymentEvent::$authority`, ADR-0046), plus jamais de `whereNull('agency_id')`.
- **Le message d'erreur** stocké est le code de l'erreur (`ApiError`), `http.<statut>`, ou la classe
  de l'exception — jamais son message, qui peut porter une valeur de la requête.

### 5. Le rejeu repasse par le même gestionnaire, signature re-vérifiée

Permis seulement si `authenticated_at` est posé, que la ligne est `failed` ou `processed` non
appariée, et que `body_truncated` est faux ; réservé au super-admin plein, sous le second facteur de
la plateforme (`ProtectedActions::PLATFORM_TWO_FACTOR`). La requête est reconstituée depuis `body`
déchiffré et les en-têtes gardés, puis repasse par **le même gestionnaire** :

- **paiement** : `PaymentGatewayService::handleWebhook($integration, $requête)` avec l'intégration
  du journal — le pilote **re-vérifie la signature** avec son secret, et l'événement porte son
  autorité (ADR-0046 §5 : sans autorité, rien ne se rapproche). Une intégration désactivée ou
  supprimée depuis rend 422. Une ligne de la route du paquet Lemon Squeezy rejoue la vérification
  `X-Signature` du paquet, puis `handleWebhookEvent()`.
- **WhatsApp** : `X-Hub-Signature-256` re-vérifiée ;
- **SMS** : aucun fournisseur ne signe (D-49) ; l'authentification d'origine (jeton et IP) est
  attestée par `authenticated_at`, et le traitement est idempotent (`DeliveryAttemptUpdater`).

L'idempotence métier existe déjà (`gateway_events` du paiement, `DeliveryAttemptUpdater`). Deux
rejeux simultanés se sérialisent par `lockForUpdate()` sur la ligne du journal ; chaque rejeu
incrémente `attempts` et écrit l'activité `super_admin_webhook_replayed`.

### 6. Rétention par canal, au scheduler seulement

`webhooks:prune` (planifiée à 03:45, `withoutOverlapping`) supprime au-delà de **90 jours** pour les
paiements (la fenêtre d'un litige de rapprochement) et de **30 jours** pour la messagerie
(`config/webhooks.php`). La lecture et le chemin du webhook ne purgent plus rien.

### 7. Les liens de partage de documents reçoivent le même stockage

Jeton de 32 octets base64url, `token_hash` (unique, nommé) + `token` chiffré ; la migration hache et
chiffre les jetons existants, donc un lien déjà envoyé reste valide. Débit : 30/min en lecture,
10/min en téléchargement, `GET` comme `POST`. **Les mots de passe faux sont comptés par lien**
(`share-password:{id}`) : 5 par 15 minutes, puis 429 même avec le bon mot de passe.

## Options écartées

- **Jeton haché seul, montré une fois** (ADR-0034) : le rappel de TCK-588 doit renvoyer le même
  lien à chaque relance ; un lien montré une fois obligerait à en émettre un neuf à chaque message,
  et tous les anciens resteraient vivants ou seraient révoqués sous les pieds du locataire.
- **Lien signé Laravel (`URL::signedRoute`)** : non révocable un par un, et sa durée est figée à
  l'émission — on ne peut pas la ramener à `paid_at + 30 j`.
- **Code court saisi à la main** (6 chiffres + téléphone) : demande de connaître le téléphone que
  l'agence a saisi, et un code court se devine sous un débit par IP.
- **Exiger un compte pour payer** : c'est le défaut à corriger, pas une option.
- **Corps du webhook dans `payload` jsonb** : normalisé par PostgreSQL, il ne revérifie aucun HMAC
  (TCK-343).
- **Corps en clair** : il porte des numéros de téléphone (SMS, WhatsApp) et des noms (Lemon
  Squeezy) ; ADR-0044 (TCK-601) chiffre ce qui est personnel.
- **Rejouer une ligne `rejected`** : ce serait un contournement de signature.
- **Purge à la lecture** : la lecture d'un super-admin effaçait des preuves ; la rétention est une
  politique, pas un effet de bord.

## Conséquences

- Le lien **est** un secret porteur : quiconque le détient peut payer l'échéance (ce qui ne nuit à
  personne) et lire sa quittance pendant 30 jours après paiement (ce qui révèle le nom du locataire
  et l'adresse du bien). L'agence le révoque d'un geste ; il n'est jamais indexé.
- Le jeton atteint le fournisseur dans `return_url` : un fournisseur compromis connaîtrait des liens.
  Accepté : il connaît déjà l'échéance qu'il encaisse.
- Le journal coûte une écriture par webhook **avant** traitement, y compris pour un webhook rejeté :
  c'est pour cela que le middleware vient après `throttle`.
- **Limite connue d'ADR-0046 (M-1)** : le chemin `custom_data` du paquet Lemon Squeezy, sous
  autorité de la plateforme, n'apparie plus un payable dont le checkout courant a été ouvert chez
  **un autre fournisseur** (garde ajoutée ici, AC dédié) — ce qui couvre toute échéance initiée par
  un lien (Wave ou Orange Money). Un payable **jamais initié** reste atteignable : c'est la limite
  M-1 elle-même, inchangée, renvoyée à son ticket de suite.
- La rétention de 90 jours garde des corps chiffrés de paiement plus longtemps que les 30 jours
  d'avant : c'est le prix du rejeu et de l'enquête de rapprochement.

## Application

- Lien : `App\Models\LeasePaymentLink`, `App\Services\Payments\LeasePaymentLinkService`
  (`urlFor`, `regenerate`, `revoke`, `resolve`), `Api\PublicPaymentLinkController`,
  `Api\LeasePaymentLinkController`, `routes/api/pay.php` ; événement
  `App\Events\Payments\LeasePaymentSettledOnline`, écouteur
  `App\Listeners\Payments\SendRentReceiptAfterOnlinePayment`.
- Journal : `App\Http\Middleware\JournalizeIncomingWebhook`, `App\Services\Webhooks\WebhookJournal`,
  `WebhookPayloadRedactor`, `WebhookReplayer`, `config/webhooks.php`, commande `webhooks:prune` ;
  console `Admin\WebhookLogController`, `Admin\PaymentSupervisionController`.
- Gardes : les tests de TCK-602 (journal, rejeu, expurgation, lien public, quittance unique, liens
  de partage), chacun prouvé par ablation (Notes d'implémentation du ticket).
