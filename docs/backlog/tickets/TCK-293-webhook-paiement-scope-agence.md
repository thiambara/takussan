---
id: TCK-293
title: "Webhook de paiement — le secret de n'importe quelle agence valide celui des autres"
status: done
phase: P0
family: bug
estimate: M
wave: 73
created: 2026-08-16
updated: 2026-10-08
depends_on: []
blocks: [TCK-602]
spec_refs:
  features: []
  models: []
tags: [back, securite, paiement, multi-agence, decision]
---

## Objectif utilisateur

Qu'un webhook de paiement ne puisse marquer « payé » que ce qu'il concerne réellement — et qu'un
secret confié à une agence n'ouvre rien chez une autre.

## ⚠️ Ce ticket attend un ARBITRAGE avant toute implémentation

Décision du 2026-08-16 : **le constat est acté, la correction est différée.** Ce ticket existe pour
que l'arbitrage ne se perde pas, pas pour être pris en charge par le premier agent qui lit la
colonne Todo. **Ne pas l'implémenter sans que la question ci-dessous ait été tranchée.**

## Ce que la mesure a établi (2026-08-15, ardoise D-50)

`PaymentGatewayService::handleWebhook` (lignes 132-137) résout l'`Integration` **sans aucun scope
d'agence** — la première active du fournisseur — alors que `::initiate`, dix lignes plus haut, la
scope correctement via `resolveIntegration($provider, $agencyId)`. C'est le secret de cette
intégration arbitraire, et lui seul, qui valide les signatures de **toute la plateforme**.

Mesuré avec deux agences ayant chacune leur intégration Wave active et son propre `webhook_secret` :

| Webhook visant le paiement de l'agence A | Attendu | Mesuré |
|---|---|---|
| signé avec le secret de **B** | 401 | **200 — le paiement de A passe à `paid`** |
| signé avec le secret **légitime de A** | 200 | **401** |

Le comportement est donc inversé **dans les deux sens à la fois** : le mauvais secret ouvre, le bon
ferme.

## La question à trancher, et pourquoi elle n'est pas technique

La route est `POST webhooks/payments/{provider}` (`routes/api/payments.php:33`) : **rien n'y
identifie l'agence**. Or il faut l'intégration — donc l'agence — pour vérifier la signature, et il
faut avoir lu la charge utile pour connaître l'agence. Trois sorties possibles, et le choix engage
la configuration chez le fournisseur, pas seulement le code :

1. **Une URL de webhook par agence** (jeton dans le chemin). Le plus net cryptographiquement.
   Coût : chaque agence doit reconfigurer son tableau de bord Wave / Orange Money, et l'onboarding
   d'une nouvelle agence gagne une étape manuelle.
2. **Essai successif des signatures** parmi les intégrations actives du fournisseur, puis
   restriction du rapprochement à l'agence de celle qui a validé. Aucune reconfiguration externe.
   Coût : O(n) vérifications par webhook, et une sémantique de sécurité à écrire noir sur blanc
   (que se passe-t-il si deux agences partagent le même secret ?).
3. **Une intégration unique et globale par fournisseur**, les intégrations par agence étant
   interdites pour les paiements. Le plus simple — *si* c'est le modèle d'affaires réel. À vérifier
   auprès du produit avant tout, parce que ce serait un retrait de capacité.

## Delta à produire

- [x] Trancher entre les trois sorties ci-dessus (produit + ops). — *Le porteur, le 2026-10-08 :
      option 1, une URL par intégration.*
- [x] Écrire la décision en ADR — c'est une décision structurelle sur l'isolation par agence, qui
      est le principe non négociable n°2 du dépôt. — *ADR-0046, commit `9ae44ec9`, avant le code.*
- [x] Implémenter, puis retirer la sonde de `tests/Feature/Api/PaymentWebhookMultiTenantTest.php`
      (elle se rallume seule dès que la résolution est scopée). — *Back `9ca48769`, écran
      `1492ccd9` ; sonde retirée, le fichier est désormais la garde (6 tests).*

## Critères d'acceptation

- [x] AC1 — un webhook signé avec le secret d'une autre agence est **refusé** (401), et ne mute rien.
      — *`PaymentWebhookMultiTenantTest::test_the_secret_of_another_agency_must_not_authenticate_a_webhook`,
      vert le 2026-10-08 ; rougit sous l'ablation A2 (retour au secret « première active »).*
- [x] AC2 — un webhook signé avec le secret légitime de l'agence propriétaire du paiement **passe**.
      — *`…::test_the_own_secret_of_the_agency_authenticates_its_webhook`, vert ; rougit sous A2.*
- [x] AC3 — le rapprochement d'événement (`paymentsForEvent`) ne peut atteindre que des payables de
      l'agence dont l'intégration a validé la signature. — *Quatre tests de
      `PaymentWebhookMultiTenantTest` (acompte, échéance, facture, historique) et deux de
      `PaymentWebhookEndpointTest` (`custom_data`), verts ; rougissent sous A1 et A8.*
- [x] AC4 — un ADR consigne la sortie retenue et le coût opérationnel accepté. — *ADR-0046,
      section « Conséquences » : la reconfiguration Wave par agence, la régénération qui coupe
      les notifications des checkouts OM ouverts, l'horodatage Wave non borné.*
- [ ] Suite backend entière verte. — *Lancée par la session : `bin/impacted-tests.php
      --base=origin/dev` exige la suite entière (fichier neuf hors de la carte), qu'un agent
      délégué ne lance pas.*

## Hors périmètre

- Les webhooks SMS (Orange, Mtarget) : ni l'un ni l'autre n'offre de signature, c'est acté et
  documenté en ardoise D-31 — problème distinct, contraintes distinctes.

## Notes d'implémentation

Le test `PaymentWebhookMultiTenantTest` existe déjà et sonde la **cause** (l'absence de scope dans la
résolution), pas le symptôme : il se rallumera de lui-même le jour de la correction, sans que
personne n'ait à se souvenir de venir le retirer.

### 2026-10-08 — Arbitrage rendu, re-mesure sur `dev` (2a755b71) avant le code

**Le porteur a tranché le 2026-10-08 : option 1, une URL de webhook par agence** (jeton dans le
chemin). Décision écrite dans ADR-0046.

Re-mesure, la constatation d'août tient **à l'identique** :

- `php artisan test tests/Feature/Api/PaymentWebhookMultiTenantTest.php` → `2 skipped` : la sonde
  lit toujours `handleWebhook` sans scope (`PaymentGatewayService.php:195-210` sur `dev`, et non
  plus 132-137).
- Mesure du ticket rejouée par un test jetable (supprimé dans le même script), deux agences, B
  créée d'abord : secret légitime de A → **HTTP 401**, paiement de A `pending` ; secret de B →
  **HTTP 200**, paiement de A **`paid`**. Inversé dans les deux sens, comme le 2026-08-15.

Écarts relevés en relisant le code qui a bougé depuis août :

- `handleWebhook` porte désormais un `orderByRaw('agency_id IS NULL')` (préférence pour une
  intégration d'agence) : il ORDONNE sans restreindre. Avec deux agences, c'est l'ordre de
  création qui décide.
- `handleWebhookEvent` (chemin du paquet Lemon Squeezy) reproduit la même résolution sans scope,
  et `paymentsForEvent` a un TROISIÈME chemin d'appariement : `custom_data.payment_id` +
  `class_exists($type)` — n'importe quelle classe, n'importe quel identifiant, sans agence.
- `IntegrationService::recordWebhook` rattache toujours le journal à l'intégration globale
  (`whereNull('agency_id')`) : c'est l'objet de TCK-602 (AC9), qui lira l'intégration que 293
  résout.
- `OrangeMoneyDriver.php:47` : `notif_url` fixe (`/api/webhooks/payments/orange_money`), sans
  agence — confirmé.
- **Hors périmètre, relevé pour 602 (§3 de son ticket)** : le formulaire d'agence écrit
  `api_key`/`api_secret`/`webhook_url`, jamais `webhook_secret` que lisent `WaveDriver:101` et
  `OrangeMoneyDriver:106`. Une intégration Wave créée par l'écran rend donc 500 au webhook, avec ou
  sans 293. 602 possède ce formulaire pour la catégorie `payments` ; 293 n'y ajoute que l'URL.

### 2026-10-08 — Back livré (ADR-0046)

**Ce qui a changé.**

- **Route et résolution.** `POST webhooks/payments/{provider}/{token}` (`throttle:60,1`, aucune
  contrainte de forme sur `{token}`, pour qu'un jeton mal formé rende le même 404).
  `PaymentGatewayService::resolveWebhookIntegration()` cherche par **empreinte** SHA-256, recompare
  par `hash_equals`, puis exige une intégration active, de paiement, du fournisseur de l'URL. Tout
  échec rend `null`, puis le même 404 `webhook.endpoint_unknown`, sans rien écrire.
- **Jeton.** `Str::random(48)`, soit environ 285 bits. Deux colonnes :
  - `webhook_token_hash`, unique, sert à la recherche ;
  - `webhook_token`, en cast `encrypted`, est relu pour `notif_url` et pour l'écran.

  Les deux sont dans `$hidden`, hors `fillable` et hors `$queryFields`. Un jeton est tiré à la
  création d'une intégration de paiement et retiré à tout changement de fournisseur ou d'agence,
  par quelque chemin que ce soit (`booted()`). La migration rétro-remplit les intégrations de
  paiement existantes.
- **Autorité.** `PaymentEvent::$authority` (`WebhookAuthority` : l'intégration et son
  `agencyId`, ou la plateforme). `paymentsForEvent` ne rapproche rien sans autorité. Sous une
  autorité d'agence, ses trois chemins (transaction courante, historique, `custom_data`) sont
  bornés à l'agence :
  - l'acompte par sa réservation ;
  - l'échéance par son bail ;
  - la facture par son `agency_id`.

  `custom_data` n'accepte plus que les trois payables, au lieu de `class_exists`.

  **Au-delà de l'agence** : `initiate` note `integration_id` sur le checkout et dans son
  historique. Un checkout noté ne se solde que par une autorité de même propriétaire. Un checkout
  de A encaissé sur l'intégration de la plateforme ne se solde donc pas avec le secret de A, et
  l'inverse est vrai aussi.
- **Lemon Squeezy, chemin du paquet** (`handleWebhookEvent`) : il est authentifié par le secret de
  la configuration, donc l'autorité est **plateforme**. Il n'emprunte plus l'intégration de la
  première agence venue.
- **Orange Money.** `notif_url` vaut `Integration::webhookUrl()`, construite sur `APP_URL`.
  L'override `$meta['notif_url']` est retiré. Sans URL, le driver rend 500
  `payment.webhook_endpoint_missing`.
- **Ancienne route.** `POST webhooks/payments/{provider}` rend **410** `webhook.endpoint_gone`.
  Elle ne lit rien, ne mute rien, et n'a pas de repli.
- **Écran.** `GET` et `POST integrations/{integration}/webhook-endpoint` lisent et régénèrent l'URL.
  L'autorisation est la même que pour modifier l'intégration (`UpdateIntegrationRequest::mayManage`).
  Une intégration hors paiement rend 422 `integration.not_payment`. La régénération est dans
  `ProtectedActions::AGENCY_TWO_FACTOR` et laisse une ligne `activity_log`
  (`webhook_token_rotated`, fournisseur et agence, **sans** jeton).
- **Journal sans payable** (TCK-593) : il porte désormais `integration_id` et `agency_id`.

**Preuves exécutées le 2026-10-08.**

- `PaymentWebhookMultiTenantTest` réécrit, sonde retirée : 6/6. Il couvre AC1, AC2, et AC3 sur
  l'acompte, l'échéance, la facture et l'historique.
- `PaymentWebhookEndpointTest`, nouveau : 20/20.
- Les 19 classes paiement et intégration : 179 passed, 787 assertions. Elles comprennent
  `PaymentWebhookTest`, `LeaseDueFixture` et ses huit utilisateurs, `InvoiceTest`,
  `PaymentGatewayVerifyTest` et `LemonSqueezyEventListenerTest`.
- Les gardes de la table des routes : 19 passed. Elles comprennent
  `ProtectedActionsCoverageTest` et `NamespaceAccessGuardTest`.
- `tests/Unit/{Lang,Http,Authorization}` et `ModelsTest` : 98 passed.
- Pint propre.
- **Migration, sur une base jetable `takussan_tck293_mig`, supprimée à la fin** : `up`, puis
  `down` (0 colonne restante), puis des lignes wave, orange_money (inactive) et sms_orange, puis
  `up` de nouveau. Les deux premières reçoivent leur jeton, sms_orange n'en reçoit pas. Le chiffré
  se relit, et son SHA-256 égale l'empreinte stockée.

**Ablations** : chacune est posée, testée et restaurée dans un même script (`cp` depuis une copie,
md5 contrôlé). Le `git diff` est identique avant et après (md5 `d2de0eec…`). Les 18 mordent :

| # | Mutation | Rougit |
|---|---|---|
| A1 | l'agence ne borne plus le rapprochement | 4 tests AC3 |
| A2 | le secret de « la première active du fournisseur » (le défaut d'origine) | AC1, AC2 (+2) |
| A3 | une intégration désactivée résout | le 404 unique |
| A4 | le fournisseur de l'URL n'est pas comparé | le 404 unique |
| A5 | `{token}` contraint par `->where()` (404 du routeur) | le 404 unique (corps différent) |
| A6 | un événement sans autorité retombe sur la plateforme | sans autorité |
| A7 | l'intégration qui a initié n'est pas comparée | les 2 tests plateforme |
| A8 | `custom_data` sans borne d'agence | custom_data, agence |
| A8b | `custom_data` accepte `class_exists` | custom_data, trois payables |
| A9 | `initiate` ne note pas l'intégration | initiation |
| A10 | le jeton retiré de `$hidden` | aucune sortie du jeton |
| A11 | le contrôleur journalise le chemin | jamais journalisé |
| A12 | la régénération ne persiste pas | régénération |
| A13 | changer de fournisseur garde le jeton | changement de titulaire |
| A14 | plus de limiteur | 429 |
| A15 | l'ancienne route retirée | 410 |
| A16 | `notif_url` remplaçable par l'appelant | notif_url |
| A17 | la régénération hors `AGENCY_TWO_FACTOR` | 2FA + `ProtectedActionsCoverageTest` |

*A8 a d'abord survécu.* Le test d'origine passait par l'URL d'une intégration Lemon Squeezy
d'agence, mais le pilote ne met jamais `custom_data` dans l'événement : seul l'écouteur du paquet
le fait, sous autorité plateforme. Le test réécrit vise les deux entrées réelles : un événement
sous autorité d'agence, et l'écouteur avec une classe arbitraire.

**Non ablatable, et dit tel quel** : `hash_equals` après une recherche par égalité exacte sur
l'empreinte est une seconde barrière. Aucun test ne peut la distinguer de son absence. La
propriété qui compte se voit ailleurs : on ne compare jamais le clair, la recherche porte sur une
empreinte uniforme (la base stocke l'empreinte, testé), et le clair n'est stocké que chiffré.

**Écarts assumés, et laissés à TCK-602.**

- `recordWebhook` rattache toujours le journal à l'intégration globale ; c'est l'AC9 de 602.
- Le formulaire d'agence n'écrit pas `webhook_secret` ; c'est le §3 de 602.
- La console super-admin n'a pas d'écran propre. Le super-admin passe par les mêmes points
  (autorisé, testé).

### 2026-10-08 — Écran livré, vérifié au navigateur

- **Écran.** `IntegrationWebhookEndpoint` sur chaque carte de paiement de
  `/admin/settings/integrations`. La page précharge l'adresse ; sinon un bouton la lit. On y
  trouve « Copier » et « Régénérer », ce dernier après une confirmation qui dit que l'ancienne
  adresse tombe tout de suite et que les checkouts OM ouverts se confirment à la vérification. Une
  consigne par fournisseur. Libellés fr/en/wo sous
  `adminSettings.integrations.webhookEndpoint`.
- **Second facteur.** Le refus revient d'une action serveur, donc sans `ApiError`.
  `mapError` rend désormais le `code` du refus, et `avecGardeDoubleFacteurAction` le confie à
  `GardeDoubleFacteur` puis rejoue l'action, deux passages au plus. Aucun écran à action serveur
  ne le faisait jusqu'ici.
- **Preuves.**
  - `vitest` sur `admin-settings`, `double-facteur`, `actions/__tests__` et
    `promesses-de-delai` : 182 passed.
  - `eslint` et `tsc --noEmit` à 0.
  - `check:i18n` : parité 0/0.
  - `check:i18n-namespaces` vert.
- **Ablations du front** (même protocole, arbre identique avant et après) : les 6 mordent.
  - F1 : la garde n'est pas transmise.
  - F2 : la carte n'affiche pas l'adresse.
  - F3 : régénérer sans confirmation.
  - F4 : `code` perdu par `mapError`.
  - F5 : la boucle de rejeu n'est plus bornée.
  - F6 : une action sort de la table du profil actif.
- **Navigateur** : API sur :8115 et Next sur :3115, base jetable `takussan_tck293_ui`, admin
  d'agence avec second facteur, Wave, OM et SMS. Les deux serveurs sont arrêtés et la base
  supprimée à la fin.
  - Les cartes OM et Wave affichent leur adresse et leur consigne ; la carte SMS n'en a pas.
  - « Copier » passe à « Copied ».
  - « Regenerate » ouvre la confirmation, puis affiche une adresse neuve et l'avis.
  - Mesuré par `curl` ensuite : l'ancien jeton rend **404**, le nouveau **401** (il résout, la
    signature manque), l'ancienne route **410**. `activity_log` porte `webhook_token_rotated`
    `{provider, agency_id}`, sans jeton.
  - *Écart du banc, pas du ticket* : la connexion par l'écran a rendu 429 au second facteur. Le
    jeton a été obtenu par `POST /api/auth/login` depuis la page, puis posé par
    `/api/auth/set-token`.

## Au porteur

Hors dépôt, et hors du périmètre de l'agent (préproduction, production, Dokploy, portail Wave) :

1. **Avant le déploiement** : la migration `2026_10_08_120000_add_webhook_token_to_integrations_table`
   tire un jeton pour chaque intégration de paiement existante. À partir de là, **l'ancienne URL
   `…/api/webhooks/payments/{provider}` rend 410** : Wave n'y livre plus rien.
2. **Wave, par agence** : chaque agence qui a une intégration Wave active colle la nouvelle
   adresse, lue sur son écran Intégrations, dans son portail Wave Business. D'ici là, ses
   paiements ne se confirment que par la vérification (`verify`), pas par le webhook.
3. **Intégration de la plateforme** (`agency_id` nul) : elle a aussi son jeton. Son adresse se lit
   par `GET /api/integrations/{id}/webhook-endpoint` en super-admin ; aucun écran de la console
   plateforme ne l'affiche encore.
4. **Orange Money** : rien à faire. `notif_url` porte la nouvelle adresse dès le prochain checkout.
   Un checkout ouvert AVANT le déploiement notifie l'ancienne URL (410) et se solde par
   `verify`.
5. **À relever en préproduction**, ce que l'agent n'a pas pu lire : combien d'intégrations de
   paiement sont actives, et chez quelles agences. C'est la liste des portails à reconfigurer.
