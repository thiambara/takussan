---
id: TCK-606
title: "Passerelle de paiement : `custom_data` de Lemon Squeezy ne solde que ce qui a été initié et au bon montant, limiteurs par jeton, journal des webhooks alertable et purgé plus tôt (suites de TCK-293 M-1/m-1/O-2/O-5 et TCK-602 m4)"
status: todo
phase: P1
family: back
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
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

## Objectif utilisateur

Une agence n'a aucun payable soldé par une commande qu'elle n'a pas émise ; une agence Lemon
Squeezy voit ses commandes soldées ; le webhook d'une agence n'est jamais ralenti par le trafic
d'une autre ; le personnel plateforme apprend qu'un webhook authentifié a échoué.

## Contexte

Suites de **TCK-293** (verif-293 : M-1, m-1, O-2, O-5) et de **TCK-602** (verif-602 m4 ; passe 2,
observations), consignées dans `FILE-D-ATTENTE.md` (14:40, 17:30, 19:10) et dans
[ADR-0046 §6](../../adr/0046-un-webhook-de-paiement-par-integration.md) (« Limite connue, non
fermée ici »).

**Re-mesure sur `839be671` (2026-10-08)** — chaque point tient :

1. **M-1 (sécurité).** `PaymentGatewayService::paymentsForEvent`, repli `custom_data`
   (`app/Services/Payments/PaymentGatewayService.php:738-756`) : un payable dont
   `metadata.gateway.provider` est **nul** (jamais initié en ligne : échéance réglée en espèces,
   facture neuve) est apparié. `initiatedWithinAuthority` (`:795-808`) rend `true` quand aucune
   intégration initiatrice n'est notée, et `withinAuthority` (`:773-786`) ne borne rien sous
   l'autorité plateforme (le chemin du paquet LS, `:365-385`). `assertReportedAmountCoversPayment`
   (`:604-621`) saute le contrôle quand la devise rapportée diffère (USD contre XOF). Reproduction de
   verif-293 : `test_ls_platform_custom_data_reaches_never_initiated_agency_payable` → `paid`.
   TCK-602 a fermé le seul cas « checkout courant chez un autre fournisseur » (commentaire `:749-752`).
2. **m-1.** `LemonSqueezyDriver::handleWebhook` (`app/Services/Payments/Drivers/LemonSqueezyDriver.php:98-122`)
   ne met pas `custom_data` dans l'événement, et `initiate` note l'UUID du **checkout** quand le
   webhook porte l'id de **commande** : une intégration LS d'agence ne solde jamais rien
   (verif-293 : `LS agence: 200 statut=pending`). L'écran ne l'invite plus à déclarer son URL
   (ADR-0046, Conséquences).
3. **O-2.** `routes/api/payments.php:46` et `:51` : `throttle:60,1` sans préfixe, clé = IP. Le seau
   est commun à toutes les intégrations, à la route 410 et aux autres routes `throttle:60,1` d'une
   même IP. Les relances de Wave vers l'ancienne URL (410) consomment le seau des agences migrées.
4. **602 m4.** `routes/api/pay.php` : débit par IP seulement (`throttle:N,1,<préfixe>`). Un lien qui
   fuit se martèle depuis N IP, et `verify` déclenche un appel sortant chez Wave ou Orange Money avec
   la clé de l'agence.
5. **O-5.** `IntegrationController::store` (`app/Http/Controllers/Api/IntegrationController.php:77`) :
   `$user->agency_id === $agencyId` compare un entier à une chaîne JSON `"5"` → 403 pour un admin
   légitime.
6. **`WebhookProcessingFailed` sans écouteur.** L'événement
   (`app/Events/Webhooks/WebhookProcessingFailed.php:13`) dit que TCK-600 l'abonnera ;
   `AlertableEvents::keys()` (`app/Domain/Alerts/AlertableEvents.php`) ne le connaît pas et aucun
   écouteur n'existe (`grep -rn WebhookProcessingFailed app` : l'événement et son émetteur seuls).
7. **Rétention des lignes rejetées.** `PruneWebhookLogs` purge par canal seulement
   (`config/webhooks.php:11-15`, paiement 90 j) : une ligne `rejected` (472 octets, au plafond de
   60/min/IP) vit 90 jours comme une ligne authentifiée (verif-602 passe 2).
8. **Relevé OFX (TCK-593, R6).** Le contrôle UTF-8 ne vise que le CSV
   (`app/Http/Requests/Accounting/StoreBankStatementRequest.php:47-48`, « l'OFX […] n'est pas jugé
   ici ») et `StatementParser/OfxDriver.php` ne lit pas `CHARSET` : un OFX en 1252 mal décodé n'est
   pas détecté.

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

- [ ] ADR-0046 : §6 et « Conséquences » amendés (contraintes 1-3), commit à part, avant le code.
- [ ] `PaymentGatewayService` : repli `custom_data` restreint (contrainte 1) — `initiatedWithinAuthority`
      rend `false` quand l'appariement vient de `custom_data` sans intégration notée ;
      `assertReportedAmountCoversPayment` appelé avec la devise du checkout, sans saut (contrainte 2).
- [ ] `LemonSqueezyDriver::handleWebhook` : `custom_data` porté dans l'événement (même forme que le
      chemin du paquet), pour l'URL à jeton d'agence — **seulement** avec la garde de la contrainte 1.
      Front : la consigne LS d'agence réapparaît dans l'écran de l'URL de webhook (fr/en/wo).
- [ ] `AppServiceProvider` (ou le fournisseur des limiteurs) : `RateLimiter::for('payment-webhook', …)`,
      `'payment-webhook-gone'`, `'pay-link-token'` ; `routes/api/payments.php` et `routes/api/pay.php`
      les déclarent.
- [ ] `IntegrationController::store` : `agency_id` comparé après cast (`(int)`), ou validé `integer`
      et casté dans la requête.
- [ ] `AlertableEvents` : clé `webhook_processing_failed` ; écouteur de `WebhookProcessingFailed` qui
      évalue les règles d'alerte (même voie que les autres événements de la console, TCK-600) ;
      libellés `superAdmin.alerts.events.webhook_processing_failed` (fr/en/wo).
- [ ] `config/webhooks.php` : `rejected_retention_days` (défaut 7) ; `PruneWebhookLogs` purge les lignes
      `rejected` à cette borne, les autres à celle de leur canal.
- [ ] Import de relevé : un OFX dont l'en-tête déclare un jeu autre qu'UTF-8 est converti, ou refusé
      avec un code (`bank_statement.charset_unsupported`) — jamais lu de travers.

## Critères d'acceptation

- [ ] **AC1 (M-1, rouge sur `839be671`).** Intégration LS de plateforme ; `BookingPayment` de
      l'agence A, XOF, jamais initié ; `order_created` signé, `custom_data` désignant ce payable,
      100 USD : le payable reste `pending`, aucune ligne `gateway_events`. Même résultat par l'URL à
      jeton d'une intégration LS de l'agence **B**.
- [ ] **AC2 (montant).** Payable initié par LS (checkout de 15 000 XOF figé) : commande rapportée de
      14 000 XOF → 422 `payment.amount_short` ; rapportée dans une autre devise que le checkout → 422 ;
      15 000 → `paid`.
- [ ] **AC3 (m-1).** Intégration LS de l'agence A, payable de A initié par elle : `order_created`
      signé par son `signing_secret` sur son URL, `custom_data` désignant ce payable → `paid`. Le même
      `custom_data` désignant un payable de B → inchangé.
- [ ] **AC4 (O-2).** 60 requêtes vers l'ancienne URL (410) depuis une IP, puis un webhook signé vers
      l'URL à jeton d'une agence depuis la même IP : 200, pas 429. Deux intégrations n'épuisent pas
      le seau l'une de l'autre.
- [ ] **AC5 (m4).** `verify` sur un même jeton depuis 7 IP distinctes : la requête au-delà du seuil du
      jeton rend 429, et le pilote n'est pas appelé (`Http::assertSentCount`). Aucune clé de cache ne
      contient le jeton en clair.
- [ ] **AC6 (O-5).** `POST /api/integrations` par l'admin de B avec `agency_id: "<id de B>"` (chaîne) :
      201 ; avec l'id de A : 403.
- [ ] **AC7.** Une ligne du journal fermée sur `failed` déclenche la règle d'alerte
      `webhook_processing_failed` ; la charge de l'alerte ne contient ni le corps ni un en-tête.
      `AlertableEvents::has('webhook_processing_failed')` est vrai.
- [ ] **AC8.** `webhooks:prune` : une ligne `rejected` de 8 jours est supprimée, une ligne `processed`
      de 8 jours est gardée, une ligne `processed` de 91 jours est supprimée.
- [ ] **AC9.** Un OFX `CHARSET:1252` portant `Société Générale` est importé lisible, ou refusé par code ;
      jamais `SociÃ©tÃ©`.
- [ ] Chaque AC a son ablation rouge, consignée dans les Notes (garde retirée → rouge).

## Hors périmètre

- Free Money (TCK-604).
- Le verrou d'`initiate` non gardé par les tests (TCK-619).
- `refund_pending` et les doublons à rembourser (TCK-608).
- Les pilotes de journal SMS/WhatsApp qui écrivent le lien porteur (TCK-613).

## Notes d'implémentation

_(à remplir par implementing-specs)_
