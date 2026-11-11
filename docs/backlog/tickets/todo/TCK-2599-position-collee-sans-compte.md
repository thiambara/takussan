---
id: TCK-2599
title: "Coller un lien Google Maps ou une position WhatsApp sans être connecté"
status: todo
phase: P1
family: back
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2600]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
tags: [back, geo, publish, audit-ux, app]
---

## Objectif utilisateur

Le propriétaire qui commence son annonce sans compte (TCK-2600) colle la position que son voisin lui a envoyée sur WhatsApp, comme le fait aujourd'hui l'utilisateur connecté.

## Contrat de données

Re-mesure sur `dev` (1bce3798a) : `POST /api/geo/resolve-link` (`GeoLinkController`, `routes/api/geo.php:30`) est sous `auth:sanctum` + `throttle:20,1`. Le reste de l'étape « Lieu » est déjà public (`/api/public/geo/regions|cities|neighborhoods`, `/api/public/amenities`).

- **À créer** : `POST /api/public/geo/resolve-link`, même corps (`{url}`), même réponse que la route authentifiée, servi par le même contrôleur.
- La route authentifiée reste (les appelants actuels ne changent pas).

## Direction UX / Artistique

Sans objet : ticket back. L'écran qui consomme ce contrat est dit dans « Hors périmètre ».

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md).
- Limiteur nommé par IP (`throttle:public-geo-link`, 10 par minute) ; la route authentifiée garde le sien.
- Le serveur ne suit que les hôtes qu'il suit aujourd'hui (liens Google Maps, liens courts, position WhatsApp) : aucune URL arbitraire n'est récupérée pour un anonyme.
- Aucune écriture : la résolution ne crée rien en base.

## Delta à produire

- [ ] Route `POST /api/public/geo/resolve-link` dans `routes/api/geo.php`, groupe `public/geo`, middleware `throttle:public-geo-link` (déclaré dans `AppServiceProvider`).
- [ ] Réutilisation de `GeoLinkController` et de sa FormRequest.
- [ ] Tests : `PublicGeoResolveLinkTest` — anonyme résout un lien Google Maps (200, mêmes champs que la route authentifiée) ; hôte hors liste refusé (422) ; 11ᵉ appel dans la minute → 429.

## Critères d'acceptation

- [ ] AC1 — Sans jeton, `POST /api/public/geo/resolve-link` avec un lien Google Maps rend la latitude et la longitude que rend la route authentifiée pour le même lien.
- [ ] AC2 — Un lien vers un hôte non suivi rend 422 sans requête sortante (vérifié par le faux client HTTP).
- [ ] AC3 — Le 11ᵉ appel d'une même IP dans la minute rend 429.

## Hors périmètre

- L'écran (TCK-2600).

## Notes d'implémentation

**Re-mesure (2026-11-11, branche `feat/audit-ux-app-lot-1`)** — la prémisse tient : la route
connectée était sous `auth:sanctum` + `throttle:20,1` (`routes/api/geo.php`, ligne 30 au relevé),
et `docs/features.md` § 1.1 annonçait déjà la route publique. **Un écart non dit par le ticket** :
`GeoResolveLinkRequest::authorize()` rendait `$this->user() !== null`. Réutiliser la FormRequest
telle quelle aurait rendu **403** à l'anonyme ; elle rend désormais `true` — la route connectée
reste gardée par `auth:sanctum`, qui court avant elle (le test `sans_compte_le_point_d_acces_est_ferme`
de `GeoLinkResolverTest` reste vert : 401). Aucune ressource n'est en jeu, la garde est la liste
d'hôtes de `GeoLinkResolver`, inchangée.

**Décisions** :

- La route est déclarée **hors** du groupe `Route::prefix('public/geo')` (même préfixe d'URL, même
  nom `public.geo.resolve-link`) : dans le groupe, elle aurait cumulé `public-read` (90/min) avec
  son propre limiteur, et chaque collage aurait consommé le seau de lecture du visiteur.
- Limiteur `public-geo-link` : 10/min, clé `geo-link-ip:<réseau>` par `clientNetwork()` (l'IP, ou
  son /64 en IPv6, comme `auth-register`), et **non** `visitorRateLimitKey()` : le ticket dit « par
  IP », et un jeton ne doit pas ouvrir un second seau sur la porte publique. Préfixe propre : aucun
  compteur partagé avec la route connectée.
- Ajouté à l'inventaire `IpRateLimitKeyTest::limiteurs()` (TCK-851) : la clé par /64 est gardée.

**Tests** : `tests/Feature/Geo/PublicGeoResolveLinkTest.php` (6 tests) — AC1 compare la réponse
publique à la réponse connectée pour le même lien court, et vérifie qu'aucune requête
`insert|update|delete` ne part ; position WhatsApp (`maps.google.com/maps?q=lat,lng`) ; AC2 trois
hôtes refusés et `Http::assertNothingSent()` ; AC3 10 verts, 11ᵉ en 429, une autre IP passe ;
épuiser la porte publique ne ferme pas la route connectée ; validation du corps identique.

**Ablations** (chacune rouge, restaurée par `cp`, md5 prouvé) : route retirée (4 rouges, 404) ;
`authorize()` remis sur le compte (3 rouges, 403) ; limite à 20 (AC3 rouge) ; clé sans IP (l'autre
IP rougit en 429) ; route connectée sur `public-geo-link` (le test d'indépendance rougit en 429).

**Non fait ici** : AC2 « sans requête sortante » ne doit rien à ce ticket — c'est
`GeoLinkResolver`, déjà éprouvé par `GeoLinkResolverTest`. Le front (TCK-2600) appellera la route
publique ; `takussan-web/src/types/geo.ts` et `useReferentielGeo.ts` ne sont pas touchés.
