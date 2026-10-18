---
id: TCK-926
title: "robots.txt ancré, noindex des passages interdits et de tout ce qui n'est pas la production"
status: doing
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#210-pages-légales-publiques"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-19"
tags: [front, back, seo, pistes]
---

## Contexte

Réf : **P34.05** du fichier de pistes, `validé` par le porteur (critères accordés : V5 et V7).

`robots.txt` interdit `/app` sans barre finale, donc aussi `/apple-icon.png`, servi à la racine.
`/publish`, `/onboarding`, `/invitations`, `/maintenance` et `/super-admin` sont interdits aux
robots sans déclarer `noindex`. Rien ne pose `noindex` hors de la production : la préproduction
n'a, contre l'indexation, que l'authentification basique de Dokploy, et l'API aucune.

## Décision du porteur

`Disallow: /app/` et `/app$` avec un test contre les fichiers de la racine, `robots: { index: false }` sur les passages interdits, `noindex` (front et API) dès que l'origine n'est pas celle de la production

## Reste à faire

la commande de F3, hors agents en session

## Objectif utilisateur

Aucun moteur n'indexe la préproduction ni une surface interne, et l'icône Apple du site reste
explorable.

## Hypothèses (mode sans humain)

- « Passages interdits » : toute surface de `CHEMINS_INTERDITS_AUX_ROBOTS` qui sert des pages et
  ne déclarait pas `noindex` — `/publish`, `/onboarding`, `/invitations`, `/maintenance` et
  `/super-admin` (`/app` et `/auth` le déclaraient déjà, `/admin` ne sert aucune page).
- L'origine de production du front est `ORIGINE_PRODUCTION` (`config-publique.ts`) ; celle de
  l'API est l'`APP_URL` de la table de l'API de production du plan F3 étape 1
  (`docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md`), comparée à l'origine d'`APP_URL`.
  Aucune variable neuve.
- Le `noindex` hors production passe par l'en-tête `X-Robots-Tag: noindex, nofollow`, et non par
  `Disallow: /` : un moteur qui ne peut pas charger une page ne lit jamais son `noindex`
  (en-tête de `robots.ts`). Côté front, le proxy le pose sur ce qu'il voit (les pages) ; côté API,
  un middleware global sur toutes les réponses.

## Delta à produire

- [ ] `CHEMINS_INTERDITS_AUX_ROBOTS` : `/<segment>/` et `/<segment>$` au lieu de `/<segment>`.
- [ ] Test : aucune règle `Disallow` ne frappe un fichier servi à la racine (`src/app`, `public`).
- [ ] `robots: { index: false, follow: false }` sur les layouts des passages interdits
  (`maintenance/layout.tsx` neuf : la page est un composant client).
- [ ] Proxy : `X-Robots-Tag: noindex, nofollow` quand `origineSite()` n'est pas
  `ORIGINE_PRODUCTION`.
- [ ] API : middleware global `X-Robots-Tag: noindex, nofollow` quand l'origine d'`APP_URL`
  n'est pas celle de l'API de production.

## Critères d'acceptation

- [ ] AC1 — `/apple-icon.png`, `/icon.svg`, `/favicon.ico` ne sont frappés par aucune règle ;
  `/app`, `/app/x`, `/publish` le restent ; `/appartements` ne l'est pas.
- [ ] AC2 — Les layouts de `/publish`, `/onboarding`, `/invitations`, `/maintenance` et
  `/super-admin` déclarent `robots: { index: false, follow: false }`.
- [ ] AC3 — `SITE_URL` d'une préproduction → le proxy pose `X-Robots-Tag` ; sans `SITE_URL` ou
  sur l'origine de production → il ne le pose pas.
- [ ] AC4 — API, `APP_URL` d'une préproduction → `X-Robots-Tag` sur `/` et sur une route `api/` ;
  `APP_URL` de production → absent.

## Notes d'implémentation
