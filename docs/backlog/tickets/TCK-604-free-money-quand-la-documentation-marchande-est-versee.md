---
id: TCK-604
title: "Free Money, payé en ligne comme Wave et Orange Money — dès que la documentation marchande est versée au dépôt (suite de TCK-602 §6)"
status: todo
phase: P1
family: full
estimate: M
wave: 73
created: 2026-10-08
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#31-integration-
    - docs/models-spec.md#63-integrationwebhooklog-
tags: [back, front, paiement, free-money, integration, webhook, documentation-requise]
---

> ⚠️ **Prérequis, avant toute ligne de code** : la documentation marchande de Free Money est
> versée par le porteur dans `docs/infra/paiements/free-money.md`. Elle couvre l'URL et
> l'authentification de l'initiation, la forme du retour, le relevé de statut, le schéma de
> signature du webhook, la liste des statuts et l'environnement de test, avec la date du relevé et
> sa source. L'offre a pu changer de nom depuis le passage de Free Sénégal à la marque Yas : c'est
> à confirmer avec le fournisseur, pas à supposer. **Sans ce fichier, ce ticket ne démarre pas** :
> un pilote écrit contre un contrat supposé donne des tests verts contre une simulation inventée.

## Objectif utilisateur

Un locataire, avec ou sans compte, règle son échéance par Free Money comme il le fait par Wave ou
Orange Money, dès que son agence a une intégration Free Money active.

## Contexte

Sorti de [TCK-602](TCK-602-paiement-sans-compte-journal-webhooks.md) (§6, AC31 à AC33) par
décision de session le 2026-10-08 : 602 a livré la passerelle réparée, le lien de paiement par
échéance, les fournisseurs proposés par le serveur, la validation des intégrations par le schéma
de leur pilote et le journal des webhooks rejouable
([ADR-0051](../../adr/0051-lien-porteur-de-paiement-et-journal-des-webhooks.md)). Free
Money attendait la seule documentation marchande, absente du dépôt (`grep -rniE "free_?money"
docs` ne rend que le mode de versement déclaré de TCK-594).

Tout ce dont le pilote a besoin existe désormais : `PaymentDriverContract`, `CREDENTIAL_KEYS` et
la validation des identifiants par le schéma du fournisseur (`PaymentDriverCredentialsTest`),
`PaymentGatewayService::availableProviders`, le point d'entrée `GET {paymentType}/{paymentId}/providers`,
le journal `webhook.journal` et son `WebhookPayloadRedactor`, l'URL de webhook par intégration
(ADR-0046).

## Contraintes strictes (métier)

Reprises de TCK-602 (§ Contraintes, « Free Money ») :

- Le pilote implémente `PaymentDriverContract` tel quel : initiation, relevé, webhook. La
  signature est vérifiée sur le **corps brut** par `hash_equals`, et un échec rend 401. Le montant
  est re-divisé par 100 (XOF, principe n°3). `return_url` et `cancel_url` viennent de `$meta`.
- Il ne figure dans aucune liste tant qu'aucune intégration `free_money` active ne couvre
  l'agence du payable (règle `availableProviders`). Le mode de versement déclaré `free_money` des
  reversements (TCK-594) ne change pas.
- `PaymentProvider::FreeMoney = 'free_money'`, en XOF, dont `paymentMethod()` rend
  `PaymentMethod::FreeMoney`. Pas de migration : `integrations.provider` est une chaîne.

## Delta à produire

Repris tel quel de TCK-602 §6 :

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

Repris tels quels de TCK-602 (AC31 à AC33) :

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

> Note de reprise : l'URL citée par AC32 (`/api/webhooks/payments/free_money`) est l'ancienne
> forme ; depuis TCK-293 (ADR-0046), le webhook arrive à l'URL **de l'intégration**
> (`…/free_money/{token}`), et l'ancienne rend 410. Les tests visent l'URL réelle, comme TCK-602
> l'a fait pour AC1. À relire à la livraison : le journal (TCK-602) doit garder une ligne pour
> chaque webhook Free Money, et `WebhookProcessingFailed` part sur un échec comme pour les autres.

## Hors périmètre

- Le mode de versement déclaré `free_money` des reversements (TCK-594).
- Le paiement partiel par le lien (amélioration, comme dans TCK-602).
