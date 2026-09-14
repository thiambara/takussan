---
id: TCK-522
title: "Ablation — un `release` qui échoue laisse l'ancienne version servir, prouvé par la pile de fumée"
status: done
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

ADR-0028 §5 et `deploy/takussan/compose.api.yml` affirmaient : « une migration qui échoue laisse
l'ancienne version servir, au lieu du nouveau code sur l'ancien schéma ». `smoke-api.sh pile` ne
jouait jamais ce chemin : il vérifiait un `release` qui réussit, puis un second qui n'importe rien.
Dokploy lançait exactement `docker compose -p <projet> --env-file deploy/takussan/.env -f
./deploy/takussan/compose.api.yml up -d --build --remove-orphans` (journal de déploiement du
2026-09-14). La preuve devait passer par **cette** commande.

**Mesuré le 2026-09-14, l'affirmation était fausse.** `depends_on: service_completed_successfully`
n'ordonne que le *démarrage* : sur un seul `up -d --build`, Compose retire l'ancien `api` et crée le
neuf **avant** de lancer `release` ; `release` en échec, `api` reste `Created`, `/up` → `000`.
La preuve passe désormais par la commande posée dans le champ *Command* du service Compose de
Dokploy (v0.30.6 l'exécute en `docker ${command}`, chaînage `&&` admis entre commandes
`docker compose`) : `run --rm release && up -d --build --remove-orphans`.

## Contraintes strictes (métier)

- L'échec provoqué est réel, pas un crochet de test dans `release.sh` : un `.env` dont
  `DB_PASSWORD` est faux fait échouer `migrate --force`, donc `release`.
- La preuve compare l'**identifiant** du conteneur `api` avant et après : un `/up` à 200 ne suffit
  pas, un conteneur recréé sur l'ancienne image répondrait aussi.
- La pile revient à l'état sain à la fin (le `.env` juste, le déploiement rejoué, `api` saine).
- Le test de fumée déploie avec **la commande de Dokploy**, jamais avec une autre : c'est elle
  qu'il prouve.

## Delta à produire

- [x] `deploy/takussan/smoke-api.sh pile` : `deployer()` = la commande de Dokploy (`run --rm
  release && up -d --build`, plus `--pull never`) pour le premier déploiement ; étape « release en
  échec », après la pile saine — `.env` altéré, déploiement attendu en **échec** sur `SQLSTATE`,
  identifiant d'`api` inchangé, `/up` à 200 et `X-Build-Sha: smoke`, `worker` et `scheduler`
  toujours `running` ; puis remise en état
- [x] Même étape dans `deploy/smoke-api.sh` de `thiambara/check-print-plus`
- [x] Champ *Command* posé sur les deux services Compose de Dokploy (`compose.update`), et un
  déploiement normal rejoué avec lui sur chaque préproduction
- [x] Sur la préproduction Takussan, une fois : le même geste par Dokploy (`DB_PASSWORD` altéré
  dans *Environment*, *Deploy*), relevé de ce que Dokploy affiche et notifie, remise en état.
  Résultat au relevé, ligne « Déploiement en échec »
- [x] ADR-0028 §5, commentaire des deux fichiers Compose, extrait du plan : l'affirmation corrigée,
  la preuve citée (ticket et date)

## Critères d'acceptation

- [x] AC1 — `smoke-api.sh pile` sort en 0 avec la ligne `✓ release en échec : l'ancienne api sert
  toujours`, et rougit sur l'identifiant d'`api` si `deployer` est remplacé par un simple
  `up -d --build` (ablation de l'ablation)
- [x] AC2 — sur la préproduction, `X-Build-Sha` et l'identifiant du conteneur `api` restent ceux
  d'avant pendant et après l'échec
- [x] AC3 — le relevé dit si Dokploy notifie un déploiement en échec, avec la commande
- [x] AC4 — la pile de fumée et la préproduction sont revenues à l'état sain (relevé daté)

## Hors périmètre

- Le retour arrière d'une migration déjà jouée : runbook « Revenir en arrière », inchangé.
- Le comportement de Swarm pour les fronts : `start-first` et `FailureAction: rollback` sont relus
  dans le service, pas testés ici.
- Corriger le *Chat ID* Telegram (TCK-519) : la notification d'échec part, mais vers un canal faux.

## Notes d'implémentation

- **La prémisse du ticket était fausse, et c'est la première mesure qui l'a dit.** Premier passage
  de l'étape, avec le `up -d --build` de Dokploy : `✗ release en échec : api a été RECRÉÉ
  (ba26e5fcf7fe → 53a924e17e0e) malgré l'échec de release`. Reproduit à la main : après l'`up`
  altéré, `api`, `worker`, `worker-media`, `scheduler` sont `Created` (jamais démarrés), `release`
  `Exited (1)`, et `curl …/up` → `000`. Compose recrée les conteneurs dont la configuration change
  — et un déploiement réel en change toujours une (l'image) — avant de savoir si `release` réussit.
  Ce premier passage rouge **est** l'ablation de l'ablation demandée par AC1 : la comparaison
  d'identifiant attrape exactement le défaut.
- **Le correctif est la commande de déploiement, pas le fichier Compose.** Source de Dokploy
  v0.30.6 (`packages/server/src/utils/builders/compose.ts`) : `compose.command`, s'il est posé,
  remplace `compose -p … up -d --build --remove-orphans` et s'exécute en `docker ${command}` ;
  `;`, `|`, `$`, `(`, `)`, `<`, `>` sont refusés, `&&` admis si chaque maillon suivant commence par
  `docker compose `. La commande posée (`compose.update`, 2026-09-14, 22:36 Z) est au relevé.
  `release` tourne donc deux fois par déploiement (`run`, puis rejoué par `up`) ; mesuré sur la
  préproduction : `Nothing to migrate`, `forme des index inchangée`, déploiement `done` en 10 s.
- **Rejeu sur la préproduction Takussan (2026-09-14, 22:36-22:37 Z)** : `DB_PASSWORD` altéré par
  `compose.update`, `compose.deploy` → déploiement `error` en moins de 15 s, journal :
  `SQLSTATE[08006] … password authentication failed`, puis `Error: ❌ Docker command failed` —
  aucune ligne `Recreate`, `up` n'a pas été lancé. Pendant et après : conteneur `api`
  `16035eee79e6…` inchangé, `Up 12 hours (healthy)`, `/up` → `200`, `X-Build-Sha` = `ad93e5e6…`
  inchangé. Environnement restauré à l'identique (relu par `compose.one`), déploiement `done`.
  CheckPrint Plus : déploiement normal avec la commande, `done`, `c1744692…` et conteneur inchangés.
- **Notification** : `deployCompose` appelle `sendBuildErrorNotifications` (événement « échec de
  build », Compose compris) ; `sendTelegramNotification` fait un `fetch` **sans lire la réponse**
  (`utils/notifications/utils.ts`) : le `403` de Telegram (chat id faux, TCK-519) ne laisse aucune
  trace dans le journal de Dokploy — mesuré vide sur les 4 minutes du rejeu. Tant que TCK-519 n'est
  pas fermé, un déploiement en échec n'est visible que dans l'interface et par `images.yml`.
- Les piles de fumée des deux dépôts sont vertes avec `deployer` (Takussan : 12 `✓`, dont
  « release en échec » et « remise en état » ; CheckPrint Plus : 8 `✓`), et le `.env.sain` est
  retiré par `nettoyer_pile` quel que soit le point d'échec.
