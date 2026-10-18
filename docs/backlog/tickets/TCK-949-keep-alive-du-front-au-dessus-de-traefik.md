---
id: TCK-949
title: "Le serveur du front garde ses connexions inactives 100 s, au-dessus des 90 s de Traefik : `KEEP_ALIVE_TIMEOUT` dans l'image, vérifié par `smoke-web.sh`"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-44--front-en-conteneur--healthcheck-de-takussan-web-preview-journaux-next"
tags: [front, infra, traefik, docker, pistes]
---

## Contexte

Piste P44.02 (angle 44). Le `server.js` standalone de Next ne règle `server.keepAliveTimeout` que si
`KEEP_ALIVE_TIMEOUT` est posée, et elle ne l'est nulle part : Node 24 garde alors 5 000 ms. Traefik,
devant le front, garde ses connexions amont inactives plus longtemps. Quand l'amont ferme le premier,
le mandataire peut réutiliser une connexion déjà fermée, et la requête finit en 502.

Décision du porteur (ligne Statut de la piste), recopiée mot pour mot :

> porteur (2026-10-18) : traité hors agents, en session : `KEEP_ALIVE_TIMEOUT` au-dessus du délai d'inactivité de Traefik dans l'image, vérifié par `smoke-web.sh`

## Objectif utilisateur

Aucune requête vers le site ne finit en 502 parce que Node a fermé une connexion que Traefik
croyait ouverte.

## Delta à produire

- `takussan-web/Dockerfile`, étage d'exécution : `ENV KEEP_ALIVE_TIMEOUT=100000`.
- `deploy/takussan/smoke-web.sh` : l'en-tête `Keep-Alive: timeout=` de `/robots.txt` doit être
  supérieur à 90.

## Critères d'acceptation

- [x] **AC1** — Le délai d'inactivité de Traefik est établi, avec sa source. *Mesuré par la session
      le 2026-10-18 : Traefik `v3.6.7` sur le serveur, aucun `serversTransport` ni
      `forwardingTimeouts` dans `/etc/dokploy/traefik/traefik.yml`. Documentation de Traefik 3.6,
      « Configuration options » : `serverstransport.forwardingtimeouts.idleconntimeout`, « The
      maximum period for which an idle HTTP keep-alive connection will remain open before closing
      itself », défaut `90` (secondes).*
- [x] **AC2** — L'unité de `KEEP_ALIVE_TIMEOUT` est la milliseconde, et 100 000 annonce
      `timeout=100`. *Lu : `node_modules/next/dist/build/utils.js:1127` (gabarit du `server.js`
      standalone, `parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10)`) puis `start-server.js:248-249`
      (`server.keepAliveTimeout = keepAliveTimeout`, en ms dans Node). Mesuré sous Node v24.18.0 :
      un serveur à `keepAliveTimeout = 100000` répond `keep-alive: timeout=100`.*
- [x] **AC3** — L'étage d'exécution du Dockerfile pose `KEEP_ALIVE_TIMEOUT=100000`, et
      `smoke-web.sh` rougit si l'en-tête annonce 90 s ou moins. *Lu ; l'extraction `awk` de
      `smoke-web.sh` éprouvée sur un en-tête simulé → `100`.*
- [x] **AC4** — `deploy/takussan/smoke-web.sh` sort en 0 sur l'image construite, avec
      « Keep-Alive: timeout=100 ». *Mesuré par la session le 2026-10-18 : sortie 0, « ✓ Keep-Alive:
      timeout=100, au-dessus des 90 s de Traefik ». **Ablation** : la même image lancée avec
      `KEEP_ALIVE_TIMEOUT=5000` (le défaut de Next) annonce `Keep-Alive: timeout=5`, que la lecture
      `awk` de `smoke-web.sh` refuse.*

## Hors périmètre

- Réduire `idleConnTimeout` côté Traefik : l'autre branche de la piste, écartée par le porteur.
- Observer un 502 dans l'accessLog de Traefik (TCK-518) : le correctif ferme l'écart de
  configuration, la panne n'a jamais été observée.

## Notes d'implémentation

- Re-mesuré le 2026-10-18 : `grep -rIn KEEP_ALIVE_TIMEOUT` hors `node_modules` → rien avant ce
  ticket ; l'`ENV` du runtime ne la posait pas.
- 100 s et non 91 : une marge de 10 s au-dessus de Traefik.
