---
id: TCK-1358
title: "L'API refuse de démarrer sur l'origine de production avec un `APP_ENV` autre que `production`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#-être-la-production--se-juge-sur-deux-critères--app_env-pour-le-filtre-dip-lorigine-dapp_url-pour-le-seul-refus-de-démarrer"
tags: [back, securite, demarrage, pistes]
---

## Objectif utilisateur

Une API de production mal configurée (`APP_ENV` resté `staging`, ou mal orthographié) ne sert
jamais : son `release` échoue au démarrage, et l'ancienne version continue de servir, au lieu de
démarrer avec le filtre d'IP des accusés SMS ouvert à tout appelant.

## Contexte

Réf : **P106.03** du fichier de pistes, `validé` (critère V5 cité par le classement, accordé).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `45fd976b2`) : `bootstrap/app.php`
démarré avec `APP_URL` = `AddRobotsTagOutsideProduction::PRODUCTION_ORIGIN`, `APP_ENV=staging`,
aperçu des codes éteint → le démarrage passe. La mesure du mesureur (2026-10-22) établissait déjà
que le filtre d'IP laisse alors passer un accusé Orange sans liste.

## Décision du porteur

> (a) : au démarrage, refuser une `APP_URL` d'origine production avec un `APP_ENV` autre que `production`, à côté de `refuserSurLaProduction` et testé de même par `bootstrap/app.php` (porteur, 2026-10-22)

## Hypothèses (mode sans humain)

- « Autre que `production` » est jugé à la lettre : `Production` et `prod` sont refusés, comme
  `staging` et `local`.
- Le refus est appelé juste après `OtpPreview::refuserSurLaProduction()`, pour que le message de
  l'aperçu, plus précis, reste celui qu'on lit quand les deux fautes sont réunies (test existant
  d'`OtpPreviewTest`).
- Aucun fichier de déploiement ni d'environnement ne pose l'origine de production aujourd'hui
  (`grep APP_URL deploy .github` : seul `http://localhost:8080` du test de fumée).

## Delta à produire

- [x] `App\Support\ProductionOrigin::refuserUnAutreAppEnv()`.
- [x] Appel dans `AppServiceProvider::boot()`, à côté de `OtpPreview::refuserSurLaProduction()`.
- [x] Test : `ProductionOriginAppEnvTest` (démarrage entier par `bootstrap/app.php`, et la méthode
  sur quatre `APP_ENV` mal nommés et deux cas qui démarrent).

## Critères d'acceptation

- [x] AC1 — `bootstrap/app.php`, origine de production, `APP_ENV=staging` → `RuntimeException`
  au démarrage, qui nomme `APP_ENV=staging`.
- [x] AC2 — `staging`, `prod`, `Production`, `local` sur l'origine de production → refusés.
- [x] AC3 — `production` sur l'origine de production, et `staging` sur une autre origine →
  démarrent.

## Hors périmètre

- La seconde voie de la piste (liste d'autorisation des environnements dans
  `RestrictIpMiddleware`) : la décision retient (a).

## Notes d'implémentation

- Ablation : l'appel retiré d'`AppServiceProvider::boot()` → AC1 rouge (les cas de la méthode
  restent verts, ils l'appellent directement) ; remis → 6 verts.
- La garde des agents refuse une commande shell qui contient le nom du domaine de production :
  le test emploie la constante `PRODUCTION_ORIGIN` et une origine `example.test`.
