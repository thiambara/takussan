# ADR-0046 — Un webhook de paiement arrive par l'URL secrète de SON intégration, et ne rapproche que dans son agence

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-293](../backlog/tickets/TCK-293-webhook-paiement-scope-agence.md) ; lu par
  [TCK-602](../backlog/tickets/TCK-602-paiement-sans-compte-journal-webhooks.md)

## Contexte

`POST webhooks/payments/{provider}` ne dit rien de l'agence. Pour vérifier la signature, il faut
le secret d'une intégration, donc une agence ; pour connaître l'agence, il faut avoir lu la charge
utile, donc l'avoir crue avant de l'avoir vérifiée. `PaymentGatewayService::handleWebhook` sortait
de la boucle en prenant **la première intégration active du fournisseur**, toutes agences
confondues (ardoise D-50).

Re-mesuré le 2026-10-08 sur `dev` (2a755b71), deux agences ayant chacune leur intégration Wave et
leur secret : un webhook visant le paiement de A, signé avec le secret de **B**, rend **200** et
passe le paiement de A à `paid` ; signé avec le secret **légitime de A**, il rend **401**. Le
défaut est inversé dans les deux sens : une agence, qui connaît forcément son propre secret, solde
les encaissements de toutes les autres. C'est une violation du principe non négociable n° 2
(l'agence est la frontière d'isolation).

Deux autres chemins portaient le même défaut, relevés le même jour :

- `handleWebhookEvent` (le chemin du paquet Lemon Squeezy) résolvait l'intégration de la même façon ;
- `paymentsForEvent` appariait aussi par `custom_data.payment_id` avec **n'importe quelle classe**
  (`class_exists($type)`) et sans agence.

Le ticket proposait trois sorties : une URL par agence (1), l'essai successif des signatures (2),
une intégration unique et globale (3).

## Décision

**Le porteur a retenu l'option 1 le 2026-10-08, sur recommandation de la session : un webhook de
paiement arrive par l'URL secrète d'UNE intégration. Cette intégration est résolue par le jeton de
l'URL, la signature est vérifiée avec SON secret, et le rapprochement ne voit que les payables de
SON agence.**

1. **Route.** `POST /api/webhooks/payments/{provider}/{jeton}`, nom `payments.webhook`, limitée à
   60 requêtes par minute et par IP (`throttle:60,1`, comme l'ancienne).
2. **Le jeton.** Chaque intégration de paiement (fournisseur de `PaymentProvider` : Wave,
   Orange Money, Lemon Squeezy) en porte un, posé à sa création. 48 caractères alphanumériques tirés
   par `Str::random` (CSPRNG), soit ≈ 285 bits. Il est stocké deux fois :
   - `integrations.webhook_token_hash` — SHA-256 hexadécimal, **unique**, c'est par lui qu'on
     cherche : on hache le jeton reçu, on cherche l'empreinte, puis on la recompare par
     `hash_equals` ;
   - `integrations.webhook_token` — le clair, **chiffré** (cast `encrypted`, clé `APP_KEY`).

   Pourquoi pas le haché seul, comme les liens d'agenda (ADR-0034) : le clair doit être **relu**,
   à chaque paiement Orange Money (`notif_url`, ci-dessous) et chaque fois que l'admin d'agence
   rouvre l'écran pour coller l'URL chez Wave. Un jeton montré une seule fois obligerait à le
   régénérer — donc à reconfigurer le portail — à chaque oubli. La recherche, elle, ne lit jamais le
   clair : un vidage de la base sans `APP_KEY` ne donne aucune URL, et aucun index ne porte une
   valeur que l'on puisse comparer octet par octet.

   Les deux colonnes sont dans `$hidden`, hors de `$fillable` et hors de `$queryFields` : ni
   `fields[integrations]=…`, ni `toArray()`, ni une ressource ne les sortent. `Integration` ne
   porte pas `LogsActivity` ; le geste de régénération journalise l'intégration et le fournisseur,
   jamais le jeton.
3. **Ordre de traitement, et rien n'est muté avant la fin du 3.**
   1. Résoudre l'intégration **par le jeton**, toujours par la même requête, quel que soit le
      fournisseur demandé. Elle doit exister (non supprimée), être **active**, et son fournisseur
      doit être **celui de l'URL**. Sinon : **404**, avec le même corps octet pour octet (code
      `webhook.endpoint_unknown`) que le jeton soit inconnu, d'un autre fournisseur, d'une
      intégration désactivée ou supprimée, ou que le fournisseur n'existe pas.
   2. Vérifier la signature avec **le secret de cette intégration** (pilote : `Wave-Signature`,
      `X-OM-Signature`, `X-Signature`). Fausse : **401**, rien n'est muté.
   3. Rapprocher **dans le périmètre de cette intégration** (point 5).
4. **Orange Money.** `notif_url` est envoyé à chaque paiement et construit avec le jeton de
   l'intégration qui initie (`Integration::webhookUrl()`, sur `APP_URL`). L'agence n'a rien à
   configurer. Le pilote n'accepte plus de `notif_url` fourni par l'appelant.
5. **Le périmètre du rapprochement** est porté par l'événement : le service attache à chaque
   `PaymentEvent` une `WebhookAuthority` — l'intégration qui a validé la signature et son agence.
   `paymentsForEvent` l'applique **aux trois chemins d'appariement** (`transaction_id`, historique
   des checkouts, `custom_data` de Lemon Squeezy, ce dernier restreint aux trois classes payables) :
   - **intégration d'agence A** : seuls les payables dont l'agence est A (acompte → réservation,
     échéance → bail, facture → `agency_id`) ;
   - **et, pour tous** : si le checkout de cette transaction a enregistré l'intégration qui l'a
     initié (`metadata.gateway.integration_id`, et la même clé dans l'entrée de
     `gateway.transactions` — écrites par `recordInitiation` depuis ce ticket), son **propriétaire**
     (l'agence de cette intégration, ou la plateforme) doit être celui de l'intégration qui valide.
     Un paiement de A encaissé par l'intégration de la plateforme ne peut pas être soldé avec le
     secret de A, et inversement ;
   - **un événement sans autorité ne rapproche rien.** C'est le défaut sûr : tout appelant futur
     (le rejeu de TCK-602, par exemple) doit dire qui a validé.

   Un événement validé dont la transaction vise un payable hors périmètre est traité comme un
   événement sans payable : **200** (le fournisseur ne doit pas rejouer à l'infini), rien n'est
   muté, et la trace `payment_webhook_unmatched` de TCK-593 porte en plus `integration_id` et
   `agency_id` (identifiants seulement).
6. **Intégrations de la plateforme** (`agency_id` nul). Elles reçoivent leur jeton comme les
   autres. Ce qui « leur revient » : les payables dont le checkout a été initié par une intégration
   de la plateforme — `initiate` y retombe quand l'agence n'a pas la sienne
   (`resolveIntegration`). Un payable **sans** intégration initiatrice enregistrée reste
   atteignable par la plateforme et par l'agence qui le possède. Ce ne sont **pas** seulement des
   lignes antérieures à ce ticket : tout payable **jamais initié en ligne** (échéance réglée en
   espèces, facture neuve) n'en porte aucune, aujourd'hui comme demain.

   **Limite connue, non fermée ici** (vérification adverse de TCK-293, M-1) : le chemin du paquet
   Lemon Squeezy, qui porte l'autorité de la plateforme, peut encore apparier par `custom_data` un
   payable d'agence jamais initié, et le solder **sans contrôle de montant**. Le montant rapporté
   est en USD, le payable en XOF, et le contrôle de couverture est sauté quand les devises
   diffèrent. Il faut qu'une commande du magasin de la plateforme porte un `custom_data` désignant
   ce payable. Le comportement est antérieur au ticket (`class_exists` acceptait plus large), mais
   il n'est **pas** borné par cette décision. Le correctif est renvoyé à un ticket de suite :
   - n'apparier par `custom_data` qu'un payable dont le checkout du même fournisseur a été initié
     par une intégration du propriétaire de l'autorité ;
   - comparer le montant rapporté au montant figé à l'initiation.

   **Le chemin du paquet Lemon Squeezy** (`webhooks/lemon-squeezy`) est validé par le secret de
   signature de la **configuration** (`config('lemon-squeezy.signing_secret')`), qui appartient à la
   plateforme : il porte donc l'autorité de la plateforme (`WebhookAuthority::platform`), avec
   l'intégration Lemon Squeezy de la plateforme si elle existe. Le webhook d'un magasin Lemon
   Squeezy **d'agence** passe par l'URL à jeton de son intégration, signé par son `signing_secret`.
7. **Régénération.** `POST /api/integrations/{integration}/webhook-endpoint` tire un nouveau jeton
   et **invalide l'ancien dans la même écriture** ; `GET` sur le même chemin rend l'URL. Mêmes
   personnes que pour modifier l'intégration (super-admin, admin de l'agence de l'intégration),
   même exigence de second facteur que les autres gestes de la famille « intégrations »
   (`ProtectedActions::AGENCY_TWO_FACTOR`, ADR-0033). Un changement de **fournisseur** ou
   d'**agence** d'une intégration, par quelque chemin que ce soit, régénère aussi le jeton
   (observateur du modèle).
8. **L'ancienne route** `POST /api/webhooks/payments/{provider}` rend **410** (`webhook.endpoint_gone`)
   sans rien lire ni muter. Elle n'a **pas** de repli « première intégration active » : ce repli
   est le défaut lui-même. Aucun tableau de bord marchand réel ne pointe dessus — l'API n'a jamais
   servi en production (D-04) ; ce qui pointe sur la préproduction est à relever par le porteur
   (TCK-293, « Au porteur »).

## Options écartées

- **(2) Essai successif des signatures.** Aucune reconfiguration externe, mais O(n) HMAC par
  webhook, et une sémantique qu'il aurait fallu inventer quand deux intégrations partagent un
  secret (ou quand une agence recopie celui d'une autre) : la première qui valide gagnerait, et le
  rapprochement suivrait. La sécurité dépendrait d'une propriété — l'unicité des secrets — que rien
  ne garantit, puisque c'est l'agence qui les saisit.
- **(3) Une intégration unique et globale par fournisseur.** La plus simple, mais un retrait de
  capacité : chaque agence encaisse aujourd'hui sur son propre compte marchand, et ce serait le
  modèle d'affaires qui changerait, pas le code.
- **Jeton haché seul, montré une fois (comme ADR-0034).** Incompatible avec `notif_url`, que le
  serveur doit recomposer à chaque paiement, et avec l'écran Wave, qui doit pouvoir réafficher
  l'URL. Voir Décision §2.
- **Jeton en clair indexé.** Un vidage de la base donnerait toutes les URL, et la recherche
  comparerait le secret lui-même. L'empreinte coûte une colonne.
- **Jeton dans `credentials`.** Le formulaire d'agence **remplace** `credentials` en entier à
  chaque enregistrement (`IntegrationController::update`, `fill($data)`) : le jeton disparaîtrait
  au premier changement de clé API.
- **404 différenciés** (jeton inconnu / intégration inactive / mauvais fournisseur). Ils
  renseigneraient qui énumère des jetons ; un seul corps, un seul code.

## Conséquences

- **Coût opérationnel, accepté par le porteur** : chaque agence qui encaisse par **Wave** doit
  coller l'URL de son intégration dans son portail Wave Business, et le refaire à chaque
  régénération ; l'onboarding d'une agence Wave gagne cette étape manuelle. Orange Money n'en
  demande aucune. Un magasin Lemon Squeezy d'agence déclare l'URL dans son tableau de bord.
- **Une régénération coupe les notifications des checkouts Orange Money déjà ouverts** : leur
  `notif_url` porte l'ancien jeton, qui rend désormais 404. Ils se rattrapent par la vérification
  forcée (`GET …/verify`), comme tout webhook perdu. L'écran le dit avant de régénérer.
- L'URL est un secret de **second rang** : elle ne suffit pas, il faut aussi la signature. Mais
  elle vit hors de notre contrôle (portail du fournisseur, journaux d'accès du proxy en amont de
  Laravel) : c'est pourquoi elle se régénère d'un geste. Laravel ne journalise aucune URL de
  requête (relevé : ni `fullUrl()` ni contexte d'URL dans `bootstrap/app.php`, aucun traceur
  d'erreurs installé).
- `PaymentDriverContract` ne change pas : chaque pilote vérifie toujours sa signature dans
  `handleWebhook()`, avec les identifiants de l'intégration qu'on lui donne. Ce qui change, c'est
  QUELLE intégration on lui donne.
- **TCK-602** lit l'intégration qui a validé dans `PaymentEvent::$authority->integration` (et son
  agence dans `->agencyId`) pour rattacher son journal, et doit en fournir une pour tout rejeu.
- Lacune assumée, hors de ce ticket : Wave signe un horodatage (`t=`), que le pilote ne compare à
  aucune fenêtre. Un webhook capturé se rejoue donc tant que son secret vit ; l'idempotence de
  `gateway_events` (fournisseur, transaction, type) en neutralise l'effet sur les montants.

## Application

- Route : `routes/api/payments.php` ; contrôleur `Api\Webhooks\PaymentWebhookController`
  (`__invoke`, `gone`).
- Modèle : `Integration::hashWebhookToken()`, `::rotateWebhookToken()`, `::webhookUrl()`,
  `::isPaymentIntegration()`, et l'observateur de `booted()` ; migration
  `2026_10_08_120000_add_webhook_token_to_integrations_table` (jetons posés aux intégrations de
  paiement existantes).
- Service : `PaymentGatewayService::resolveWebhookIntegration()`, `::handleWebhook(Integration, …)`,
  `::paymentsForEvent()` ; DTO `Dto\WebhookAuthority`, `PaymentEvent::$authority`.
- Pilote : `OrangeMoneyDriver::initiate()` (`notif_url`).
- Gestes : `IntegrationController::webhookEndpoint()` / `::rotateWebhookEndpoint()`, rangés dans
  `ProtectedActions::AGENCY_TWO_FACTOR` ; écran `IntegrationWebhookEndpoint` (front).
- Garde : `tests/Feature/Api/PaymentWebhookMultiTenantTest.php` (la sonde suspendue depuis août est
  retirée, les cas sont rallumés) et `PaymentWebhookEndpointTest.php`, chaque contrainte prouvée
  par ablation (TCK-293, Notes d'implémentation).
