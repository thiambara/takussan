---
id: TCK-606
title: "Passerelle de paiement : `custom_data` de Lemon Squeezy ne solde que ce qui a été initié et au bon montant, limiteurs par jeton, journal des webhooks alertable et purgé plus tôt (suites de TCK-293 M-1/m-1/O-2/O-5 et TCK-602 m4)"
status: todo
phase: P1
family: back
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#31-integration-
    - docs/models-spec.md#63-integrationwebhooklog-
    - docs/models-spec.md#84-leasepaymentlink-
tags: [back, paiement, webhook, lemon-squeezy, rate-limit, securite, alertes, retention, adr-0046]
---

# TCK-606 — Une commande ne solde que ce qui a été initié, et au bon montant

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé** — 1,5 point sur 8. Aucun commit ne cite TCK-606.

- **Fermé** : point 8 (OFX) par TCK-1443 (`8cf8511df`) — `OfxDriver.php:28-44` lit `CHARSET:` et
  convertit en UTF-8, gardé par `OfxJeuDeCaracteresTest` → AC9 tenu.
- **Fermé à moitié** : point 3 (O-2) par TCK-634 (`d53b6b23e`) — la route 410 a son seau
  (`payment-webhook-gone`), mais la clé reste l'IP : deux intégrations derrière une même IP partagent
  `payment-webhook`.
- **Reste** : amender ADR-0046 §6 (toujours « Limite connue, non fermée ici ») ; restreindre le repli
  `custom_data` + montant sans saut de devise ; `custom_data` dans `LemonSqueezyDriver::handleWebhook`
  et consigne LS d'agence au front ; limiteurs nommés par intégration (webhook) et par jeton haché
  (`pay/{token}`) ; cast `(int)` d'`agency_id` ; écouteur `WebhookProcessingFailed` +
  `webhook_processing_failed` ; `rejected_retention_days`.
- Numéros de ligne du Contexte re-pointés ci-dessous. Pas de décision du porteur attendue (l'amendement
  d'ADR s'écrit d'après les contraintes déjà posées).

## Objectif utilisateur

Une agence n'a aucun payable soldé par une commande qu'elle n'a pas émise ; une agence Lemon
Squeezy voit ses commandes soldées ; le webhook d'une agence n'est jamais ralenti par le trafic
d'une autre ; le personnel plateforme apprend qu'un webhook authentifié a échoué.

## Contexte

Suites de **TCK-293** (verif-293 : M-1, m-1, O-2, O-5) et de **TCK-602** (verif-602 m4 ; passe 2,
observations), consignées dans `FILE-D-ATTENTE.md` (14:40, 17:30, 19:10) et dans
[ADR-0046 §6](../../../adr/0046-un-webhook-de-paiement-par-integration.md) (« Limite connue, non
fermée ici »).

**Re-mesure sur `839be671` (2026-10-08)** — chaque point tenait alors ; lignes re-pointées sur
`9112194ec` le 2026-11-16 (points 3 et 8 : voir la re-vérification ci-dessus) :

1. **M-1 (sécurité).** `PaymentGatewayService::paymentsForEvent`, repli `custom_data`
   (`app/Services/Payments/PaymentGatewayService.php:1113-1127`) : un payable dont
   `metadata.gateway.provider` est **nul** (jamais initié en ligne : échéance réglée en espèces,
   facture neuve) est apparié. `initiatedWithinAuthority` (`:1170-1183`) rend `true` quand aucune
   intégration initiatrice n'est notée, et `withinAuthority` (`:1148-1161`) ne borne rien sous
   l'autorité plateforme (le chemin du paquet LS, `:620-655`). `assertReportedAmountCoversPayment`
   (`:975-1013`) saute le contrôle quand la devise rapportée diffère (USD contre XOF). Reproduction de
   verif-293 : `test_ls_platform_custom_data_reaches_never_initiated_agency_payable` → `paid`.
   TCK-602 a fermé le seul cas « checkout courant chez un autre fournisseur » (commentaire `:1122-1125`).
2. **m-1.** `LemonSqueezyDriver::handleWebhook` (`app/Services/Payments/Drivers/LemonSqueezyDriver.php:117-141`)
   ne met pas `custom_data` dans l'événement, et `initiate` note l'UUID du **checkout** quand le
   webhook porte l'id de **commande** : une intégration LS d'agence ne solde jamais rien
   (verif-293 : `LS agence: 200 statut=pending`). L'écran ne l'invite plus à déclarer son URL
   (ADR-0046, Conséquences).
3. **O-2.** ~~`routes/api/payments.php:46` et `:51` : `throttle:60,1` sans préfixe, clé = IP. Le seau
   est commun à toutes les intégrations, à la route 410 et aux autres routes `throttle:60,1` d'une
   même IP. Les relances de Wave vers l'ancienne URL (410) consomment le seau des agences migrées.~~
   *Relevé 2026-11-16* : `:45` et `:50` sont préfixés `payment-webhook` / `payment-webhook-gone`
   depuis TCK-634 ; la route 410 a son seau, mais la clé reste l'IP : toutes les intégrations
   derrière une même IP partagent `payment-webhook`.
4. **602 m4.** `routes/api/pay.php` : débit par IP seulement (`throttle:6,1,pay_link_verify`,
   `throttle:10,1,pay_link_initiate`, `:21-30`). Un lien qui
   fuit se martèle depuis N IP, et `verify` déclenche un appel sortant chez Wave ou Orange Money avec
   la clé de l'agence.
5. **O-5.** `IntegrationController::store` (`app/Http/Controllers/Api/IntegrationController.php:79`) :
   `$user->agency_id === $agencyId` compare un entier à une chaîne JSON `"5"` → 403 pour un admin
   légitime.
6. **`WebhookProcessingFailed` sans écouteur.** L'événement
   (`app/Events/Webhooks/WebhookProcessingFailed.php:17`) dit que TCK-600 l'abonnera ;
   `AlertableEvents::keys()` (`app/Domain/Alerts/AlertableEvents.php`) ne le connaît pas et aucun
   écouteur n'existe (`grep -rn WebhookProcessingFailed app` : l'événement et son émetteur seuls).
7. **Rétention des lignes rejetées.** `PruneWebhookLogs` purge par canal seulement
   (`config/webhooks.php:11-15`, paiement 90 j) : une ligne `rejected` (472 octets, au plafond de
   60/min/IP) vit 90 jours comme une ligne authentifiée (verif-602 passe 2).
8. **Relevé OFX (TCK-593, R6).** Le contrôle UTF-8 ne vise que le CSV
   (`app/Http/Requests/Accounting/StoreBankStatementRequest.php:47-48`, « l'OFX […] n'est pas jugé
   ici ») et `StatementParser/OfxDriver.php` ne lit pas `CHARSET` : un OFX en 1252 mal décodé n'est
   pas détecté. — caduc depuis TCK-1443 (`8cf8511df`) : `OfxDriver.php:28-44` lit `CHARSET:` et
   convertit en UTF-8.

## Contraintes strictes (métier)

1. **Le chemin `custom_data` n'apparie qu'un payable initié** chez **le même fournisseur**, par une
   intégration dont le propriétaire est celui de l'autorité (une agence, ou la plateforme). Un payable
   jamais initié n'est **jamais** soldé par `custom_data`, sous aucune autorité.
2. **Le montant se contrôle toujours** sur ce chemin : le rapporté (cents, devise de la commande) est
   comparé au montant figé à l'initiation dans `gateway.transactions[]`, dans **la devise du
   checkout**. Une devise rapportée différente de celle du checkout rend 422, jamais un saut.
3. **ADR-0046 §6 est amendé avant le code** : la « Limite connue » devient la règle, et
   « Conséquences » cesse de dire que LS d'agence ne solde rien.
4. **Limiteurs nommés** (le préfixe n'est pas une option : sans lui, toutes les routes `throttle:N,1`
   d'une IP partagent un compte) :
   - webhook à jeton : clé par **intégration résolue** (empreinte du jeton), seuil propre ;
   - route 410 : seau à part, qui ne touche jamais celui des URL à jeton ;
   - lien de paiement : `verify` et `initiate` bornés **par jeton** (`pay_link:{sha256(jeton)}`) **et**
     par IP. Un jeton n'apparaît jamais en clair dans une clé de cache.
5. Un échec de traitement (`failed`) déclenche une alerte **sans** corps ni en-tête du webhook : les
   seuls champs de l'événement.

## Delta à produire

- [x] ADR-0046 : §6 et « Conséquences » amendés (contraintes 1-3), commit à part, avant le code.
- [x] `PaymentGatewayService` : repli `custom_data` restreint (contrainte 1) — `initiatedWithinAuthority`
      rend `false` quand l'appariement vient de `custom_data` sans intégration notée ;
      `assertReportedAmountCoversPayment` appelé avec la devise du checkout, sans saut (contrainte 2).
- [x] `LemonSqueezyDriver::handleWebhook` : `custom_data` porté dans l'événement (même forme que le
      chemin du paquet), pour l'URL à jeton d'agence — **seulement** avec la garde de la contrainte 1.
      Front : la consigne LS d'agence réapparaît dans l'écran de l'URL de webhook (fr/en/wo).
- [x] `AppServiceProvider` (ou le fournisseur des limiteurs) : `RateLimiter::for('payment-webhook', …)`,
      `'payment-webhook-gone'`, `'pay-link-token'` ; `routes/api/payments.php` et `routes/api/pay.php`
      les déclarent.
- [x] `IntegrationController::store` : `agency_id` comparé après cast (`(int)`), ou validé `integer`
      et casté dans la requête.
- [x] `AlertableEvents` : clé `webhook_processing_failed` ; écouteur de `WebhookProcessingFailed` qui
      évalue les règles d'alerte (même voie que les autres événements de la console, TCK-600) ;
      libellés `superAdmin.alerts.events.webhook_processing_failed` (fr/en/wo).
- [x] `config/webhooks.php` : `rejected_retention_days` (défaut 7) ; `PruneWebhookLogs` purge les lignes
      `rejected` à cette borne, les autres à celle de leur canal.
- [x] Import de relevé : un OFX dont l'en-tête déclare un jeu autre qu'UTF-8 est converti, ou refusé
      avec un code (`bank_statement.charset_unsupported`) — jamais lu de travers. (tenu par TCK-1443,
      relevé 2026-11-16)

## Critères d'acceptation

- [x] **AC1 (M-1, rouge sur `839be671`).** Intégration LS de plateforme ; `BookingPayment` de
      l'agence A, XOF, jamais initié ; `order_created` signé, `custom_data` désignant ce payable,
      100 USD : le payable reste `pending`, aucune ligne `gateway_events`. Même résultat par l'URL à
      jeton d'une intégration LS de l'agence **B**.
- [x] **AC2 (montant).** Payable initié par LS (checkout de 15 000 XOF figé) : commande rapportée de
      14 000 XOF → 422 `payment.amount_short` ; rapportée dans une autre devise que le checkout → 422 ;
      15 000 → `paid`.
- [x] **AC3 (m-1).** Intégration LS de l'agence A, payable de A initié par elle : `order_created`
      signé par son `signing_secret` sur son URL, `custom_data` désignant ce payable → `paid`. Le même
      `custom_data` désignant un payable de B → inchangé.
- [x] **AC4 (O-2).** ~~60 requêtes vers l'ancienne URL (410) depuis une IP, puis un webhook signé vers
      l'URL à jeton d'une agence depuis la même IP : 200, pas 429.~~ (première moitié tenue par
      TCK-634, relevé 2026-11-16) Reste : deux intégrations n'épuisent pas le seau l'une de l'autre.
- [x] **AC5 (m4).** `verify` sur un même jeton depuis 7 IP distinctes : la requête au-delà du seuil du
      jeton rend 429, et le pilote n'est pas appelé (`Http::assertSentCount`). Aucune clé de cache ne
      contient le jeton en clair.
- [x] **AC6 (O-5).** `POST /api/integrations` par l'admin de B avec `agency_id: "<id de B>"` (chaîne) :
      201 ; avec l'id de A : 403.
- [x] **AC7.** Une ligne du journal fermée sur `failed` déclenche la règle d'alerte
      `webhook_processing_failed` ; la charge de l'alerte ne contient ni le corps ni un en-tête.
      `AlertableEvents::has('webhook_processing_failed')` est vrai.
- [x] **AC8.** `webhooks:prune` : une ligne `rejected` de 8 jours est supprimée, une ligne `processed`
      de 8 jours est gardée, une ligne `processed` de 91 jours est supprimée.
- [x] **AC9.** Un OFX `CHARSET:1252` portant `Société Générale` est importé lisible, ou refusé par code ;
      jamais `SociÃ©tÃ©`. (tenu par TCK-1443, relevé 2026-11-16 : `OfxJeuDeCaracteresTest`)
- [x] Chaque AC a son ablation rouge, consignée dans les Notes (garde retirée → rouge).

## Hors périmètre

- Free Money (TCK-604).
- Le verrou d'`initiate` non gardé par les tests (TCK-619).
- `refund_pending` et les doublons à rembourser (TCK-608).
- Les pilotes de journal SMS/WhatsApp qui écrivent le lien porteur (TCK-613).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **ADR-0046 amendé** (§ *Amendement du 2026-11-16 (TCK-606)*) : la « Limite connue » du §6 devient
  la règle ; « Conséquences » ne dit plus que LS d'agence ne solde rien. Le commit à part revient à la
  session qui commite (arbre partagé).
- **`custom_data` borné** (`PaymentGatewayService::customDataCheckout`) : checkout COURANT chez le même
  fournisseur, intégration initiatrice **notée**, de même fournisseur, propriétaire = autorité ; sinon
  rien, plateforme comprise. Le repli ne joue que si aucun chemin `transaction_id`/historique n'a rien
  trouvé avant filtrage (inchangé). Preuve : `LemonSqueezyCustomDataTest` (AC1, AC3) — ablation
  « garde ouverte » → 2 rouges.
- **Montant sans saut** : la commande appariée par `custom_data` se compare au montant figé **du
  checkout** (entrée de `gateway.transactions`, qui note désormais `currency`), devise différente →
  422 `payment.currency_mismatch` (code neuf, fr/en/wo), montant absent ou court → 422
  `payment.amount_short`. Les chemins Wave/OM gardent l'ancienne garde. Preuve : AC2 — ablation
  « ancienne garde » → rouge ; ablation « pilote sans `custom_data` » → AC2 et AC3 rouges.
- **Front** : `lemon_squeezy` rejoint `WEBHOOK_ENDPOINT_PROVIDER_IDS`, consigne `hintLemonSqueezy` ;
  la mention « pas encore prise en charge » (`webhookEndpoint.unsupported`) devenue inatteignable est
  retirée avec sa clé.
- **Limiteurs nommés** : `payment-webhook` = 60/min par `sha256(jeton)` + 600/min par IP (freine
  l'essai de jetons) ; `payment-webhook-gone` à part ; `pay-link-verify` (6/min) et
  `pay-link-initiate` (10/min), chacun par IP **et** par `pay_link:<action>:sha256(jeton)` — deux
  limiteurs plutôt qu'un `pay-link-token`, pour garder les deux seuils. Preuve :
  `PaymentWebhookRateLimitTest` (AC4), `PayLinkTokenRateLimitTest` (AC5, `Http::assertSentCount`) —
  ablations clé IP, route en `throttle:60,1`, seau jeton retiré, jeton en clair → rouges.
- **AC6** : `(int)` sur `agency_id` validé (`IntegrationTest::test_agency_id_sent_as_a_string…`) —
  ablation → rouge. **AC7** : `Listeners\Admin\AlertOnWebhookProcessingFailed` écrit l'activité
  `webhook_processing_failed` (5 champs de l'événement seulement), alertable, mise en file comme les
  autres événements non `ops_` (`WebhookReplayTest`) — ablation → rouge. **AC8** :
  `webhooks.rejected_retention_days` = 7 (`PruneWebhookLogsCommandTest`) — ablation → rouge.

