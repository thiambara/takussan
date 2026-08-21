---
id: TCK-341
title: "Le catalogue public se recalcule pour chaque visiteur"
status: doing
phase: P2
family: technique
estimate: S
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [back, performance, cache]
---

## Objectif utilisateur

> ⚠ **Le titre de ce ticket est faux, et son objectif d'origine aussi.** Ils sont
> conservés tels quels — un ticket qui réécrit son propre énoncé efface la trace de ce
> qu'on croyait en l'ouvrant.
>
> L'objectif écrit était : *« deux visiteurs anonymes qui demandent la même page de
> résultats ne la font pas calculer deux fois »*. **Aucun des deux mécanismes livrés
> ici ne produit cela, et aucun ne le pouvait.** Mesuré le 2026-08-21,
> `SetCacheHeaders::handle()` appelle `$next($request)` **d'abord** : la recherche
> Meilisearch est jouée, la ressource sérialisée, et c'est ce corps-là qui sert à
> calculer l'ETag avant d'être jeté. 12 exécutions de chaque côté sur
> `?per_page=20` (macOS, 8 cœurs, `load average` 6,26) :
>
> | | médiane | octets |
> |---|---|---|
> | 200 | **67,2 ms** | 18 019 |
> | 304 | **64,6 ms** | 0 |
>
> Les 2,6 ms d'écart sont le temps d'écrire 18 ko sur la boucle locale. **Un ETag
> économise des OCTETS, jamais un calcul.** « Ne pas faire calculer deux fois »
> demande un cache applicatif — que ce ticket range lui-même en hors périmètre.
>
> **L'objectif réellement tenu** : le catalogue public ne fait plus voyager des
> octets identiques, et surtout il n'autorise aucun cache partagé à mélanger deux
> visiteurs.

## Ce que la mesure a trouvé, et qui change la réponse

**Le corps du catalogue public varie avec l'appelant, sur des routes qui ne portent
pas `auth:sanctum`.**

`PropertyResource` émet `rejection_reason`, `submitted_at`, `approved_at`,
`rejected_at` — et l'e-mail d'un collaborateur — dès que `$request->user() !== null`.
On pouvait croire les routes publiques hors d'atteinte : elles n'ont pas de middleware
d'authentification, le garde par défaut est `web` (session) et le groupe `api` ne monte
pas `StartSession`. **C'est faux.** `ResolveActiveProfile:39-56` résout délibérément un
porteur Bearer et le pose sur le garde par défaut (`Auth::setUser()`), sur tout
`api/*`, pour que les endpoints à authentification optionnelle fonctionnent (TCK-179).

Mesuré sur `/api/public/properties/{slug}` avec un jeton Sanctum réel : **4 clés de plus
qu'en anonyme**. La rendre `Cache-Control: public` aurait donc laissé un cache partagé
resservir la variante authentifiée au visiteur suivant — **défaisant en silence ce que
TCK-335 venait tout juste de retirer**.

## Delta produit

| route | avant | après | pourquoi |
|---|---|---|---|
| `/public/properties/search` | `no-cache, private`, pas d'ETag | **`cache.headers:etag`** — ETag + 304, **pas** `public` | appelée depuis le NAVIGATEUR (`useSearch.ts:218`), donc la revalidation est réelle ; `public` est refusé pour la raison ci-dessus, et `cache.headers` ne sait pas émettre de `Vary` |
| `/public/properties/{slug}` | `no-cache, private` | **inchangé, et c'est un refus motivé** | (1) même variance, plus l'e-mail d'un collaborateur ; (2) `show()` **écrit** — elle incrémente `views_count`, que la même ressource émet : deux appels anonymes successifs rendent 1 puis 2, un ETag n'y serait stable qu'une fois les 3 crédits horaires du `RateLimiter` épuisés ; (3) même stable, il ne servirait à personne — la fiche est cherchée par le **serveur** Next, dont le `fetch` est `no-store` par défaut |
| `/public/properties/discovery` | `public, max-age=60, s-maxage=300`, `Vary: Origin` seul | **`Vary: Accept-Language, Authorization`** ajouté, commentaire corrigé | **le seul défaut de ce ticket qui vivait en production** |

**Le défaut de `discovery` mérite d'être nommé.** Le `public` y était posé depuis
TCK-247 ; le commentaire qui le justifiait affirmait *« the list shape of
PropertyResource pins its labels to `fr` and reads nothing off `$request->user()` »* —
**les deux moitiés étaient fausses au moment où on les lisait**. Mesuré le 2026-08-21
sur `per_row=3`, md5 du corps : fr `2c3d8e8a…`, en `5b51577c…`, wo `858389fb…`. Trois
corps distincts servis `s-maxage=300` sous une seule entrée de cache : un visiteur
anglophone recevait la page d'un francophone, et rien ne pouvait le signaler.

`Vary` est posé **en ajout** : `Origin` n'y est pas répété, le middleware CORS
l'ajoute lui-même à chaque réponse. Vérifié par requête réelle — la réponse sort avec
`Vary: Accept-Language, Authorization, Origin` et son `Access-Control-Allow-Origin`
intact.

## Compression — mesurée, corrigée dans le fichier, PAS déployée

Le vhost de `scripts/server-setup.sh` ne portait **aucune** directive de compression,
et le défaut de nginx est `gzip off`. Mesuré le 2026-08-21 sur la préproduction —
nginx/1.24.0 (Ubuntu), `GET /api/public/properties/search?per_page=20` :

```
Accept-Encoding: identity   → 21 300 octets
Accept-Encoding: gzip       → 21 300 octets, AUCUN Content-Encoding
Accept-Encoding: gzip, br   → 21 300 octets, AUCUN Content-Encoding
```

Le même corps passé à `gzip -6` rend **3 222 octets, soit 15,1 %** : 85 % de la charge
utile de recherche voyageait pour rien, sur un marché où le mobile domine. Le bloc
(`gzip on; gzip_vary on; gzip_proxied any; gzip_types application/json;
gzip_min_length 1024;`) est ajouté au vhost.

⚠ **Écrire ce bloc ne le déploie pas.** Aucun workflow de ce dépôt n'exécute
`server-setup.sh` — ni `deploy.yml`, ni la CI. Il faut le relancer à la main sur le
serveur, puis `nginx -t` et `systemctl reload nginx`. **La re-mesure d'après — celle
qui prouvera qu'un `Content-Encoding: gzip` sort enfin — attend un humain**, et ce
ticket la laisse ouverte plutôt que de la déclarer faite (AC5).

## Critères d'acceptation

> **Les trois AC d'origine étaient cochables par une régression silencieuse**, et l'un
> des trois était vrai avant d'écrire une ligne. Ils sont conservés en regard de leur
> remplaçant, parce que c'est le défaut lui-même qui vaut d'être gardé sous les yeux.
>
> | AC d'origine | ce qui le cochait sans rien tenir |
> |---|---|
> | AC1 — *« une seconde requête identique portant `If-None-Match` rend 304 »* | un ETag **constant**. Il rendrait 304 à tous les coups, y compris sur du périmé — **pire que pas de cache du tout** — et cocherait l'AC parfaitement. |
> | AC2 — *« deux locales différentes ne partagent pas la même entrée de cache »* | un `Vary: Accept-Language` posé sur une réponse qui ne varie **pas** avec la locale. L'en-tête est là, l'AC est coché, rien n'est prouvé. |
> | AC3 — *« aucune surface authentifiée ne devient cacheable **par ce changement** »* | **rien du tout : il était vrai avant d'ouvrir le ticket.** Et il resterait vrai le jour où l'on rendrait `/api/me` cacheable, puisque ce ne serait plus « par ce changement ». Une tautologie datée. |

- [x] **AC1 — la revalidation fonctionne ET l'ETag suit le contenu.** Deux appels
      identiques à `/public/properties/search` : le second, avec `If-None-Match`, rend
      **304**. Et après ajout d'un bien au catalogue, le **même** `If-None-Match` rend
      **200 avec un ETag différent**. *La seconde moitié est celle qui compte : sans
      elle, un ETag constant coche l'AC en servant du périmé.*
- [x] **AC2 — deux locales produisent deux ETags DISTINCTS.** `Accept-Language: fr` et
      `Accept-Language: wo` sur `/public/properties/search` rendent deux corps
      différents et deux ETags différents, et l'ETag du français ne vaut **pas**
      revalidation en wolof (200, pas 304). Idem pour `discovery`, dont le `Vary`
      annonce `Accept-Language` **et** dont le corps varie réellement — la prémisse est
      assertée avant l'en-tête.
- [x] **AC3 — aucune route de l'application, à aucun moment, ne porte à la fois un
      middleware d'authentification et un cache partagé.** Plus de « par ce
      changement » : une propriété, vérifiable en tout temps, sur le **routeur réel**
      (`Route::gatherRouteMiddleware()`, qui résout les alias — `gatherMiddleware()`
      ne les résout pas et faisait compter **zéro** route de cache partagé, donc
      passer au vert sans rien comparer). Doublée d'une garde statique en CI,
      `scripts/check-cache-headers-auth.mjs`, parce que les deux se trompent
      différemment.
- [x] **AC4 — la fiche `{slug}` n'autorise aucun cache partagé tant que son corps
      varie avec l'appelant.** Le test asserte les **deux** : que le corps diverge avec
      un jeton Sanctum réel, et que la réponse ne porte ni `public` ni `s-maxage`. Si
      la divergence disparaît un jour, le premier rougit — et c'est voulu : la décision
      doit alors être **relue**, pas contournée.
- [ ] **AC5 — la compression est active en préproduction.** *Ouvert, et il ne peut pas
      être fermé depuis le dépôt* : le bloc gzip est écrit dans `server-setup.sh`, mais
      aucun workflow ne l'exécute. À fermer par `curl -H 'Accept-Encoding: gzip'
      https://preview.api.takussan.com/api/public/properties/search?per_page=20`
      montrant un `Content-Encoding: gzip` — après relance manuelle du script,
      `nginx -t` et `systemctl reload nginx`.

## Vérifié par ablation

Un test vert ne prouve rien s'il serait vert sans le correctif. Les quatre :

| ablation | attendu | mesuré |
|---|---|---|
| retirer `cache.headers:etag` de `search` | rouge | **3 échecs** |
| retirer le `Vary` de `discovery` | rouge | **2 échecs** |
| rendre `{slug}` `cache.headers:public;max_age=60;etag` (ce que le ticket demandait) | rouge | **1 échec** |
| forcer un **ETag constant** sur `search` | rouge | **3 échecs**, dont *« l'ETag change quand le catalogue change »* — celui écrit exprès contre cette régression |

Et la garde, par mutation : `cache.headers:public` ajouté à une route sous
`auth:sanctum` → rouge ; la route `enums` **déplacée** dans un groupe `auth:sanctum`
sans y toucher → rouge ; la route de `SuggestController` (en-tête posé dans le
contrôleur) passée sous `auth:sanctum` → rouge.

## Hors périmètre

- Un cache applicatif (Redis) devant Meilisearch. **C'est pourtant le seul mécanisme
  qui tiendrait l'objectif d'origine de ce ticket** (cf. encadré en tête).
- **Le delta front, et il faut le dire parce qu'il conditionne l'effet.** La fiche
  `{slug}` est cherchée par le **serveur** Next
  (`takussan-web/src/lib/queries/public-property.ts:63`), et le `fetch` de Next 16 est
  `no-store` par défaut : sans un `next: { revalidate: … }` côté front, un `max-age`
  sur `{slug}` ne produirait **aucun effet mesurable**. Ce n'est pas dans ce ticket,
  et ce n'est pas fait. `search`, elle, part du navigateur (`useSearch.ts:218`) — d'où
  l'asymétrie de traitement entre les deux routes.
- **`SuggestController` pose `public, max-age=60` à la main, sans `Vary`.** Contrôlé
  le 2026-08-21 : son corps ne varie **pas** avec la locale (md5 identiques en fr, en
  et wo), donc pas de défaut sur cet axe. Sa variance avec un porteur Bearer n'a pas
  été mesurée — hors périmètre, à ouvrir si quelqu'un met un CDN devant l'API.

## Notes d'implémentation

Fichiers touchés : `takussan-api/routes/api/public.php`,
`takussan-api/app/Http/Controllers/Public/PublicPropertyController.php` (méthode
`discovery` seulement), `takussan-api/tests/Feature/Public/CataloguePublicCacheTest.php`,
`scripts/check-cache-headers-auth.mjs`, `.github/workflows/repo-ci.yml`,
`scripts/server-setup.sh`.

⚠ La prose du bloc gzip vit **hors** du heredoc `<<NGINX`, qui n'est pas quoté :
`scripts/check-heredocs.mjs` a refusé la première rédaction, backticks compris dans des
lignes commençant par `#`. C'est le même piège qui a déjà fait exécuter une fonction en
root depuis un commentaire de ce fichier.

## Reste sur dev

**Tout le delta versionnable est fusionné. Il reste UNE action, et elle n'est pas dans le dépôt.**

AC1 à AC4 sont fermés par `tests/Feature/Public/CataloguePublicCacheTest.php` et par
`scripts/check-cache-headers-auth.mjs`, rejouée à chaque PR. **AC5 ne peut pas être fermé depuis
ici** : le bloc gzip est écrit dans `scripts/server-setup.sh`, et **aucun workflow de ce dépôt
n'exécute ce script** — `deploy.yml` ne touche pas au vhost.

Ce qui le ferme, sur le serveur de préproduction :

```bash
# relancer scripts/server-setup.sh (ou reporter son bloc gzip dans le vhost), puis
nginx -t && systemctl reload nginx
curl -sI -H 'Accept-Encoding: gzip' \
  https://preview.api.takussan.com/api/public/properties/search?per_page=20 | grep -i content-encoding
```

La mesure d'AVANT est consignée pour qu'on puisse comparer : **21 300 octets identiques** en
`identity`, `gzip` et `br`, aucun `Content-Encoding` — nginx/1.24.0, dont les défauts Ubuntu
expliquent exactement le relevé (`gzip_types` vaut `text/html` seul, et `gzip_proxied off` écarte
les réponses FastCGI). `gzip -6` sur le même corps rend **3 222 octets, soit 15,1 %**.

*C'est le poste le plus rentable de tout le lot, et de loin* : il divise par ~6,6 ce que l'API met
sur le fil, quand l'ETag n'économise que les octets d'une réponse déjà calculée et que les sparse
fieldsets en valaient 123.

