---
id: TCK-1073
title: "Les disques R2 passent un délai de connexion et un délai total à Guzzle"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-65--durée-des-appels-sortants-synchrones-dune-requête-http-face-aux-délais-de-php-du-serveur-web-et-de-traefik"
tags: [api, medias, r2, delais, pistes]
---

## Contexte

Réf : **P65.05** du fichier de pistes, `validé` (V5 : la valeur du délai se choisit). Les disques
`r2-media` et `r2-private` ne déclarent pas de clé `http` : le client S3 ne passe alors ni `timeout`
ni `connect_timeout` à Guzzle, et un R2 qui ne répond plus tient la requête (le téléversement d'un
lot de photos l'écrit un original après l'autre) jusqu'à la borne de PHP. Seule la sonde de
`HealthcheckService::boundedDisk()` se bornait elle-même.

## Décision du porteur

> `http => ['connect_timeout' => 5, 'timeout' => 60]` sur les deux disques R2 ; test qui lit `@http` d'une commande du client des deux disques (porteur, 2026-10-20)

## Objectif

Tout appel au client S3 des deux disques R2 porte `connect_timeout` 5 s et `timeout` 60 s.

## Delta à produire

- [x] `config/filesystems.php` : clé `http` sur `r2-media` et `r2-private`.
- [x] Test : `tests/Feature/Media/R2DiskHttpTimeoutTest.php`.

## Critères d'acceptation

- [x] AC1 : le disque construit sur la configuration de chacun des deux disques rend, pour une
      commande `HeadObject`, `@http.connect_timeout = 5` et `@http.timeout = 60`.
- [x] AC2 : la sonde de santé garde son propre délai de 3 s (sa clé `http` remplace celle du disque).

## Hypothèses (mode sans humain)

- Le test construit le disque par `Storage::build()` sur la configuration réelle, avec des
  identifiants factices : `Tests\TestCase` remplace les disques de médias par des disques locaux, qui
  n'ont pas de client S3. Aucun appel réseau.

## Hors périmètre

- Le téléversement photo à photo dans la requête (`PropertyMediaController::store()`), et la borne
  de PHP elle-même (P65.01, au porteur).

## Notes d'implémentation

- Avant correctif : 2 rouges (`@http` vide). Ablation (configuration de `pre-dev`) → 2 rouges,
  remise → 2 verts. `HealthcheckProbesTest` reste vert : `boundedDisk()` écrase la clé `http`.
