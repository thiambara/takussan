---
id: TCK-1046
title: "Le motif d'un accusé WhatsApp `failed` porte le code Meta, et le trait `Concerns\\Critical` sans emploi est retiré"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-des-accusés-failed"
tags: [back, notifications, whatsapp, pistes]
---

## Objectif utilisateur

Une tentative WhatsApp échouée garde le code d'erreur de Meta, seul champ qui distingue un numéro
sans WhatsApp d'un gabarit refusé ; et le dépôt ne garde plus un trait qu'aucune notification
n'emploie.

## Contexte

Réf : **P72.06** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`WhatsappStatusController::failureReason()` écrivait `title ?? message ?? code` : dès qu'un titre
existait, le code Meta (`131026`) était perdu. Mesuré avant correctif (test de garde ci-dessous) :
`{code: 131026, title: "Message undeliverable"}` → `failure_reason = "Message undeliverable"` ; et
un `title` de 400 caractères faisait **répondre 500** au webhook (`QueryException`, la colonne est
un `string` de 255).

Le trait `App\Notifications\Concerns\Critical` n'était employé par aucune classe d'`app/`, seulement
par un double de `SmsChannelTest` et par l'exemple de `docs/integrations/sms.md`.

## Décision du porteur (déléguée)

> écrire dans `failure_reason` le `code` Meta suivi du `title` (`131026: Message undeliverable` ; le code ou le titre seul quand l'autre manque, `message` en dernier recours, borné à 255 caractères), et retirer le trait sans emploi `Concerns\Critical` en déclarant ses deux méthodes dans le double de `SmsChannelTest` ; ne pas l'appliquer à `LeaseSignatureCodeNotification`

## Hypothèses (mode sans humain)

- « `message` en dernier recours » se lit comme remplaçant du `title` absent : `code` + `message`
  donne `131047: Re-engagement message`.
- Une erreur sans `code`, `title` ni `message` garde le motif `whatsapp_failed` d'avant.
- Le bornage coupe à 255 caractères (`mb_substr`), la longueur de la colonne.

## Delta à produire

- [x] `WhatsappStatusController::failureReason()` : `code: titre`, sinon l'un des deux, `message` à
  défaut de titre, borné à 255.
- [x] Retrait de `app/Notifications/Concerns/Critical.php` ; le double de `SmsChannelTest` déclare
  `shouldSendSms()` et `isCriticalSms()` ; l'exemple de `docs/integrations/sms.md` aussi.
- [x] Test : `WhatsappStatusWebhookTest::test_failed_reason_porte_le_code_meta_puis_le_titre`
  (7 jeux de données).

## Critères d'acceptation

- [x] AC1 — `{code: 131026, title: "Message undeliverable"}` → `131026: Message undeliverable`.
- [x] AC2 — code seul → `131026` ; titre seul → le titre ; message seul → le message.
- [x] AC3 — un titre de 400 caractères n'aboutit plus à un 500 : le motif est borné à 255.
- [x] AC4 — `Concerns\Critical` n'existe plus ; `SmsChannelTest` reste vert.

## Hors périmètre

- `LeaseSignatureCodeNotification` n'est pas touchée (décision).
- Les autres écritures de `failure_reason` (`WhatsappChannel`, `SmsRouterDriver`,
  `DeliveryAttemptUpdater`) ne sont pas bornées ici : non mesurées.

## Notes d'implémentation

- Ablation : l'ancienne ligne `title ?? message ?? code` remise → 3 rouges sur 18 (« code et
  titre », « code et message sans titre », et « borné à 255 » en 500) ; correctif remis → 18 verts.
- Le retrait du trait ne change aucun comportement : sa garde est `SmsChannelTest`, vert (7 tests)
  avec les deux méthodes déclarées dans le double.
