---
id: TCK-945
title: "Webhooks SMS et WhatsApp : WHATSAPP_WEBHOOK_IPS retirée, délai du ret_url LAM déclaré, domaine de la documentation corrigé, statut WhatsApp non signé refusé partout"
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
tags: [back, sms, whatsapp, webhooks, env, securite, docs, pistes]
---

## Contexte

Piste P36.08 (angle 36), quatre points :

1. `whatsapp.webhook_allowed_ips` (`WHATSAPP_WEBHOOK_IPS`) n'a aucun lecteur — `RestrictIpMiddleware`
   lit la clé `sms.` — et son docblock annonce un filtrage « optionnel » qui n'existe pas.
2. `sms.lafricamobile.dlr_signature_ttl_days` est lu par le pilote LAM mais absent de
   `config/sms.php` : le délai de 7 jours n'est réglable que par le code.
3. `docs/integrations/sms.md` donne l'URL de rappel Mtarget sur `api.takussan.app`, domaine que le
   dépôt n'emploie nulle part ailleurs.
4. Hors production, un secret WhatsApp vide laisse passer un statut non signé dès que le jeton
   d'URL est posé.

Décision du porteur (ligne Statut de la piste), recopiée mot pour mot :

> porteur (2026-10-18) : traité hors agents, en session : `WHATSAPP_WEBHOOK_IPS` retirée, et les trois autres points de la piste

## Objectif utilisateur

La configuration des webhooks ne déclare que ce que le code lit, la documentation donne la bonne
URL, et le jeton d'URL seul ne suffit plus à écrire un statut WhatsApp, dans aucun environnement.

## Delta à produire

- `config/whatsapp.php` : `webhook_allowed_ips` retirée (et son docblock) ; le docblock du secret
  dit le refus. `WHATSAPP_WEBHOOK_IPS` retirée de `takussan-api/.env.example` et
  `takussan-api/.env.docker`, et les commentaires de leur bloc WhatsApp corrigés.
- `config/sms.php` : `lafricamobile.dlr_signature_ttl_days` (`SMS_LAM_DLR_SIGNATURE_TTL_DAYS`,
  défaut 7).
- `docs/integrations/sms.md` : `api.takussan.com` (et `preview.api.takussan.com`).
- `WhatsappStatusController::verifySignature()` : secret vide → 403
  `webhook.signature_not_configured`, quel que soit l'environnement ; la ligne de journal est donc
  toujours authentifiée quand le traitement a lieu.

## Critères d'acceptation

- [x] **AC1** — `whatsapp.webhook_allowed_ips` n'existe plus, ni `WHATSAPP_WEBHOOK_IPS` dans les
      fichiers d'environnement. *Mesuré : `WebhookConfigDeclarationsTest::test_the_dead_whatsapp_ip_allowlist_is_gone`
      vert, rouge sous ablation (clé remise) ; `grep -rn WHATSAPP_WEBHOOK_IPS takussan-api` → rien
      hors tickets et pistes ; `check-webhook-env-keys` et `check-env-parity` verts.*
- [x] **AC2** — `sms.lafricamobile.dlr_signature_ttl_days` est déclaré, à 7 par défaut. *Mesuré :
      `test_the_lam_return_url_ttl_is_declared` vert, rouge sous ablation (déclaration retirée).*
- [x] **AC3** — La documentation ne cite plus `api.takussan.app`. *Mesuré :
      `grep -rn "takussan\.app" docs/integrations` → rien.*
- [x] **AC4** — Secret vide : un statut non signé est refusé (403) en `testing`, `local` et
      `production`, et la tentative n'est pas écrite. *Mesuré :
      `WhatsappStatusWebhookTest::test_missing_secret_rejects_an_unsigned_status_in_any_environment`
      vert ; ablation (retour du `if (app()->isProduction())`) → rouge, 200 au lieu de 403.*
- [x] **AC5** — Les tests WhatsApp existants signent désormais leurs statuts, et restent verts.
      *Mesuré : `php artisan test tests/Feature/Http/Webhook tests/Feature/Webhooks` → 81 verts
      (dont `WebhookJournalTest`, dont le statut WhatsApp est maintenant signé).*

## Hors périmètre

- Une allowlist d'IP pour Meta : la signature est le contrôle (TCK-283), ses IP de sortie ne se
  listent pas.

## Notes d'implémentation

- Re-mesure (2026-10-18, avant code) : `config/whatsapp.php` porte toujours la clé, sans lecteur ;
  `dlr_signature_ttl_days` absent de `config/` ; `docs/integrations/sms.md:78` sur `api.takussan.app` ;
  `WhatsappStatusController` laissait passer un statut non signé hors production. Les quatre points
  tenaient.
- Le quatrième point change le comportement en développement : un webhook WhatsApp local exige
  désormais `WHATSAPP_WEBHOOK_APP_SECRET`. Il n'est pas exercé localement (`.env.docker`).
- La préproduction n'a aujourd'hui aucune clé `WHATSAPP_*` (`docs/infra/hebergement.md`) : la route y
  rend 404 avant comme après.
