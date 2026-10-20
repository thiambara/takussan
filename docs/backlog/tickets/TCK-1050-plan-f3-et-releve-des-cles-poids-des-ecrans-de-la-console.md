---
id: TCK-1050
title: "Le plan F3 crée une production qui démarre et envoie ses courriels, le relevé des clés est à jour, et le rapport de poids voit la console (P70.06, P71.01 à P71.06)"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md
  plans:
    - docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md
tags: [infra, production, plan-f3, gardes, front, poids, pistes]
---

## Contexte

Le porteur a validé le 2026-10-20 sept pistes qui touchent des chemins fermés aux agents : le plan de
mise en service (table de la tâche F3), le relevé des clés de `docs/infra/`, le catalogue des drivers,
deux gardes et le workflow de CI du front. Elles sont faites en session.

- **P71.01** : F3 faisait générer l'`APP_KEY` de production sans le préfixe `base64:`, que Laravel
  refuse.
- **P71.02** : F3 aurait repris `APP_ENV=staging` et `OTP_PREVIEW_ENABLED=true` de la préproduction.
  Le code SMS serait alors revenu dans la réponse, en production.
- **P71.03** : F3 ne posait pas `MAIL_MAILER`, et la production aurait hérité du `log` de la
  préproduction.
- **P71.04** : F3 ne posait pas les listes d'IP des accusés SMS. En `production`, une liste vide
  refuse tous les accusés.
- **P71.05** : le relevé des clés de la préproduction s'arrêtait au 2026-10-10.
- **P71.06** : `GOOGLE_REDIRECT_URI`, `SESSION_DOMAIN` et `SESSION_COOKIE` manquaient à F3, et le nom
  du service de production était faux dans `prod-drivers.json`.
- **P70.06** : aucun rapport ne mesurait le poids des écrans de `/app` et de `/super-admin`.

## Objectif utilisateur

Le porteur qui crée l'environnement de production à partir de la table F3 obtient une API qui
démarre, qui envoie ses courriels, qui accepte les accusés SMS et qui ne rend jamais un code SMS
dans une réponse. Le poids de chaque écran de la console se lit dans le journal de la CI.

## Delta à produire

- Table F3 : `APP_KEY` avec `base64:` ; `APP_ENV`, `OTP_PREVIEW_ENABLED` et `PHONE_LOGIN_ENABLED` ;
  une ligne par driver de `prod-drivers.json` ; `SESSION_DOMAIN`/`SESSION_COOKIE`,
  `GOOGLE_REDIRECT_URI`, les trois `SMS_*_WEBHOOK_IPS` avec la vérification après déploiement, les
  jetons SMS et WhatsApp, et le motif de `CACHE_PREFIX` réécrit.
- `docs/infra/hebergement.md` : relevé du 2026-10-20 (86 clés, valeurs non secrètes dont F3 a
  besoin), et la phrase sur les clés `SMS_*`/`WHATSAPP_*` absentes corrigée.
- `docs/infra/prod-drivers.json` : `takussan-api-production`.
- `docs/ardoise.md` : le renvoi des listes d'IP vers F3, et non plus vers TCK-288.
- API : l'application refuse de démarrer quand `OTP_PREVIEW_ENABLED` est allumé avec l'`APP_URL` de
  production (`OtpPreview::refuserSurLaProduction()`, appelé au démarrage par `AppServiceProvider`).
  Le docblock d'`AddRobotsTagOutsideProduction`, qui disait la préproduction en `production`, est
  corrigé ; sa règle (juger par `APP_URL`) ne change pas.
- Gardes : `scripts/check-app-key-base64.mjs` (neuve, Repo CI) et `check-prod-drivers.mjs`, étendue
  à la table F3.
- Front : `scripts/poids-des-routes.mjs` imprime une seconde section pour les écrans de
  `(dashboard)` et `(super-admin)`, sans seuil, et l'étape de `web-ci.yml` est renommée.

## Critères d'acceptation

- [x] `node scripts/check-app-key-base64.mjs` sort en 0. Sur la table F3 d'avant, il sort en 1 et
      nomme la ligne 4156.
- [x] `node scripts/check-prod-drivers.mjs` vérifie les six drivers dans F3. Sur la table d'avant,
      il nomme les six lignes manquantes.
- [x] `OtpPreviewTest` : l'application construite par `bootstrap/app.php`, avec
      `OTP_PREVIEW_ENABLED=true`, `APP_URL=https://api.takussan.com` et `APP_ENV=staging`, refuse de
      démarrer. Sans l'appel dans `AppServiceProvider`, ce test rougit.
- [x] `poids-des-routes.test.ts` : la console a sa section, et un build sans écran de console sort
      en 2. Avec le script d'avant, 2 tests sur 8 rougissent.
- [x] Les pistes P70.06 et P71.01 à P71.06 passent à `fait · TCK-1050` (P71.04 avec son reste).

## Hors périmètre

- Les plages d'IP réelles des fournisseurs SMS (P71.04) : elles se demandent aux fournisseurs, et se
  posent au moment de F3.
- Un seuil de poids pour les écrans de la console : il se décide à part.
- Les pistes du réseau partagé de Dokploy (P74) : TCK-517.

## Notes d'implémentation

- Les valeurs de la préproduction sont relues dans Dokploy le 2026-10-20 (`compose.one` → `env`), par
  un script qui n'imprime que des clés non secrètes et des noms de clés.
- Le test du démarrage remet à neuf le dépôt statique d'`Env` (`Env::enablePutenv()`) : son écriture
  immuable réécrivait l'`APP_URL` de `.env`, qu'elle avait elle-même chargée. Il rend ensuite le
  conteneur global et les façades à l'application du test.
