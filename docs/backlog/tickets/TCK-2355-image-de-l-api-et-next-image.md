---
id: TCK-2355
title: "Image de l'API : jpegoptim installé et max_execution_time mesuré ; next/image sans options dangerously* en build"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  adr:
    - "docs/adr/0028-auto-hebergement-conteneurise-sur-le-vps.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-65--durée-des-appels-sortants-synchrones-dune-requête-http-face-aux-délais-de-php-du-serveur-web-et-de-traefik"
tags: [infra, image, media, next-image, deploy, pistes]
---

## Contexte

Réfs : **P10.10, P65.01** du fichier de pistes, `validé` par le porteur le 2026-10-25. Les deux
pistes étaient consignées dans [TCK-720](TCK-720-reglages-de-deploiement-du-porteur.md), « traité
hors agents, avec le déploiement ». Ce ticket fait leur part qui se fait sur le poste, sans serveur.

- **P10.10** : `config/media-library.php` déclare sept optimiseurs, dont Jpegoptim avec
  `--strip-all`, mais l'image n'en installait aucun : Spatie les saute sans rien dire, et le
  commentaire laissait croire que l'EXIF était retiré. `next.config.ts` déclarait
  `dangerouslyAllowSVG` et `dangerouslyAllowLocalIP` sans condition, et son commentaire tenait
  `preview` (800 px) pour la plus grande image servie.
- **P65.01** : `max_execution_time = 60` est la seule borne de durée d'une requête, et
  `hebergement.md` la disait équivalente au `fastcgi_read_timeout 60` de nginx sans l'avoir mesurée
  dans l'image FrankenPHP.

## Décision du porteur

- **P10.10** :
  > validé — validation du porteur (2026-10-25) : `dangerouslyAllowSVG` et `dangerouslyAllowLocalIP` conditionnés à `NODE_ENV !== 'production'`, commentaires `preview` corrigés, `jpegoptim` installé dans l'image de l'API pour retirer l'EXIF des photos de biens ; la ligne avatar de TCK-720 retirée (caduque depuis TCK-762)
- **P65.01** :
  > validé — validation du porteur (2026-10-25) : la mesure de `max_execution_time` dans l'image locale, inscrite dans `smoke-api.sh image`, et la correction de `docs/infra/hebergement.md` ; reste : les délais de Traefik et de Cloudflare, à relever sur le serveur

## Delta à produire

- [x] `takussan-api/Dockerfile` : `jpegoptim=1.4.7-1` (version de bookworm lue dans l'image de base).
- [x] `config/media-library.php` : le commentaire du bloc d'optimiseurs dit ce qui tourne vraiment.
- [x] `takussan-web/next.config.ts` : les deux options `dangerously*` valent
      `NODE_ENV !== 'production'` ; le commentaire de `deviceSizes` cite `full` (1600 px au plus).
- [x] `deploy/takussan/smoke-api.sh image` : `verifier_delai_d_execution` (ZTS, CLI, et une requête
      derrière `php_server`) et `verifier_exif_retire`.
- [x] `docs/infra/hebergement.md` (« Ce que Caddy reprend de l'ancien vhost nginx ») et le
      commentaire de `docker/php.ini`, selon la mesure.
- [x] TCK-720 : les lignes faites cochées, une ligne datée renvoie ici.

## Critères d'acceptation

- [x] AC1 (P10.10) — `jpegoptim` est dans l'image (`which jpegoptim`), et un JPEG à EXIF passé par
      la chaîne que la médiathèque construit depuis `config/media-library.php`
      (`OptimizerChainFactory::create`) en ressort sans EXIF. Sur l'image précédente, la même sonde
      sort en 1.
- [x] AC2 (P10.10) — sous `NODE_ENV=production`, `images.dangerouslyAllowSVG` et
      `images.dangerouslyAllowLocalIP` valent `false` ; sous `development`, `true`.
- [x] AC3 (P65.01) — `smoke-api.sh image` vérifie que PHP est ZTS, que `sleep(3)` meurt sous
      `max_execution_time=1` en CLI, et que derrière `php_server` une requête lit `60` dans
      `php.ini` et qu'une requête qui attend est coupée à sa borne (`500`).
- [x] AC4 (P65.01) — `hebergement.md` ne présente plus l'équivalence avec nginx sans sa mesure ni
      ses différences.

## Mesures (2026-10-25, image locale `local-l27`, FrankenPHP 1.13.2, PHP 8.4.27 ZTS, arm64)

| Mesure | Résultat |
|---|---|
| `php -i` dans l'image de base | `Thread Safety => enabled` |
| `php -d max_execution_time=1 -r 'sleep(3);'` | `Fatal error: Maximum execution time of 1 second exceeded`, code 255 |
| `ini_get('max_execution_time')` en CLI dans l'image | `0` (la CLI ignore la valeur de `php.ini`) |
| Derrière `php_server`, sans paramètre | `fini 60`, `200` |
| `set_time_limit(2)` puis `sleep(1)` | `200` à 1,00 s |
| `set_time_limit(2)` puis `sleep(5)` | `500` à 2,01 s, `PHP Fatal error: Maximum execution time of 2 seconds exceeded` au journal |
| JPEG à EXIF (Orientation = 6) passé par la chaîne de la config | EXIF retiré ; sur l'image précédente, EXIF gardé |
| Le même JPEG chargé puis réenregistré par GD (`Spatie\Image`) | aucun EXIF en sortie |

## Hypothèses

- **Seul jpegoptim est installé**, comme la décision le dit. Les six autres optimiseurs restent
  déclarés et absents. Les retirer du bloc serait un choix que la décision ne fait pas.
- **La borne de 60 s n'est pas attendue en entier** : la sonde la ramène à 2 s par
  `set_time_limit()`, et lit la valeur de `php.ini` à part. Ce qui est mesuré est le sens du
  minuteur (horloge ou processeur), qui ne dépend pas de la valeur.
- **Le smoke construit sous un tag à part** (`TAG=local-l27`), pour ne pas écraser l'image `local`
  d'un autre arbre. `smoke-api.sh` ne construit pas l'image : c'est son prérequis.
- `num_threads` et `max_wait_time` (la piste les citait) ne sont pas posés : la décision ne les
  retient pas.

## Hors périmètre

- **L'EXIF des ORIGINAUX** : la chaîne d'optimiseurs ne touche que les conversions. Mesuré : une
  conversion est réencodée par GD, qui n'écrit aucun EXIF, si bien que les conversions publiques
  n'en portaient déjà pas avant ce ticket. L'original d'une photo de bien garde le sien, position
  GPS comprise, sur le disque privé, servi par URL signée au seul détenteur de `viewRaw` (TCK-539).
  Le retirer demande de réencoder l'original au dépôt, comme `AvatarReencode` le fait pour l'avatar.
- Les délais de Traefik et de Cloudflare, à relever sur le serveur (reste de P65.01).
- La mesure en préproduction (`which jpegoptim` dans le conteneur déployé, AC4 de TCK-720).

## Notes d'implémentation

- Ablations du smoke : l'image précédente (`TAG=local`) rougit sur « jpegoptim absent » ;
  `set_time_limit(0)` dans la sonde rougit sur « la requête lente n'est pas coupée » (`200 5.01`).
- Ablations du test du front, une option à la fois remise à `true` : 1 rouge chacune.
- Le serveur de la sonde tourne sous `www-data` sans l'entrypoint (qui exigerait `APP_KEY` et la
  base) ; la sonde est écrite par `root` dans `public/`, qui n'appartient pas à `www-data`.
- FrankenPHP écrit l'erreur fatale au journal du serveur web (JSON, sur stderr) et rend un corps
  vide : nginx rendait `504` en abandonnant la réponse, ici PHP est arrêté et rend `500`.
