---
id: TCK-2326
title: "Une tentative de remise SMS ou WhatsApp garde l'agence de l'envoi et l'intégration prise"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-203--agence-dun-compte-lue-hors-requête-http"
tags: [api, notifications, sms, whatsapp, migration, pistes]
---

## Objectif

`notification_delivery_attempts` porte `agency_id` et `integration_id`, nullables : l'agence dont le
canal a cherché l'intégration, et l'intégration que le fournisseur a prise. Un commentaire de
`WhatsappChannel` dit que la branche texte libre attend l'écrivain entrant.

## Contexte

Réf : **P203.05** du fichier de pistes, `validé` (points 2 et 3 ; le point 1 est fait en session,
cfa09c4d8).

Depuis TCK-2161 (P203.01, P203.02), l'agence de l'objet notifié choisit l'intégration SMS ou
WhatsApp, celle de l'agence ou, à défaut, celle de la plateforme (`IntegrationLocator`). La
tentative n'en gardait rien : deux `Log::warning` du routeur citaient l'agence, et l'intégration ne
se lisait nulle part. `cost_estimate` sans l'émetteur ne dit pas qui paie le SMS.

`WhatsappContact.last_inbound_at` n'a aucun écrivain : la fenêtre de service reste fermée hors des
tests, et la branche texte libre ne part jamais. TCK-282 l'écrit, et la réception entrante y est hors
périmètre.

## Décision du porteur

validé — validation du porteur (2026-10-25) : `agency_id` et l'identifiant d'intégration, nullables, sur `notification_delivery_attempts` ; un commentaire de `WhatsappChannel` dit que la branche texte libre attend l'écrivain entrant

## Delta à produire

- [x] Migration `2026_10_25_120500_add_agency_and_integration_to_notification_delivery_attempts_table` :
  `agency_id` (FK `agencies`) et `integration_id` (FK `integrations`), nullables, `nullOnDelete` ;
  `down()` retire les deux clés et les deux colonnes. Aucune ligne existante n'est réécrite.
- [x] `NotificationDeliveryAttempt` : `$fillable`, casts, `agency()`, `integration()`.
- [x] `SmsRouterDriver` : chaque tentative écrit l'agence du contexte ; une tentative d'un
  fournisseur appelé écrit l'intégration que `IntegrationLocator` lui donne.
- [x] `WhatsappChannel` : même chose pour la tentative WhatsApp ; commentaire sur la branche texte
  libre de `resolveMessage()`.
- [x] `docs/models-spec.md` § 69.
- [x] `TentativeAgenceEtIntegrationTest` ; un cas dans `WhatsappChannelTest`.

## Critères d'acceptation

- [x] AC1 — un SMS de l'agence A par son intégration LAM : la tentative porte `agency_id` = A et
  l'identifiant de cette intégration.
- [x] AC2 — A sans intégration propre : la tentative porte A et l'intégration de la plateforme.
- [x] AC3 — Orange au plafond n'est pas appelé : sa tentative porte A sans intégration, celle du
  repli LAM porte l'intégration LAM.
- [x] AC4 — un report de nuit porte A sans intégration.
- [x] AC5 — WhatsApp en échec puis repli SMS : les deux tentatives portent A et chacune son
  intégration ; un contact hors fenêtre et sans gabarit (pilote non appelé) porte A sans
  intégration.
- [x] AC6 — la migration laisse à `null` une ligne écrite avant elle, et son `down()` retire les deux
  colonnes.

## Hypothèses

- `agency_id` est l'agence **de l'envoi** (`$context['agency_id']`, celle dont l'intégration est
  cherchée), et non celle de l'intégration : `integration_id` dit déjà si la plateforme a payé.
- L'intégration n'est écrite que pour un fournisseur **appelé**. Elle se lit par le même
  `IntegrationLocator` et la même clé que le pilote, dont le cache vit le temps de la requête ou du
  job : c'est la même ligne. Le pilote SMS `log` n'en a pas.
- Le pilote WhatsApp `log` (développement) ne cherche pas d'intégration : sa tentative porte celle
  qu'aurait prise le pilote Cloud. Le pilote n'expose pas l'intégration qu'il prend ; l'y ajouter
  touchait l'interface des pilotes, hors de la décision.
- Clés étrangères en `nullOnDelete` : une tentative survit à son agence ou à son intégration. Pas
  d'index sur les deux colonnes : la décision n'en demande pas, et aucune lecture ne filtre encore
  par elles.

## Reste à faire

Rien de la décision. Hors périmètre, noté : `SendSmsAfterLateWhatsappFailureJob` repasse
`$user->agency_id` au routeur, et non l'agence de la tentative WhatsApp qu'il relaie.

## Notes d'implémentation

- Avant correctif : 6 rouges (`null` au lieu de l'agence ou de l'intégration ; la migration absente).
- Ablation : la trace du routeur mise à `null` → 5 rouges ; l'intégration seule du routeur → 3
  rouges ; la trace de `WhatsappChannel` → 1 rouge ; `down()` vidé → 1 rouge ; remis → 26 verts.
- `TentativeAgenceEtIntegrationTest` rejoue `down()` puis `up()` : le DDL de PostgreSQL est
  transactionnel, l'aller-retour se défait avec le test.
