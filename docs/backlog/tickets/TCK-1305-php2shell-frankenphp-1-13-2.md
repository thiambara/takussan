---
id: TCK-1305
title: "PHP2Shell : l'image de l'API passe à FrankenPHP 1.13.2 (PHP 8.4.27), la progression d'envoi des sessions est coupée"
status: doing
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  adr:
    - docs/adr/0028-auto-hebergement-conteneurise-sur-le-vps.md
tags: [infra, securite, php, docker, api]
---

## Contexte

**PHP2Shell** — CVE-2026-109618 (corruption mémoire sur épuisement de `memory_limit` pendant
l'amorçage de la requête) et CVE-2026-109619 (état global périmé réutilisé par la requête suivante
du même processus, dont le chemin `session.upload_progress`) : exécution de code **sans
authentification**, CVSS v4 9,2, FrankenPHP cité parmi les SAPI touchées. Corrigé par PHP 8.2.35,
8.3.36, **8.4.27** et 8.5.12, publiés le 2026-10-21 ; tentatives d'exploitation relevées dès le
2026-10-17. Le seul correctif complet est la mise à jour.

Relevé du 2026-10-22, avant correctif :

| Où | Version | Exposé |
|---|---|---|
| VPS, `api`, `worker`, `worker-media`, `scheduler` de la préproduction | PHP **8.4.26** (image `preview`) | oui, `preview.api.takussan.com` |
| `takussan-api/Dockerfile` | `1.12.7-php8.4-bookworm` (commentaire : 8.4.25 — le tag a été reconstruit depuis) | — |
| Poste du porteur | PHP 8.4.6 (Homebrew) | non, `artisan serve` sur 127.0.0.1 |
| Hôte du VPS | aucun PHP | — |

**Aucun indice de compromission** relevé le 2026-10-22 : journaux Traefik du 2026-10-18 au
2026-10-22 (début de leur rotation) — aucun 5xx sur l'API, plus gros corps reçu 860 o (l'attaque
demande un multipart qui épuise la mémoire) ; aucune erreur fatale ni plantage dans la sortie des
conteneurs ; `docker diff` des quatre conteneurs limité à `bootstrap/cache` ; aucun processus
étranger ; `authorized_keys` et crons de l'hôte inchangés depuis le 2026-09-14. Les redémarrages
horaires des workers sont `--max-time=3600` (code 0, pas d'OOM).

## Delta

1. `takussan-api/Dockerfile` : `FRANKENPHP_TAG=1.13.2-php8.4-bookworm` (FrankenPHP 1.13.2,
   publication de sécurité dédiée — PHP 8.4.27, plus 4 vulnérabilités de FrankenPHP lui-même ; la
   1.13.0 en corrigeait 5). Notes de montée 1.13 relues : `num_threads`, Mercure, workers —
   rien de ce que le `Caddyfile` emploie ; en-têtes bornés à 16 Kio, lecture bloquée coupée après
   1 min (un envoi lent qui progresse ne l'est pas).
2. `takussan-api/docker/php.ini` : `session.upload_progress.enabled = 0` — défense en profondeur
   sur le chemin confirmé de CVE-2026-109619. Laravel n'appelle jamais `session_start()` et
   n'utilise pas les sessions natives : rien ne la lit.
3. Hors dépôt, le poste : `php@8.4` 8.4.27 lié à la place de `php` 8.4.6 (désinstallé).

`memory_limit = -1`, l'autre atténuation publiée, n'est **pas** retenue : elle ne vaut qu'en
attendant le correctif, et ôterait la seule borne mémoire par requête.

## Critères d'acceptation

- [ ] `deploy/takussan/smoke-api.sh image` vert sur l'image construite ; `frankenphp version` y
      rend `PHP 8.4.27`, `ini_get('session.upload_progress.enabled')` y rend `"0"`.
- [ ] Après promotion vers `preview` : `X-Build-Sha` de `preview.api.takussan.com` rend le commit,
      et `php -v` **dans chacun des quatre conteneurs en marche** rend 8.4.27.

## Reste sur dev

- AC2 : promouvoir `dev` vers `preview`, puis relever `X-Build-Sha` de `preview.api.takussan.com` et
  `php -v` dans `api`, `worker`, `worker-media` et `scheduler`. Le ticket passe `done` sur ce relevé.
