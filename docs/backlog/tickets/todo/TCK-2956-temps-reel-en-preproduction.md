---
id: TCK-2956
title: "Le temps réel en préproduction : un service temps-reel dans la pile de l'API, un sous-domaine en wss, ses clés et son action"
status: todo
phase: P1
family: technique
estimate: S
wave: 93
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2952, TCK-2953]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [infra, deploiement, dokploy, traefik, temps-reel, reverb, adr-0129, adr-0127, adr-0069]
---

## Objectif utilisateur

- **Le porteur, qui déploie** : la préproduction sert le temps réel. Le dépôt dit quel service, quel
  nom et quelles clés, et ce qui reste à faire à la main se lit dans le rapport des actions de
  déploiement.

## Contrat de données

Aucune donnée applicative. Décisions : [ADR-0129](../../../adr/0129-le-socle-temps-reel-signale-et-l-api-sert.md)
§ 5 ; [ADR-0028](../../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md) et
[ADR-0069](../../../adr/0069-deux-environnements-dokploy-configuration-hors-de-github.md) (la pile
Compose, un réseau par environnement) ; [ADR-0127](../../../adr/0127-les-actions-de-deploiement-un-fichier-par-action.md)
(les actions).

Relevé sur l'arbre du 2026-11-17 :

- **`deploy/takussan/compose.api.yml`.**
  - Un même fichier sert la préproduction et la production, sur l'ancre `x-api` (image de l'API,
    `env_file: .env`).
  - Le domaine n'y est pas : **Dokploy pose les labels Traefik depuis son onglet Domains**.
  - Deux réseaux : `dokploy-network`, partagé par toutes les piles, et `interne`, propre à la pile.
  - `REDIS_HOST` et `REDIS_PORT` sont écrits dans le fichier, comme des faits de la pile.
- **`scripts/check-reseau-par-environnement.mjs`.**
  - Il refuse l'hôte `api`. Un nom de service présent sur `dokploy-network` y désigne en effet le
    service de **chaque** environnement.
  - Il exige l'alias `${API_ALIAS…}`.
- **`scripts/check-env-production.mjs`.**
  - Sa règle 6 exige `BROADCAST_CONNECTION=null` dans le gabarit de l'API.
  - Les `REVERB_*` y sont des résidus, tenus par TCK-2953 et TCK-2952.
  - `INTERDITES_API` interdit au gabarit les clés écrites par la pile.
- **L'action** `docs/deploiement/actions/2026-11-17-poser-le-temps-reel.md` est créée par TCK-2953.
  Elle nomme `TEMPS_REEL_URL` et `TEMPS_REEL_CLE` du gabarit du front.
- `docs/infra/hebergement.md`, « Ce qui sert quoi » : `preview.api.takussan.com` est un A en DNS
  seul vers le service `api:8080`.

## Contraintes strictes (métier)

- **Le service `temps-reel`** :
  - il tourne sur l'ancre `x-api`, avec la commande `php artisan reverb:start`, en chaîne sur une
    ligne, à la manière des `queue:work` ;
  - il démarre après `release`, comme les autres ;
  - il a un healthcheck qui interroge le serveur ;
  - son `mem_limit` est relevé, pas recopié : la mesure, avec sa date, est écrite en commentaire,
    à la manière des workers ;
  - il est joignable par Traefik sur `dokploy-network` ;
  - **pas de `container_name`**.
- **L'API joint le Reverb de SA pile, jamais celui de l'autre environnement.**
  - `REVERB_HOST`, `REVERB_PORT` et `REVERB_SCHEME`, ceux de la publication de serveur à serveur,
    sont **écrits dans `compose.api.yml`**, sur le patron de `REDIS_HOST`.
  - Ils visent un nom **propre à l'environnement** (un alias à la manière d'`API_ALIAS`), jamais
    `temps-reel` seul.
  - `check-reseau-par-environnement.mjs` est étendu : il refuse `temps-reel` comme hôte, et exige
    l'alias.
  - Ces trois clés rejoignent `INTERDITES_API` du gabarit.
- **Le navigateur joint Reverb par un sous-domaine en `wss`**, publié par Traefik sur le port 443.
  - Le nom proposé est `preview.ws.takussan.com`, en DNS seul comme `preview.api.takussan.com`,
    puis `ws.takussan.com` en phase F. Il est écrit dans `docs/infra/hebergement.md`.
  - *(Décision de ce ticket : l'ADR renvoie le nom à ce document.)*
  - `TEMPS_REEL_URL` du front vaut `wss://<ce nom>`.
- **Origines admises.** L'application Reverb n'accepte de connexion que de l'origine du front de son
  environnement, dérivée de `FRONTEND_URL`, une clé déjà posée. Ce n'est pas `*`. Aucune clé neuve
  pour cela.
  - **En développement**, le front se sert sur `localhost:3000` **et** sur `127.0.0.1:3000`
    (`allowedDevOrigins`). Les deux doivent rester admis, ou la règle ne s'applique qu'hors
    `APP_ENV=local`.
  - Un refus y serait muet : le mode dégradé ne dit rien.
- **Les clés de l'API passent au gabarit.**
  - `REVERB_APP_ID`, `REVERB_APP_KEY` et `REVERB_APP_SECRET` sortent de `RESIDUS` et entrent dans
    `env.api.production.example` : vides, ce sont des secrets pour la garde.
  - Elles sont ajoutées au `cles:` de l'action de TCK-2953, qui devient l'action unique « poser le
    temps réel ».
  - Les autres `REVERB_*` restent des résidus, ou sont écrites par la pile, avec leur motif à jour.
  - La règle 6 de `check-env-production.mjs` passe de `BROADCAST_CONNECTION=null` à `reverb`, en le
    sachant, et son commentaire dit pourquoi.
- **Ce qu'aucun script ne fait est une action humaine, pas un critère de ce ticket** :
  - l'enregistrement DNS du sous-domaine ;
  - le domaine dans l'onglet Domains de Dokploy, vers `temps-reel:8080` ;
  - les clés dans l'onglet Environment, des deux applications ;
  - le relevé à l'œil sur la préproduction.
  - Tout cela s'écrit dans l'action, avec son « Comment vérifier ».
  - `takussan-api/docker/release.sh` est **relu avant** : rien de ce qu'il fait n'entre dans
    l'action.

## Delta à produire

- [ ] `deploy/takussan/compose.api.yml` :
  - le service `temps-reel` ;
  - l'alias propre à l'environnement ;
  - `REVERB_HOST`, `REVERB_PORT` et `REVERB_SCHEME` écrits dans la pile ;
  - les commentaires d'en-tête
- [ ] `config/reverb.php` (ou la configuration équivalente) : les origines admises dérivées de
      `FRONTEND_URL`
- [ ] `scripts/check-reseau-par-environnement.mjs` étendu au service `temps-reel`
- [ ] `scripts/check-env-production.mjs` :
  - les `REVERB_APP_*` sortent des résidus ;
  - les clés écrites par la pile entrent dans `INTERDITES_API` ;
  - la règle 6 passe à `reverb`
- [ ] `takussan-api/.env.example` et `takussan-api/.env.docker` : les `REVERB_APP_*` quittent la
      section « Résidus (jamais dans Dokploy) » pour une section que le gabarit porte aussi (règle 7
      de `check-env-production.mjs` : mêmes sections, même ordre)
- [ ] `deploy/takussan/env.api.production.example` : ces clés, dans cette même section, et
      `BROADCAST_CONNECTION=reverb`
- [ ] `docs/deploiement/actions/2026-11-17-poser-le-temps-reel.md` :
  - `cles:` complété ;
  - « Quoi faire » : DNS, Domains, Environment des deux applications, et l'ordre des gestes (le
    service avant les clés du front) ;
  - « Comment vérifier »
- [ ] `docs/infra/hebergement.md` :
  - une ligne « Ce qui sert quoi » pour le sous-domaine, marquée **à relever** tant que personne ne
    l'a mesuré ;
  - les clés du service dans « Les variables d'environnement, par service » ;
  - un paragraphe de runbook
- [ ] `deploy/takussan/smoke-api.sh pile` : le service `temps-reel` levé, et la preuve que l'API y
      publie

## Critères d'acceptation

- [ ] **AC1 — La pile locale le prouve.** `deploy/takussan/smoke-api.sh pile` lève `temps-reel`,
      healthy. Une notification créée dans le conteneur `api` arrive en signal à un client
      WebSocket connecté à `temps-reel`, de l'intérieur de la pile. La sortie est dans les notes.
- [ ] **AC2 — Le bon Reverb.** `check-reseau-par-environnement.mjs` rougit quand on remplace
      l'alias par `temps-reel` dans `REVERB_HOST`, et quand on retire l'alias du service. Les deux
      ablations sont constatées.
- [ ] **AC3 — Origine refusée.** Dans la pile locale, une connexion WebSocket avec un en-tête
      `Origin` étranger est refusée, et celle de `FRONTEND_URL` acceptée. Sous `./dev.sh`, le front
      servi sur `http://localhost:3000` **et** sur `http://127.0.0.1:3000` obtient
      `pusher:connection_established`.
- [ ] **AC4 — Les gardes, et leurs ablations.**
  - `check-env-production`, `check-env-parity`, `check-actions-de-deploiement` et
    `check-reseau-par-environnement` sont verts ;
  - retirer `REVERB_APP_SECRET` du `cles:` de l'action fait rougir `check-actions-de-deploiement` ;
  - remettre `BROADCAST_CONNECTION=null` au gabarit fait rougir `check-env-production`.
- [ ] **AC5 — Ce qui reste se lit.**
  `node scripts/check-actions-de-deploiement.mjs --report preview` liste l'action « poser le temps
  réel », avec toutes ses clés, en `a-faire`.
- [ ] **AC6 — Rien ne change tant que les clés ne sont pas posées.**
  - avec le gabarit tel quel, sans les clés posées, l'API démarre dans `smoke-api.sh image` ;
  - une requête qui émet un signal répond en moins d'1 s de plus qu'aujourd'hui (l'échec est
    avalé) ;
  - le front sans `TEMPS_REEL_URL` reste en mode dégradé (TCK-2954).

## Hors périmètre

- Les gestes humains (DNS, Domains, Environment) : l'action les porte, et la personne qui déploie
  les fait et écrit leur ligne d'historique.
- La production (phase F, TCK-517) : l'action y reste `a-faire`.
- Plusieurs instances de Reverb et la diffusion par Redis (`REVERB_SCALING_ENABLED`).
- La surveillance externe du sous-domaine (UptimeRobot) et `certificats.sh` : à ajouter quand le
  nom sert.

## Notes d'implémentation

### Re-mesure de la prémisse (2026-11-18)

- **`BROADCAST_CONNECTION=reverb` avec les `REVERB_APP_*` ABSENTES fait tomber TOUTE l'API**, pas seulement
  l'émission : `routes/channels.php` construit le diffuseur au démarrage, et `Pusher\Pusher::__construct()`
  type ses trois identifiants en `string`. Mesuré : `BROADCAST_CONNECTION=reverb php artisan route:list
  --path=broadcasting` sans aucune `REVERB_*` → `RuntimeException: Failed to create broadcaster … Argument #1
  ($auth_key) must be of type string, null given` ; avec les trois clés VIDES → la route est listée. Dokploy n'a
  aujourd'hui aucune ligne `REVERB_APP_*` : basculer le pilote seul aurait arrêté le déploiement au `migrate` du
  release, et toute requête. Corrigé dans `config/broadcasting.php` (`env('REVERB_APP_KEY', '')` et ses deux
  sœurs : absente ≡ vide), test et ablation ci-dessous ; l'action dit aussi de poser les trois clés AVANT ou AVEC
  la bascule.
- **Reverb compare l'HÔTE de l'Origin** (`Protocols\Pusher\Server::verifyOrigin()`, `laravel/reverb` v1.14.0) :
  `parse_url($origin, PHP_URL_HOST)` contre chaque entrée par `Str::is`, sans schéma ni port. Une connexion SANS
  en-tête Origin est refusée (4009) dès que la liste n'est pas `*`. Le WebSocket natif de Node 24 n'envoie aucun
  Origin (mesuré : serveur d'écoute, `origin: null`) : la sonde de `./dev.sh doctor` serait refusée si la règle
  s'appliquait en `local`. D'où : `*` en `local`, l'hôte de `FRONTEND_URL` partout ailleurs, `[]` si
  `FRONTEND_URL` n'a pas d'hôte.
- **La préproduction tourne en `APP_ENV=staging`** (`docs/infra/hebergement.md`, relevé du 2026-10-20) : une règle
  « production seulement » l'aurait laissée ouverte. La règle s'applique donc hors `local`.
- **`REVERB_APP_ID` n'a pas la forme d'un secret** pour la garde (`CLE_DE_SECRET` ne reconnaît que `KEY`,
  `KEY_ID`, `SECRET`, `PASSWORD`, `TOKEN`, `ACCOUNT_ID`) : vide au gabarit, elle serait refusée (« une ligne vide
  écraserait son défaut »). Voir « Décisions ».
- **Aucune image `ghcr.io/thiambara/takussan-api:local` sur le poste** (`docker images`) : `smoke-api.sh image` et
  `pile` exigent sa construction (et celle de `local-seed`), plus longue que la borne de 9 minutes d'un agent.
- **Un `.env` avec `REVERB_APP_KEY=` VIDE ne fait pas mourir le serveur** (conteneur jetable, `APP_ENV=staging`,
  clés vides, resté `Up` plus de 8 heures) — c'est la clé ABSENTE (`null`) que TCK-2953 a vue sortir en 0 vers 60 s.
  Un serveur aux clés vides tourne mais ne sert personne (aucune application de clé `''` n'est joignable).

### Décisions (2026-11-18)

- **L'alias est DÉRIVÉ d'`API_ALIAS`** : `${API_ALIAS}-temps-reel` (`takussan-api-preview-temps-reel`). Aucune
  clé neuve à poser, donc aucun déploiement de `preview` qui échoue sur un `${…:?}` manquant entre la fusion et le
  geste humain. `docker compose config -q` passe avec les seules `IMAGE_TAG`, `API_ALIAS`, `REDIS_PASSWORD`.
  L'alias vit sur `dokploy-network`, où il est unique par environnement.
- **La commande du service refuse de démarrer sans `REVERB_APP_KEY` non vide**, en nommant l'action : un serveur
  sans clé ne sert personne, et sans clé du tout il sortirait en 0, muet, toutes les minutes. Mesuré sous Compose
  (image `serversideup/php`, `entrypoint: []`, même ligne `command:` où `reverb:start` est remplacé par un témoin) :
  `.env` vide → message + code 1 ; `REVERB_APP_KEY=` → message + code 1 ; `REVERB_APP_KEY=cle` → démarre, code 0.
  Le `$$` échappe bien l'interpolation de Compose.
- **`mem_limit: 384m`**, motivé par `memory_limit = 256M` + la marge hors tas de TCK-951 (288 Mio), pas par
  l'usage mesuré : RSS 72 Mio au repos, 81 Mio (`VmHWM`) avec 500 connexions tenues, 57 → 66 Mio au cgroup
  (`docker stats`), relevé le 2026-11-18 sur `serversideup/php:8.4.27-cli-alpine` + code monté, `APP_ENV=staging`.
  Le chiffre dans l'image de l'API reste à relever (action, « Comment vérifier »).

### Mesures (2026-11-18)

- **AC3, première moitié — origines, sur le serveur réel** (`reverb:start` du code du dépôt dans un conteneur
  jetable `serversideup/php:8.4.27-cli-alpine-v5.1.3`, `APP_ENV=staging`, `FRONTEND_URL=https://preview.takussan.com`,
  WebSocket natif de Node avec `headers: { Origin }`) :
  - `Origin: https://preview.takussan.com` → `pusher:connection_established` ;
  - `Origin: https://autre.example` → `pusher:error {"code":4009,"message":"Origin not allowed"}` ;
  - `Origin: http://localhost:3000` → 4009 ; sans Origin → 4009.
  - Même serveur en `APP_ENV=local` : `http://localhost:3000`, `http://127.0.0.1:3000` et sans Origin →
    `pusher:connection_established` tous trois.
- **Tests de configuration** : `tests/Unit/Config/TempsReelConfigurationTest.php`, 9 verts. Ablations (copie
  `cp`, restauration prouvée par `md5`) : `allowed_origins` remis à `['*']` → 7 rouges sur 9 ; `env('REVERB_APP_KEY')`
  sans défaut `''` (et ses deux sœurs) → `test_des_cles_reverb_absentes_ne_font_pas_tomber_le_diffuseur` rouge
  (`Failed asserting that null is identical to ''`).
- **AC2** — sur une copie de la racine (`CHECK_RESEAU_RACINE`, le fichier partagé n'est pas touché) : témoin vert ;
  `REVERB_HOST: temps-reel` → code 1 (deux messages : l'hôte, et l'écart à l'alias) ; alias retiré du service →
  code 1 ; `ws://temps-reel:8080` ajouté à `docs/infra/hebergement.md` → code 1.
- **AC1, la sonde de la pile, éprouvée hors de l'image** : `deploy/takussan/sonde-temps-reel.php` (client
  WebSocket écrit à la main : l'image n'a ni Node ni client PHP, et elle doit ENVOYER un Origin) contre un Reverb du
  code du dépôt, réseau Docker jetable, alias `takussan-api-smoke-temps-reel`, `APP_ENV=production`,
  `FRONTEND_URL=http://localhost:3000`, l'émetteur lancé avec `BROADCAST_CONNECTION=reverb` et `REVERB_HOST` = l'alias :
  - `origine http://localhost:3000` → `pusher:connection_established`, code 0 ;
  - `origine https://autre.example` → `pusher:error … 4009 Origin not allowed`, code 1 ;
  - `signal http://localhost:3000` → `subscription_succeeded private-utilisateur.936979`, puis
    `reçu → {"event":"signal","data":"{\"subject\":\"utilisateur:936979\",\"event\":\"notifications.updated\",…}"}`,
    code 0 — émis par `TempsReel::signalerA` (le vrai transport, la vraie configuration), à travers l'alias.
  Rejouée après Pint (même sortie, code 0). Ablation : le client lancé avec un autre `REVERB_APP_SECRET` que le
  serveur → `pusher:error … Connection is unauthorized`, code 1 — la sonde voit un secret désaccordé.
  `smoke-api.sh pile` joue la même sonde dans le conteneur `api` (`verifier_temps_reel`) ; **la pile elle-même n'a
  pas tourné** (aucune image `:local`, voir « Reste »).
- **AC4** — `check-env-production`, `check-env-parity`, `check-actions-de-deploiement`,
  `check-reseau-par-environnement`, `check-webhook-env-keys`, `check-front-env-keys` verts. Ablations (copie `cp`,
  `md5` identique après restauration) : `REVERB_APP_SECRET` retirée de `cles:` de l'action →
  `check-actions-de-deploiement` code 1 (« la clé `REVERB_APP_SECRET` est neuve et aucune action … ne la nomme ») ;
  `BROADCAST_CONNECTION=null` au gabarit → `check-env-production` code 1 (« BROADCAST_CONNECTION doit valoir
  « reverb » en production »).
- **AC5** — `node scripts/check-actions-de-deploiement.mjs --report preview` (et `production`) liste « Poser le temps
  réel … » en à faire, avec `clés : REVERB_APP_ID, REVERB_APP_KEY, REVERB_APP_SECRET, BROADCAST_CONNECTION,
  TEMPS_REEL_URL, TEMPS_REEL_CLE`. Le rapport n'imprimait pas les clés : une ligne ajoutée à la garde (seul ajout).
- **`compose.api.yml`** : `docker compose config -q` vert avec les seules `IMAGE_TAG`, `API_ALIAS`, `REDIS_PASSWORD`
  et un `.env` vide (copie dans le scratchpad) ; `api` et `temps-reel` reçoivent `REVERB_HOST:
  takussan-api-preview-temps-reel`, `REVERB_PORT: "8080"`, `REVERB_SCHEME: http`.

- **La sonde de santé de `temps-reel`** (la ligne `php -r file_get_contents('http://127.0.0.1:8080/up')` de
  `compose.api.yml`) jouée dans un `reverb:start` jetable : code 0 ; témoin sur un port fermé : code 1.
- `APP_ENV=local` relu dans `takussan-api/.env.example`, `.env.docker` et le `.env` du poste : le Reverb de
  développement est bien en `*`.

### Écarts au ticket

- **`REVERB_APP_ID` a une valeur au gabarit** (`takussan`), pas un vide : ce n'est pas un secret (l'identifiant
  figure dans le chemin de publication `/apps/<id>/events`), et un vide aurait demandé une entrée de plus dans
  `VIDES_PERMISES` pour une clé qu'il faut de toute façon remplir. KEY et SECRET restent vides (secrets pour la garde).
- **`config/broadcasting.php` modifié** (non nommé par le ticket) : le défaut `''` des trois `REVERB_APP_*`, pour que
  « rien ne change tant que les clés ne sont pas posées » (AC6) tienne même si l'onglet n'a aucune ligne `REVERB_APP_*`.
- **`smoke-api.sh image`** gagne `verifier_diffuseur_sans_cles` (AC6 dans l'image) ; **`.env.smoke.example`** porte
  `BROADCAST_CONNECTION=reverb`, `REVERB_APP_ID=smoke` et des `REVERB_HOST`/`PORT`/`SCHEME` FAUX EXPRÈS (le patron de
  `REDIS_HOST`), et `preparer_pile` tire `REVERB_APP_KEY` et `REVERB_APP_SECRET` au hasard.
- **Section « 19. Temps réel »** dans les trois fichiers de l'API (« Résidus » devient 20) : les six `REVERB_*` de
  développement y vivent ensemble dans `.env.example` et `.env.docker` ; seules les trois `REVERB_APP_*` sont au
  gabarit, `REVERB_HOST`/`PORT`/`SCHEME` rejoignent le groupe de résidus « écrites par compose.api.yml ».
- `check-actions-de-deploiement.mjs` touché (une ligne de rapport, AC5) bien que le ticket ne le nomme pas.

### Reste

- **AC1 (pile), AC3 (pile) et AC6 (image) non mesurés sur l'image de l'API** : il faut d'abord
  `docker build --build-arg BUILD_SHA=smoke --target runtime -t ghcr.io/thiambara/takussan-api:local takussan-api`
  et `--target seed -t …:local-seed`, puis `deploy/takussan/smoke-api.sh image` et `deploy/takussan/smoke-api.sh pile` —
  plus longs que la borne de 9 minutes d'un agent ; à jouer par la session, machine au repos.
- **AC3, moitié `./dev.sh`** : non jouée (consigne : `./dev.sh` non lancé). Couverte par la règle `*` en `local`, mesurée
  sur un Reverb en `APP_ENV=local` (`localhost:3000`, `127.0.0.1:3000` et sans Origin admis).
- **AC6, seconde puce** (« moins d'1 s de plus ») : tenue par `config/broadcasting.php` (`timeout` et `connect_timeout`
  à 1 s, TCK-2952) et par le disjoncteur de `TempsReel` ; non re-mesurée ici. Troisième puce (front sans
  `TEMPS_REEL_URL`) : TCK-2954.
- **`mem_limit`** à relever dans l'image de l'API, sur la préproduction (action, « Comment vérifier », point 1).


### Mesure de la session (2026-11-18, 09:19 → 09:29) : AC1, AC3 (pile) et AC6 (image)

Image construite depuis `a64d88657` (`--target runtime` et `--target seed`, `BUILD_SHA=smoke`), machine peu chargée :

- `deploy/takussan/smoke-api.sh image` → **sortie 0**, dont « ✓ BROADCAST_CONNECTION=reverb sans aucune clé REVERB_APP_* : l'API démarre (l'émission échouera, avalée) » (AC6) ;
- `deploy/takussan/smoke-api.sh pile` → **sortie 0**, dont :
  - « ✓ temps-reel sain (GET /up du serveur Reverb) » ;
  - « ✓ l'API vise takussan-api-smoke-temps-reel (écrit par la pile, malgré le .env), qui répond sur dokploy-network » ;
  - « ✓ origines : http://localhost:3000 admise, https://autre.example refusée en 4009 » ;
  - « ✓ un signal émis par l'API arrive au client WebSocket abonné, de l'intérieur de la pile » ;
  - « ✓ aucun service ne redémarre » ;
  - mémoire `takussan-smoke-temps-reel-1` à 57,42 Mio sur 384 Mio.

Reste, hors de portée locale : la moitié `./dev.sh` d'AC3, et tout ce que l'action de déploiement confie à une personne (DNS, Dokploy, clés).
