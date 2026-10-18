---
id: TCK-880
title: "Un Redis et un nom d'API par environnement : Redis dans la pile d'API, alias ${API_ALIAS}, retrait de redis-takussan"
status: doing
phase: P1
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-832]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, docker, dokploy, redis, adr-0069, adr-0028]
---

## Contexte

[ADR-0069](../../adr/0069-deux-environnements-dokploy-configuration-hors-de-github.md) § 4, étape 4
de son Application. Avant :

- **Un seul Redis pour tous les environnements** : `redis-takussan`, dans le Compose `donnees` du
  projet *Serveur* (`deploy/server/compose.data.yml`), sur `dokploy-network`, un seul mot de passe.
  La préproduction y range son cache et ses sessions ; la production y aurait rangé les siens, à
  côté, séparés par un numéro de base et un préfixe (P05.09 demandait un `CACHE_PREFIX` par
  environnement pour que leurs verrous `onOneServer` ne se mêlent pas).
- **L'API se joint par l'hôte `api`.** Compose donne à chaque service le nom de son service sur
  chaque réseau : sur `dokploy-network`, que toutes les piles partagent, `api` désignera l'API de
  la préproduction **et** celle de la production. `hebergement.md` et `takussan-web/.env.example`
  prescrivaient `API_INTERNAL_URL=http://api:8080`.

Mesuré le 2026-10-18 sur le serveur : `redis-takussan` sert 1,65 Mo (pic 1,73 Mo), 17 clés, aucune
éviction, `maxmemory 128mb`, `volatile-lru`.

## Objectif utilisateur

Aucun conteneur d'un environnement ne peut lire le cache, les sessions ou l'API d'un autre, et un
nom d'hôte désigne toujours un seul service.

## Contraintes strictes

- Le Redis de la pile n'est que sur un réseau **propre à la pile** : ni `dokploy-network`, ni port
  publié.
- `REDIS_HOST` et `REDIS_PORT` sont écrits dans `compose.api.yml` (décision du porteur du
  2026-10-18, É1) : une valeur restée dans l'onglet Environment est sans effet.
- Le mot de passe est celui que la préproduction a déjà (`REDIS_PASSWORD`, 63 caractères ; décision
  É2) : aucun secret neuf à manipuler.
- **`API_INTERNAL_URL` n'est pas posée par ce ticket.** ADR-0052 § 6 et P37.03 la réservent au
  porteur, après une mesure depuis deux réseaux ; ce ticket lui donne seulement un nom juste à
  viser (`http://takussan-api-preview:8080`).

## Delta à produire

1. `deploy/takussan/compose.api.yml` : un service `redis` (`redis:8-alpine`, `appendonly`,
   128 Mo, `volatile-lru`, mot de passe, sonde, volume) sur un réseau `interne` ; `release`,
   `api`, `worker`, `worker-media`, `scheduler` et `seed` attendent qu'il soit sain ; `REDIS_HOST`
   et `REDIS_PORT` posés par `environment` ; l'alias `${API_ALIAS}` du service `api` sur
   `dokploy-network`.
2. `deploy/takussan/smoke-api.sh pile` et `.env.smoke.example` : la pile locale porte son Redis, et
   le smoke prouve que l'API répond sous son alias, que le Redis de la pile est injoignable depuis
   `dokploy-network`, et que le cache écrit dans ce Redis alors que le `.env` vise un autre Redis.
3. `scripts/check-reseau-par-environnement.mjs`, branchée dans `repo-ci.yml`.
4. Les documents : `hebergement.md`, `takussan-web/.env.example`, l'ardoise.
5. Sur le serveur, au déploiement de `preview` : `API_ALIAS=takussan-api-preview` dans l'onglet
   Environment de `takussan-api-preview`, `REDIS_HOST` et `REDIS_PORT` retirés de cet onglet.
6. Une fois la préproduction mesurée sur son Redis : `redis-takussan` retiré de
   `compose.data.yml`, le Compose `donnees` redéployé, ses clés `REDIS_TAKUSSAN_PASSWORD` et
   `REDIS_CPP_PASSWORD` retirées. Le volume est gardé une semaine, puis supprimé avec l'accord du
   porteur (décision É4).

## Critères d'acceptation

- [x] **AC1** — `node scripts/check-reseau-par-environnement.mjs` passe, et rougit sur chacune de
      ses six ablations (alias retiré, `redis` sur `dokploy-network`, port publié, `REDIS_HOST`
      retiré, `http://api:` dans un `.env.example`, service `redis` retiré).
- [x] **AC2** — `smoke-api.sh pile` passe, et rougit sur ses trois ablations (alias retiré, `redis`
      aussi sur `dokploy-network`, `REDIS_HOST` ôté du compose).
- [x] **AC3** — Sur le serveur, après le déploiement de `preview` : `X-Build-Sha` rend le commit
      promu ; une clé de cache écrite par l'API se lit dans le Redis de la pile
      (`takussan-api-preview-4iza80-redis-1`) et **pas** dans `redis-takussan` ; depuis un
      conteneur de `dokploy-network`, `redis` et le conteneur Redis de la pile ne répondent pas, et
      `takussan-api-preview` rend `/up` à 200.
- [ ] **AC4** — `redis-takussan` ne tourne plus ; aucun conteneur orphelin dans le Compose
      `donnees` ; la préproduction répond toujours (AC3 rejoué).

## Reste sur dev

Le code est sur `dev` depuis la PR #630 (2026-10-18), et AC3 est mesuré (notes). Il ne reste
qu'AC4 : `redis-takussan` quitte `compose.data.yml` par la PR qui porte cette ligne, puis le Compose
`donnees` se redéploie depuis `preview` (déploiement manuel, `autoDeploy` coupé).

## Hors périmètre

- `API_INTERNAL_URL` et `VISITOR_IP_TRUSTED_HOPS` sur `takussan-web-preview` : au porteur
  (ADR-0052 § 6, P37.03).
- La production : la même pile, avec `API_ALIAS=takussan-api-production`, en phase F (étape 6
  d'ADR-0069, TCK-517).
- P05.09 (`CACHE_PREFIX` par environnement) n'a plus d'objet : chaque environnement a son Redis.

## Notes d'implémentation

- **AC3, mesuré le 2026-10-18 sur le serveur**, après le déploiement de `b2804272` (`images.yml`
  vert) : `/up` public → `200`, `X-Build-Sha` = `b280427281868f745696e7b871c9d80ba799997c` ;
  `REDIS_HOST` vu par `api`, `worker`, `worker-media` et `scheduler` → `redis` ; une clé
  `Cache::put` → 1 dans `takussan-api-preview-4iza80-redis-1` (base 1), 0 dans `redis-takussan` ;
  depuis `dokploy-network`, `redis` et `takussan-api-preview-4iza80-redis-1` → « Could not
  connect » ; `takussan-api-preview:8080/up` → `200`. Avant la bascule, la même sonde rendait 1
  dans `redis-takussan`, 0 dans la pile, et `000` sous l'alias : elle sépare les deux états.
  ⚠ `api:8080` répond **encore** depuis `dokploy-network` : Compose donne toujours au service son
  nom sur chaque réseau. C'est pourquoi la garde refuse toute URL vers l'hôte `api` — le nom reste,
  personne ne doit le viser.

- **Mesures du 2026-10-18 sur le poste** (images reconstruites depuis la branche) :
  - garde : témoin vert ; les six ablations rougissent, chacune sur son message ;
  - `smoke-api.sh pile` : vert jusqu'au seed compris, après TCK-881 (le seed échouait avant, pour
    deux défauts sans lien avec ce ticket) ; le Redis de la pile tient 6,4 Mio après seed ;
  - ablations du smoke : alias retiré → « l'API ne répond pas sous son alias » ; `redis` aussi sur
    `dokploy-network` → « le Redis de la pile répond sur dokploy-network sous « redis » : NOAUTH » ;
    `REDIS_HOST` ôté → « la pile ne démarre pas » (le `.env` vise le Redis de développement, que
    `release` ne peut pas authentifier).

- Les sessions de la préproduction sont perdues au basculement (changement de Redis) : chacun se
  reconnecte. Accepté par le porteur (É4) : ni production, ni utilisateur réel.
