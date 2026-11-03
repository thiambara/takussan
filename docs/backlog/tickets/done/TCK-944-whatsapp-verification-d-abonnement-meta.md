---
id: TCK-944
title: "Webhook WhatsApp : la route GET de vérification d'abonnement de Meta, gardée par le jeton d'URL, rend hub.challenge"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-36--webhooks-de-statut-sms-et-whatsapp"
tags: [back, whatsapp, webhooks, env, pistes]
---

## Contexte

Piste P36.05 (angle 36). Pour enregistrer l'URL de rappel d'une application, Meta appelle ce chemin
en `GET` avec `hub.mode=subscribe`, `hub.verify_token` et `hub.challenge`, et attend le défi en
retour. Le dépôt n'exposait que `POST api/webhooks/whatsapp/status/{token}` : aucune route `GET`,
aucun lecteur d'un jeton de vérification. Sans elle, l'URL ne s'enregistre pas et aucun statut
WhatsApp n'arrive.

Décision du porteur (ligne Statut de la piste), recopiée mot pour mot :

> porteur (2026-10-18) : traité hors agents, en session : la route `GET` de vérification d'abonnement de Meta, gardée par le jeton d'URL

## Objectif utilisateur

Le porteur peut enregistrer l'URL du webhook WhatsApp dans l'application Meta.

## Delta à produire

- `routes/api/whatsapp-webhooks.php` : `GET status/{token}` (`whatsapp.webhook.verify`), même chemin
  que le webhook, sous le même limiteur `webhook-whatsapp`, hors du journal des webhooks (ce n'est
  pas un accusé, et sa requête porte le jeton de vérification).
- `WhatsappStatusController::verify()` : jeton d'URL d'abord (404), puis `hub.mode` = `subscribe` et
  `hub.verify_token` comparé en temps constant à `whatsapp.webhook_verify_token`, sinon 403 ;
  succès → `hub.challenge` en `text/plain`, 200. Un jeton de vérification non configuré refuse.
- `lang/{fr,en,wo}/errors.php` : `webhook.verify_token_invalid`, à côté des autres codes `webhook.*`.
- `config/whatsapp.php` : `webhook_verify_token` (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, défaut vide),
  déclarée dans `takussan-api/.env.example` et `takussan-api/.env.docker`.

## Critères d'acceptation

- [x] **AC1** — Bon jeton de vérification → 200, le corps est exactement `hub.challenge`, en
      `text/plain`. *Mesuré : `WhatsappSubscriptionVerificationTest::test_the_right_verify_token_echoes_the_challenge_as_plain_text`
      vert ; avant la route : 405.*
- [x] **AC2** — Mauvais jeton → 403, sans le défi. *Mesuré : `test_a_wrong_verify_token_is_forbidden`
      vert ; ablation (comparaison retirée) → rouge.*
- [x] **AC3** — `hub.mode` autre que `subscribe`, ou absent → 403, sans le défi. *Mesuré :
      `test_a_mode_other_than_subscribe_is_forbidden` et `test_a_missing_mode_is_forbidden` verts ;
      ablations (test du mode retiré ; mode absent lu comme `subscribe`) → rouges.*
- [x] **AC4** — Jeton de vérification non configuré → 403, même pour un `hub.verify_token` vide.
      *Mesuré : `test_an_unconfigured_verify_token_refuses_even_an_empty_one` vert ; ablation de la
      seule clause `$expected === ''` → rouge (`hash_equals('', '')` est vrai).*
- [x] **AC5** — Le jeton d'URL garde aussi ce chemin (404). *Mesuré :
      `test_the_url_token_still_guards_the_path` vert.*
- [x] **AC6** — La requête est construite avec les noms de Meta (`hub.mode`, avec le point), que PHP
      reçoit en `hub_mode`. *Mesuré : les cinq tests passent l'URL `?hub.mode=…&hub.verify_token=…`.*
- [x] **AC8** — Le code d'erreur neuf `webhook.verify_token_invalid` existe dans
      `lang/{fr,en,wo}/errors.php` (ADR-0032 : l'API émet des codes, traduits ×3 ; `wo` porte le
      texte français, le wolof étant en pause). *Mesuré : `php artisan test tests/Unit/Lang` vert ;
      ablation (entrée `fr` retirée) → `LangGroupParityTest` rouge, « fr/errors.php :
      webhook.verify_token_invalid absent ». Oublié au premier passage, trouvé par la vérification
      adverse.*
- [x] **AC7** — La clé neuve est déclarée dans les deux fichiers d'environnement. *Mesuré :
      `node scripts/check-webhook-env-keys.mjs` et `node scripts/check-env-parity.mjs` → verts.*

## Reste — réglages du porteur dans Dokploy (à rejoindre TCK-720)

Clé à poser, par environnement (aucune valeur ici) : `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, la même valeur
saisie comme « Verify token » dans la configuration du webhook de l'application Meta, avec
`WHATSAPP_WEBHOOK_URL_TOKEN` et `WHATSAPP_WEBHOOK_APP_SECRET` (absentes aujourd'hui de la
préproduction). Acte de déploiement : il ne retient pas le statut du ticket.

## Hors périmètre

- Les messages entrants (seuls les statuts sont traités, TCK-283).
- La lecture de la documentation de Meta depuis le poste : la forme de l'appel (trois paramètres
  `hub.*`, défi rendu tel quel, 200) est celle que la piste et le porteur ont retenue.

## Notes d'implémentation

- Re-mesure (2026-10-18, avant code) : `grep -rnE "hub.challenge|hub_challenge|verify_token|hub\.mode" app routes config`
  → rien ; le `GET` sur le chemin rendait 405. Le constat tenait.
- `config/whatsapp.php` annonce depuis TCK-282 un « webhook verify token » dans `metadata` de
  l'intégration ; le webhook n'est pas par agence (un seul chemin, un seul jeton d'URL), donc la
  valeur vit dans la configuration, comme le jeton d'URL et le secret.
