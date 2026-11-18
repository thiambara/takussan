---
id: TCK-2953
title: "Le temps réel en développement : Reverb lancé par ./dev.sh, sondé par doctor, et les clés des deux applications"
status: todo
phase: P1
family: technique
estimate: S
wave: 93
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2952]
blocks: [TCK-2954, TCK-2956]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [infra, dev, temps-reel, reverb, env, adr-0129, adr-0127]
---

## Objectif utilisateur

- **La personne qui développe** : `./dev.sh` lève un serveur Reverb à côté de l'API, et
  `./dev.sh doctor` dit s'il répond, sans qu'elle ait à poser une clé à la main.

## Contrat de données

Aucune donnée applicative. Décisions : [ADR-0129](../../../adr/0129-le-socle-temps-reel-signale-et-l-api-sert.md)
§ 5, amendé le 2026-11-17 pour les clés du front.

Relevé sur l'arbre du 2026-11-17 :

- **`docker-compose.yml`** sert quatre services, et son en-tête justifie « ces quatre-là, et pas un
  de plus ni un de moins ».
  - Les ports sont décalés d'un cran : 5433, 7701, 6380, 1026/8026, surchargeables par
    `TAKUSSAN_*_PORT`.
  - Aucun service ne fait tourner PHP : `./dev.sh` lance l'API, les quatre `queue:work` et
    `schedule:work` en processus natifs (vers les lignes 784 à 840).
- **Les clés de l'API.** `takussan-api/.env.example` et `.env.docker` posent
  `BROADCAST_CONNECTION=log`, et `phpunit.xml` force `null`.
  - **La CI joue la suite sur `.env.example`** : une clé vide y écrase le défaut de `config/`.
  - `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET`, `REVERB_HOST`, `REVERB_PORT` et
    `REVERB_SCHEME` sont aujourd'hui des **résidus** de `scripts/check-env-production.mjs`
    (`RESIDUS`, motif « pilote de diffusion non utilisé »).
  - Un résidu peut figurer dans les deux fichiers d'environnement, sous la section
    « Résidus (jamais dans Dokploy) ».
- **Les clés du front.**
  - `scripts/check-front-env-keys.mjs` refuse toute `NEXT_PUBLIC_*` et ferme `ConfigPublique`
    (`takussan-web/src/lib/config-publique.ts`).
  - `scripts/check-env-production.mjs` exige que chaque clé de `takussan-web/.env.example` figure
    dans `deploy/takussan/env.web.production.example`, seuls `NODE_ENV` et `BUILD_SHA` faisant
    exception.
  - `scripts/check-actions-de-deploiement.mjs` exige que toute clé neuve d'un gabarit soit nommée
    par une action (ADR-0127).

## Contraintes strictes (métier)

- **Le serveur de développement.** ADR-0129 § 5 et la demande disent : un service `reverb` dans
  `docker-compose.yml`, lancé par `./dev.sh`, sondé par `./dev.sh doctor`.
  - Le conteneur n'a besoin que de la configuration de l'application Reverb. L'autorisation des
    canaux, elle, se juge dans l'API.
  - Son port suit la convention du fichier : décalé d'un cran (`8081` pour `8080`), surchargeable
    par `TAKUSSAN_REVERB_PORT`, écouté sur `127.0.0.1` seulement. Le port est relevé libre sur le
    poste avant d'être retenu.
  - L'en-tête de `docker-compose.yml` est réécrit pour cinq services, avec le pourquoi du cinquième.
  - **Si un conteneur est mesuré impraticable** (aucune image ne lance `reverb:start` sur le code
    monté sans dupliquer l'environnement PHP du poste), l'alternative est un processus natif lancé
    par `./dev.sh`, comme la file. La mesure s'écrit dans les notes, et la session principale en
    est prévenue pour amender ADR-0129 § 5. Ce choix ne se fait pas en silence.
- **`./dev.sh doctor` constate, il ne lance rien.**
  - Il sonde le port de Reverb dès que le `.env` de l'API déclare `BROADCAST_CONNECTION=reverb`.
  - Il nomme l'écart entre `REVERB_PORT` du `.env` et le port du service, sur le patron de
    `ecart_port_natif`.
  - Il nomme un front sans les clés `TEMPS_REEL_*` : « mode dégradé ».
- **Les clés de l'API.**
  - `REVERB_*` entrent dans `.env.example` et `.env.docker`, avec les **mêmes** valeurs de
    développement des deux côtés : hôte `127.0.0.1`, port du service, schéma `http`, identifiants
    de développement non secrets.
  - Elles restent dans `RESIDUS` de `check-env-production.mjs`, jusqu'à ce que TCK-2956 les sorte
    vers le gabarit. Leur motif est réécrit : « pilote actif en développement seulement ; la
    préproduction les reçoit par TCK-2956 ».
  - `.env.docker` passe à `BROADCAST_CONNECTION=reverb`. `.env.example` garde `log`, car la CI le
    lit et n'a pas de Reverb ; `phpunit.xml` garde `null`.
  - **Aucune clé `REVERB_*` vide dans `.env.example`.**
- **Les clés du front** sont des clés d'exécution, jamais des `NEXT_PUBLIC_*` :
  - `TEMPS_REEL_URL` : l'origine WebSocket, par exemple `ws://127.0.0.1:8081`. Vide = mode dégradé ;
  - `TEMPS_REEL_CLE` : la clé publique de l'application Reverb, égale à `REVERB_APP_KEY`.
  - Elles entrent dans `takussan-web/.env.example`, que `./dev.sh` recopie en `.env.local`.
  - Elles entrent aussi dans `deploy/takussan/env.web.production.example`, **vides**, admises par
    la liste des vides permis de la garde, avec leur motif : vide = mode dégradé, rien ne casse.
  - Elles sont nommées par une action neuve,
    `docs/deploiement/actions/2026-11-17-poser-le-temps-reel.md` (`type: cle-env`,
    `tickets: [TCK-2953, TCK-2956]`, `preview: a-faire`, `production: a-faire`). Son « Quoi faire »
    dit de **ne pas** les poser avant que le service `temps-reel` de TCK-2956 réponde.
  - **Ce ticket ne lit pas ces clés** : c'est TCK-2954 qui les ajoute à `config-publique.ts` et
    amende `check-front-env-keys.mjs`.
  - `docker/demarrer.mjs` ne doit pas les exiger.

## Delta à produire

- [ ] `docker-compose.yml` : le service Reverb, son port décalé, son healthcheck qui interroge le
      serveur (pas un `--help`), et l'en-tête réécrit
- [ ] `dev.sh` :
  - le lancement en modes `all` et `services` (ou `api`, selon la forme retenue) ;
  - la sonde de `doctor` et l'écart de port ;
  - le constat « mode dégradé » côté front
- [ ] `takussan-api/.env.example`, `takussan-api/.env.docker` : `REVERB_*` sous la section des
      résidus ; `BROADCAST_CONNECTION=reverb` dans `.env.docker`
- [ ] `scripts/check-env-production.mjs` : motif des résidus `REVERB_*` réécrit ; `TEMPS_REEL_URL`
      et `TEMPS_REEL_CLE` dans les vides permis, avec leur motif
- [ ] `takussan-web/.env.example` et `deploy/takussan/env.web.production.example` : les deux clés,
      à la même section
- [ ] `docs/deploiement/actions/2026-11-17-poser-le-temps-reel.md`

## Critères d'acceptation

- [ ] **AC1 — Le serveur répond.** Sur un clone neuf, `./dev.sh` lève Reverb. Une connexion
      WebSocket à `ws://127.0.0.1:<port>/app/<REVERB_APP_KEY>` reçoit
      `pusher:connection_established`. La commande et sa sortie sont dans les notes.
- [ ] **AC2 — `doctor` dit vrai dans les deux sens.** Reverb levé : ✓. Reverb arrêté : la sonde le
      nomme, et `doctor` va au bout de son diagnostic sans rien démarrer. Les deux sorties sont
      relevées.
- [ ] **AC3 — Bout à bout en développement.** Avec `.env.docker`, une notification créée par
      `tinker --execute='…'` fait arriver un signal `notifications.updated` à un client abonné à
      `private-utilisateur.<id>`, autorisé par `POST /api/broadcasting/auth`. C'est la preuve que
      la clé, le port et l'hôte s'accordent entre l'API et le serveur.
- [ ] **AC4 — Les gardes sont vertes, et pas par accident.**
  - `check-env-parity`, `check-env-production`, `check-actions-de-deploiement`,
    `check-front-env-keys` et `check-webhook-env-keys` sont verts.
  - Retirer `TEMPS_REEL_URL` de l'action fait rougir `check-actions-de-deploiement`.
  - Retirer une `REVERB_*` de `.env.docker` fait rougir `check-env-parity`.
- [ ] **AC5 — La CI n'est pas touchée.** `php artisan test tests/Feature/TempsReel` passe avec
      `.env.example` copié en `.env`. `grep -E '^REVERB_[A-Z_]+=$' takussan-api/.env.example` ne
      rend rien.

## Hors périmètre

- Le code du socle (TCK-2952) et la lecture des clés par le front (TCK-2954).
- La préproduction (TCK-2956) : service `temps-reel`, sous-domaine, clés `REVERB_*` dans le
  gabarit de l'API, règle `BROADCAST_CONNECTION=null` de la garde.
- La mise à l'échelle par Redis (`REVERB_SCALING_ENABLED`) : une instance suffit.

## Notes d'implémentation

_(à remplir par implementing-specs)_
