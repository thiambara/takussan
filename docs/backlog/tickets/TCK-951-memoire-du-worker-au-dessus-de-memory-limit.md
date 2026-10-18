---
id: TCK-951
title: "Les workers ont 384 Mo, au-dessus de `memory_limit` plus le RSS hors tas mesuré : c'est l'erreur de PHP qui arrête un job gourmand, plus le SIGKILL du noyau"
status: done
phase: P2
family: technique
estimate: XS
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-43--file-database-sous-charge--retry_after-verrous-jobs-qui-grossit"
tags: [infra, worker, memoire, compose, pistes]
---

## Contexte

Piste P43.04 (angle 43). Le service `worker` (`notifications-urgent,default`) avait
`mem_limit: 256m`, et PHP `memory_limit = 256M`. `memory_limit` ne compte que le tas de PHP : le
processus dépasse donc 256 Mio de RSS avant que PHP n'atteigne sa limite. Le noyau le tue alors par
SIGKILL : ni « Allowed memory size » au journal, ni `failed()`, et le job, resté réservé, est rejoué
après `retry_after` (une notification à moitié partie repart).

Décision du porteur (ligne Statut de la piste), recopiée mot pour mot :

> porteur (2026-10-18) : traité hors agents, en session : relever le RSS du worker au repos et sous un job lourd, puis `mem_limit` au-dessus de `memory_limit` plus cette marge

## Objectif utilisateur

Un job qui épuise sa mémoire échoue par l'erreur de PHP, lisible au journal et dans `failed_jobs`,
au lieu de disparaître sous un SIGKILL et d'être rejoué.

## Delta à produire

- `deploy/takussan/compose.api.yml` : `worker` passe de `mem_limit: 256m` à `384m`, avec le calcul
  en commentaire. `worker-media` (384m) est vérifié contre la même marge et ne change pas.

## Critères d'acceptation

- [x] **AC1** — Le RSS d'un worker au repos est relevé. *Mesuré par la session le 2026-10-18 sur la
      préproduction (`docker stats`) : `worker-1` 52,24 MiB / 256 MiB, `worker-media-1`
      48 MiB / 384 MiB ; `memory_limit` PHP = 256M dans les deux.*
- [x] **AC2** — Le RSS sous un job qui épuise `memory_limit` est relevé, dans l'image. *Mesuré le
      2026-10-18 par l'agent, image `ghcr.io/thiambara/takussan-api:local` (PHP 8.4.26, CLI,
      `opcache.enable_cli=0`), Laravel amorcé comme par `artisan` (script en notes) : au repos, RSS
      62 Mio pour 32 Mio de tas ; tas épuisé à 256 Mio → pic de RSS (`VmHWM`) 288,0 / 287,8 /
      288,1 Mio sur trois passages. Marge hors tas : **32 Mio**. Une image GD de 5000² (130 Mio)
      entre dans le tas (`memory_get_usage` le compte) : GD n'est pas une allocation hors tas dans
      cette image.*
- [x] **AC3** — `mem_limit` de `worker` est au-dessus de `memory_limit` plus cette marge, calcul en
      commentaire : 256 + 32 = 288 Mio ; 384m laisse 96 Mio à ce que PHP ne compte pas (tampons de
      libpq et de curl). `worker-media` (384m) tient la même marge. *Lu, `compose.api.yml` ;
      `docker compose -f deploy/takussan/compose.api.yml config` avec des variables factices
      (`IMAGE_TAG`, `REDIS_PASSWORD`, `API_ALIAS`, `.env` vide le temps de la commande) → sortie
      0 ; résolu : `worker` 402653184, `worker-media` 402653184 octets.*

## Hors périmètre

- Mesurer un job réel de la file `default` sous charge en préproduction : aucun job de cette file
  n'approche 256 Mio aujourd'hui ; la borne est posée sur le pire cas, le tas épuisé.
- Passer au worker un `memory_limit` sous la limite du conteneur (`php -d memory_limit=…`), l'autre
  branche de la piste : écartée par le porteur.
- Le `retry_after` et le rejeu d'un job tué (angle 43, autres pistes).

## Notes d'implémentation

- Re-mesuré le 2026-10-18 avant de modifier : `compose.api.yml` portait `worker` à `256m` et
  `worker-media` à `384m` ; `takussan-api/docker/php.ini:3` `memory_limit = 256M`. Le constat tient.
  Le mesureur avait relevé 283 Mio au pic sur macOS, hors image.
- **Premier essai faux, écarté** : avec des chaînes de 1 Mio, le pic de RSS ne montait qu'à 177 Mio
  pour 256 Mio de tas. Une allocation de 1 Mio occupe 257 pages d'un bloc de 2 Mio de Zend MM, qui
  n'en loge qu'une : le tas *réserve* 256 Mio sans les toucher tous. Des chaînes de 4 000 octets
  remplissent les blocs, et c'est le pire cas.
- Le script, lancé par `docker run --rm --entrypoint php -v "$PWD/rss.php:/tmp/rss.php:ro"
  ghcr.io/thiambara/takussan-api:local /tmp/rss.php tas` (ou `gd`) :

  ```php
  <?php
  function st(): array {
      $s = file_get_contents('/proc/self/status');
      preg_match('/VmRSS:\s+(\d+)/', $s, $r); preg_match('/VmHWM:\s+(\d+)/', $s, $h);
      return ['rss_mio' => round($r[1] / 1024, 1), 'pic_rss_mio' => round($h[1] / 1024, 1),
              'tas_mio' => round(memory_get_usage(true) / 1048576, 1), 'pic_tas_mio' => round(memory_get_peak_usage(true) / 1048576, 1)];
  }
  // Enregistrée AVANT Laravel, pour passer devant son gestionnaire, qui manquerait de mémoire.
  if (($argv[1] ?? 'tas') === 'tas') register_shutdown_function(function () { $GLOBALS['a'] = null; echo 'fatal   ', json_encode(st()), PHP_EOL; });
  require '/app/vendor/autoload.php';
  $app = require '/app/bootstrap/app.php';
  $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
  echo 'amorcé  ', json_encode(st()), PHP_EOL;
  if (($argv[1] ?? 'tas') === 'gd') { $im = imagecreatetruecolor(5000, 5000); echo 'gd 5000² ', json_encode(st()), PHP_EOL; exit; }
  $a = [];
  while (true) { $a[] = str_repeat('x', 4000); }
  ```
- `docker stats` compte la mémoire du cgroup, pas seulement le RSS du processus : le cache de
  fichiers s'y ajoute, mais le noyau le récupère avant de tuer.
