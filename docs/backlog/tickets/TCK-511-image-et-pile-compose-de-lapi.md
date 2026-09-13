---
id: TCK-511
title: "API — une image FrankenPHP par commit et sa pile Compose, éprouvées en local"
status: done
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: []
blocks: [TCK-513]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, back, docker, frankenphp, adr-0028]
---

## Objectif utilisateur

Que l'API, ses files et son planificateur tournent partout depuis la même image, construite une fois
par commit, au lieu d'un `composer install` rejoué sur le serveur à chaque déploiement.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md) §3 à §5 et §8.
Code complet et tests : [plan, tâches B1 et B2](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#tâche-b1--limage-de-lapi).

## Contraintes strictes (métier)

- Aucun `.env` dans l'image : le poste en porte de réels, ignorés par git mais pas par Docker.
- Aucune configuration cuite au build ; `config:cache` au démarrage, jamais pour `release` et `seed`.
- Caddy sans `trusted_proxies` : seul Laravel remonte `X-Forwarded-For` (ADR-0028 §8).
- La file `media` et la file `default` ont chacune un consommateur (`scripts/check-queues.mjs`).

## Delta à produire

- [x] `takussan-api/Dockerfile`, `.dockerignore`, `docker/{Caddyfile,php.ini,entrypoint.sh,lib.sh,release.sh,seed.sh}`
- [x] `deploy/takussan/compose.api.yml`, `deploy/takussan/.env.smoke.example`
- [x] `deploy/takussan/smoke-api.sh image|pile`

## Critères d'acceptation

- [x] AC1 — `smoke-api.sh image` rend ses `✓` (dix depuis les deux vérifications ajoutées à l'exécution)
- [x] AC2 — l'ablation de `.env*` dans `.dockerignore` fait rougir `smoke-api.sh image` en nommant le fichier
- [x] AC3 — `smoke-api.sh pile` rend ses `✓` (release idempotent, files consommées, en-têtes, taille de corps, redémarrages, seed)
- [x] AC4 — chaque ablation du tableau de B2 fait rougir la vérification qu'elle vise

## Hors périmètre

- Le workflow qui construit et pousse l'image (TCK-513).

## Notes d'implémentation

**2026-09-13, branche `feat/auto-hebergement-dokploy`.** Image FrankenPHP
`1.12.7-php8.4-bookworm` (PHP 8.4.25), le même tag que CheckPrint Plus.

- AC1 — `smoke-api.sh image` : dix `✓`, code 0. Les deux ajoutées : la sonde de l'image de base est
  annulée (`HEALTHCHECK NONE`), et `artisan tinker` tourne sous `www-data`.
- AC2 — ablation de `.env*` dans `.dockerignore`, jouée dans une copie `rsync` qui exclut les `.env`
  réels du poste, avec un `.env` sonde : `✗ 1 fichier(s) .env* dans l'image`, code 1. Un premier
  passage avait rendu un faux vert — son build avait échoué, et le test avait visé l'image
  précédente ; le script d'ablation s'arrête désormais sur un build raté.
- AC3 — `smoke-api.sh pile` : dix `✓`, code 0, seed compris (7 min). Mémoire au repos : api 65 Mio
  sur 384, worker 46 sur 256, worker-media 46 sur 384, scheduler 43 sur 192.
- Ce que la pile a révélé, corrigé dans l'image : la sonde de santé héritée de `dunglas/frankenphp`
  (`curl localhost:2019/metrics`, admin de Caddy coupé) déclarait worker et scheduler malades ;
  `/config/psysh` manquait à `www-data` ; `request_body { max_size 25MiB }` ne rendait jamais `413`
  sur l'en-tête (matcher `Content-Length` ajouté ; un envoi chunked de plus de 25 Mio est borné sans
  `413`). Et dans le test : plus de `--wait`, `run --pull never`, sonde de file sérialisable
  (`Artisan::queue('inspire')`) — détail au § Écarts du plan.
- AC4 — ablations, chacune jouée sur la pile, fichier restauré et `md5` contrôlé :
  - `media` retirée de `worker-media` → `✗ 1 job(s) jamais consommé(s) : media`, code 1 ;
  - limite abaissée à 20 Mio → `✗ un corps de 24 Mio est refusé`, code 1 ;
  - bloc `@cache_hidden` retiré → `✗ /.htaccess n'est pas refusé`, code 1 ;
  - écriture du marqueur retirée de `release.sh` → `✗ un second release réimporte`, code 1.
- Défaut du test trouvé par les ablations : au premier passage, deux d'entre elles ont rougi sur
  « le premier release n'a pas importé Property », une vérification qu'elles ne touchaient pas.
  Cause : `compose logs release | grep -q …` sous `pipefail` — `grep -q` sort à la première
  correspondance, l'écrivain prend SIGPIPE (141) et le pipeline échoue selon le minutage
  (`seq 1 200000 | grep -q '^1$'` → 141). Toute sortie est désormais capturée avant d'être
  cherchée, dans les deux tests de fumée et dans `bootstrap.sh`, ici et côté CheckPrint Plus.
  Les deux ablations rejouées rougissent alors sur leur propre vérification.
- Non couvert : l'ablation « `release` sans son entrypoint » du plan. Sans surcharge, `release`
  lance le serveur et bloque `up` ; avec `command:`, elle resterait verte, puisque l'environnement de
  fumée pose `SCOUT_QUEUE=false`. Le test ne distingue donc pas un `release` qui saute
  `release.sh` — trou connu, à fermer si le Compose change.
