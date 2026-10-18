---
id: TCK-926
title: "robots.txt ancré, noindex des passages interdits et de tout ce qui n'est pas la production"
status: done
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

- [x] `CHEMINS_INTERDITS_AUX_ROBOTS` : `/<segment>/` et `/<segment>$` au lieu de `/<segment>`.
- [x] Test : aucune règle `Disallow` ne frappe un fichier servi à la racine (`src/app`, `public`).
- [x] `robots: { index: false, follow: false }` sur les layouts des passages interdits
  (l'écran de maintenance, composant client, passe dans `EcranDeMaintenance.tsx`, rendu par une
  page serveur qui porte la métadonnée).
- [x] Proxy : `X-Robots-Tag: noindex, nofollow` quand `origineSite()` n'est pas
  `ORIGINE_PRODUCTION`.
- [x] API : middleware global `X-Robots-Tag: noindex, nofollow` quand l'origine d'`APP_URL`
  n'est pas celle de l'API de production.

## Critères d'acceptation

- [x] AC1 — `/apple-icon.png`, `/icon.svg`, `/favicon.ico` ne sont frappés par aucune règle ;
  `/app`, `/app/x`, `/publish` le restent ; `/appartements` ne l'est pas.
- [x] AC2 — Les layouts de `/publish`, `/onboarding`, `/invitations` et `/super-admin`, et la page
  `/maintenance`, déclarent `robots: { index: false, follow: false }`.
- [x] AC3 — `SITE_URL` d'une préproduction → le proxy pose `X-Robots-Tag` ; sans `SITE_URL` ou
  sur l'origine de production → il ne le pose pas.
- [x] AC4 — API, `APP_URL` d'une préproduction → `X-Robots-Tag` sur `/` et sur une route `api/` ;
  `APP_URL` de production → absent.

## Notes d'implémentation

- Avant correctif : `sitemap.test.ts` 2 rouges (`/apple-icon.png` frappé par `/app`, sosie
  `/appartements` aussi) ; `noindex-des-passages-interdits.test.ts` 5 rouges (`robots` absent) ;
  `proxy.noindex.test.ts` 5 rouges (aucun `X-Robots-Tag` hors production) ;
  `AddRobotsTagOutsideProductionTest` 3 rouges (`/`, une route `api/`, une route absente).
- Ablations : règles remises en `/<segment>` → 2 rouges ; `metadata` vidée sur `/publish` → 1
  rouge ; condition du proxy neutralisée → 5 rouges ; `append` du middleware retiré de
  `bootstrap/app.php` → 3 rouges. Tout remis → verts.
- `robots.test.ts` attendait `/app` littéral dans la liste : réécrit sur les deux règles ancrées.
  Le test des fichiers de la racine juge par la correspondance d'un moteur (préfixe, `*`, `$`),
  pas par appartenance à la liste.
- `maintenance/page.tsx` était un composant client. Un `layout.tsx` neuf pour sa métadonnée
  rougissait `check:i18n-namespaces` (toute frontière de rendu doit servir son dictionnaire) :
  l'écran est déplacé tel quel dans `EcranDeMaintenance.tsx`, et la page devient serveur.
- `bootstrap/app.php` est un déclencheur dur d'`impacted-tests` : la sélection vaut la suite
  entière, laissée à la CI.

