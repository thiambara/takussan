---
id: TCK-2357
title: "LOG_CHANNEL et LOG_LEVEL entrent dans prod-drivers.json, relevés dans Dokploy par un script qui n'imprime aucun secret (P14.08)"
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
  features: []
  models: []
tags: [infra, dokploy, journaux, pistes]
---

## Objectif utilisateur

Que le porteur sache, sans ouvrir Dokploy, où partent les journaux de l'API déployée, et que ce
relevé ne fasse passer aucun secret par le shell.

## Décision

Validation du porteur (2026-10-25), recopiée de P14.08 : « `LOG_CHANNEL` et `LOG_LEVEL` entrent dans `docs/infra/prod-drivers.json`, lus dans Dokploy par script sans secret ; les erreurs sont gardées par P14.07, sans collecteur de journaux ».

## Mesure (2026-10-25)

`python3 -I deploy/takussan/relever-cles-dokploy.py JbPrtvdkuq0aLTDrOx2Ss LOG_CHANNEL LOG_LEVEL`
→ « http 200, 92 lignes d'environnement », `LOG_CHANNEL = stderr`, `LOG_LEVEL = info`. `LOG_STACK`
vaut `single`, sans effet hors du canal `stack`.

## Delta

- [x] `deploy/takussan/relever-cles-dokploy.py` : il lit la clé d'API dans le fichier de secrets
  sans l'imprimer, ne rend que les clés demandées, et refuse un nom de secret avant tout appel
  (vérifié : `APP_KEY` → « refusé, nom de secret », sortie 1).
- [x] `docs/infra/prod-drivers.json` : `LOG_CHANNEL` et `LOG_LEVEL`, mesurés en préproduction et
  prescrits pour la production. La commande `_mesure` les cite.
- [x] Plan d'auto-hébergement, table de F3 : deux lignes. `check-prod-drivers.mjs` l'exige.

## Critères d'acceptation

- [x] AC1 — `node scripts/check-prod-drivers.mjs` est vert avec les deux clés.
- [x] AC2 — aucune valeur secrète n'apparaît dans le dépôt ni dans la sortie du script.

## Hors périmètre

- Le collecteur de journaux : écarté par la décision. Les erreurs sont gardées par P14.07 (TCK-2356).
- La durée de rétention de Docker (`json-file`, 10 Mo × 3, `deploy/server/bootstrap.sh`), inchangée.
