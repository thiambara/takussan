---
titre: "Créer le Compose de l'API de production depuis le gabarit, avec ses secrets propres rangés hors du VPS"
type: cle-env
tickets: [TCK-517, TCK-2456, TCK-2414]
cles: [APP_KEY, APP_ENV, OTP_PREVIEW_ENABLED, MAIL_MAILER, SESSION_SECURE_COOKIE, RADAR_PHONE_HMAC_KEY, PUBLIC_CACHE_REVALIDATE_URL, PUBLIC_CACHE_REVALIDATE_SECRET, EXPORT_RETENTION_DAYS]
creee: 2026-11-19
preview: fait
production: a-faire
---

## Quoi faire

[Plan, F3, étape 1](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md), contre `deploy/takussan/env.api.production.example` (**jamais** `environment.duplicate`) :

- Compose `donnees` déployé depuis `master` ; Compose `takussan-api-production`, domaine `api.takussan.com` ;
- `APP_KEY` neuve (`base64:`), `APP_HMAC_KEY` (action du 2026-11-16) et `RADAR_PHONE_HMAC_KEY` **distinctes de la
  préproduction**, rangées hors du VPS, empreintes portées au relevé ;
- `APP_ENV=production`, `OTP_PREVIEW_ENABLED=false`, `MAIL_MAILER=resend`, `SESSION_SECURE_COOKIE=true`, cookie
  `takussan_session` ;
- `PUBLIC_CACHE_REVALIDATE_URL` publique, secret partagé avec le front ;
- les clés des fournisseurs : l'export A1 (`~/Sauvegardes/vps-2026-09-13.tar.gpg`) date de deux mois et n'avait
  aucune clé SMS ni WhatsApp — **re-mesurer chaque clé** au lieu de la recopier.

⚠ La table de F3 est en retard sur le code : elle omet `APP_HMAC_KEY`, `RADAR_PHONE_HMAC_KEY`, `REVERB_*`,
`BROADCAST_CONNECTION` et `WHATSAPP_WEBHOOK_APP_SECRET`. Seul le gabarit fait foi.
⚠ La commande de déploiement « à reprendre » de la préproduction porte en dur `-p takussan-api-preview-4iza80` : la
réécrire avec le nom du projet de production.

## Comment vérifier

`https://api.takussan.com/up` rend 200 avec le commit dans `X-Build-Sha` ; le journal de `release` ne porte ni
`ERREUR` ni `AVERTISSEMENT` ; `php artisan about` affiche `production`.

## Historique

- 2026-11-19 · preview · fait · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : Compose `takussan-api-preview` déployé, 194 clés posées sur les 202 du gabarit (absentes : `EXPORT_RETENTION_DAYS` et `RADAR_WHATSAPP_ACCORD_V4_TEMPLATE`, qui ont un défaut dans le code, plus `AI_DAILY_BUDGET_PER_AGENCY_USD` et `VOICE_*`/`PHONE_VOICE_CODE_DRIVER`, couvertes par leurs actions) ; `SESSION_SECURE_COOKIE=true`
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : environnement Dokploy `production` vide
