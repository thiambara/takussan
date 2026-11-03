---
id: TCK-689
title: "L'inscription par e-mail écrit la langue négociée dans `preferred_language`"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: [TCK-655]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#1-user
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-11--notifications--doublons-préférences-échecs
tags: [back, auth, i18n, notifications, pistes]
---

## Contexte

Réf : **P11.01** du fichier de pistes, `retenu · autonome` (classement A1 : TCK-017 écrit que la
langue de l'utilisateur est persistée dans `preferred_language`, et `PhoneLoginService::createAccount()`
écrit déjà la langue négociée à la création d'un compte par téléphone).

Re-mesuré le 2026-10-16 sur `1945dbf8` : deux des trois volets de la `Piste` sont déjà livrés par
TCK-655 (`PATCH /api/me` accepte `preferred_language`, `setLocaleAction` vise `/api/me`). Reste
l'inscription : `AuthController::register()` n'écrit pas la colonne, qui garde son défaut `fr`,
et `NotificationService::send()` rend donc e-mails, SMS et WhatsApp en français pour tout compte
inscrit par e-mail tant qu'il n'a pas touché au sélecteur de langue.

Hypothèse (mode sans humain) : TCK-655 avait laissé ce point hors périmètre comme « choix de
produit, V7 ». Le mesureur l'a classé A1 sur le précédent de la connexion par téléphone, qui fait
exactement cela ; c'est ce précédent qui est suivi ici, sans comportement neuf : la langue écrite est
celle que la requête d'inscription négocie déjà pour ses propres messages.

## Objectif

Un compte créé par `POST /api/auth/register` porte, dans `preferred_language`, la langue dans
laquelle il s'est inscrit, et reçoit ses notifications dans cette langue.

## Delta à produire

- [x] `AuthController::register()` : `preferred_language` = `app()->getLocale()`, la langue résolue
      par `SetLocaleMiddleware` (`?lang=` → `Accept-Language` → défaut).
- [x] Tests : `AuthRegistrationTest` (langue écrite pour `fr`, `en`, `wo` ; bout en bout : inscrit
      en anglais, une `CodedNotification` part en `en` depuis un contexte `fr`).

## Critères d'acceptation

- [x] AC1 — inscription avec `Accept-Language: en` (resp. `wo`, `fr`) → 201 et
      `preferred_language` = `en` (resp. `wo`, `fr`).
- [x] AC2 — un compte inscrit sous `Accept-Language: en-GB,en;q=0.9,fr;q=0.5` reçoit une
      `CodedNotification` envoyée avec la locale `en`, alors que l'application est en `fr`.

## Hors périmètre

- Les autres créations de compte qui n'écrivent pas la colonne : `OAuthProvisioningService` et
  l'acceptation d'invitation (`InvitationService`). Relevé au passage, non mesuré.
- Le front : il envoie déjà la langue affichée en `Accept-Language` (`apiRequest`,
  `takussan-web/src/lib/api.ts`), aucun changement n'y est nécessaire.

## Notes d'implémentation

- Rouge avant correctif : `en` et `wo` écrivaient `fr` ; la notification partait en `fr`. Le cas
  `fr` est vert sans correctif (c'est le défaut de la colonne) : il garde la ligne, pas le défaut.
- Ablation (ligne `preferred_language` retirée de `register()`) : 3 rouges (`en`, `wo`, bout en
  bout) ; remise : 13 verts.
