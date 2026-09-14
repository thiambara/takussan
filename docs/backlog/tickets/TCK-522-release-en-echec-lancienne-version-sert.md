---
id: TCK-522
title: "Ablation — un `release` qui échoue laisse l'ancienne version servir, prouvé par la pile de fumée"
status: todo
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-14
depends_on: [TCK-511]
blocks: [TCK-517]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, docker-compose, release, ablation, adr-0028]
---

## Objectif utilisateur

Qu'une migration qui échoue en production laisse l'API précédente répondre, et qu'on le sache parce
qu'on l'a vu, pas parce que le fichier Compose le laisse croire.

## Contrat de données

ADR-0028 §5 et `deploy/takussan/compose.api.yml` affirment : « une migration qui échoue laisse
l'ancienne version servir, au lieu du nouveau code sur l'ancien schéma ». `smoke-api.sh pile` ne
joue jamais ce chemin : il vérifie un `release` qui réussit, puis un second qui n'importe rien.
Dokploy lance exactement `docker compose -p <projet> --env-file deploy/takussan/.env -f
./deploy/takussan/compose.api.yml up -d --build` (journal de déploiement du 2026-09-14). La preuve
doit passer par **cette** commande.

## Contraintes strictes (métier)

- L'échec provoqué est réel, pas un crochet de test dans `release.sh` : un `.env` dont
  `DB_PASSWORD` est faux fait échouer `migrate --force`, donc `release`.
- La preuve compare l'**identifiant** du conteneur `api` avant et après : un `/up` à 200 ne suffit
  pas, un conteneur recréé sur l'ancienne image répondrait aussi.
- La pile revient à l'état sain à la fin (le `.env` juste, `up -d` de nouveau, `api` recréé).

## Delta à produire

- [ ] `deploy/takussan/smoke-api.sh pile` : étape « release en échec », après la pile saine — `.env`
  altéré, `up -d --build` attendu en **échec**, identifiant d'`api` inchangé, `/up` à 200 et
  `X-Build-Sha: smoke`, `worker` et `scheduler` toujours `running` ; puis remise en état
- [ ] Même étape dans `deploy/smoke-api.sh` de `thiambara/check-print-plus`
- [ ] Sur la préproduction, une fois : le même geste par Dokploy (variable altérée dans
  *Environment*, *Deploy*), relever ce que Dokploy affiche et notifie (Telegram : « échec de
  build » ou silence), puis remise en état. Résultat au relevé, ligne « Déploiement en échec »
- [ ] ADR-0028 §5 : la phrase cite la preuve (ticket et date)

## Critères d'acceptation

- [ ] AC1 — `smoke-api.sh pile` sort en 0 avec la ligne `✓ release en échec : l'ancienne api sert
  toujours`, et rougit si l'on retire la comparaison d'identifiant (ablation de l'ablation)
- [ ] AC2 — sur la préproduction, `X-Build-Sha` reste celui d'avant pendant et après l'échec
- [ ] AC3 — le relevé dit si Dokploy notifie un `up` en échec, avec la capture ou la commande
- [ ] AC4 — la pile de fumée et la préproduction sont revenues à l'état sain (relevé daté)

## Hors périmètre

- Le retour arrière d'une migration déjà jouée : runbook « Revenir en arrière », inchangé.
- Le comportement de Swarm pour les fronts : `start-first` et `FailureAction: rollback` sont relus
  dans le service, pas testés ici.

## Notes d'implémentation

_(à remplir par implementing-specs)_
