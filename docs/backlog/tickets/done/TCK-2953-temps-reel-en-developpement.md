---
id: TCK-2953
title: "Le temps réel en développement : Reverb lancé par ./dev.sh, sondé par doctor, et les clés des deux applications"
status: done
phase: P1
family: technique
estimate: S
wave: 93
created: 2026-11-17
updated: 2026-11-18
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

### Re-mesure de la prémisse (2026-11-18)

- Ports `8080` et `8081` relevés libres sur le poste (`lsof -nP -iTCP:808x -sTCP:LISTEN` vide).
- **Conteneur sur l'image officielle : impraticable.** `php:8.4-cli-alpine` (PHP 8.4.27) sur le code
  monté en lecture seule : `artisan` démarre (le `platform_check.php` du lock ne vérifie que la version de
  PHP), mais `reverb:start` meurt sur `Undefined constant …\SIGINT` (`StartServer::getSubscribedSignals()`) :
  l'image n'a pas `pcntl`. L'y ajouter demande un `Dockerfile`, c'est-à-dire dupliquer l'environnement PHP.
- **Conteneur sur `serversideup/php:8.4-cli-alpine` : praticable, sans construction.** L'image porte `pcntl`
  et `pdo_pgsql` (PHP 8.4.27, utilisateur `www-data`, `curl` présent ; digest
  `sha256:2f1fec8dfa0a5d057b48d32acebe54aa562f5b35432b0264854fae26a6ca9927`). Conteneur jetable
  `takussan-reverb-mesure-2953` (code monté `:ro`, `CACHE_STORE=array`, `LOG_CHANNEL=stderr`, clés de dev
  passées par `-e`) : `GET /up` → `{"health":"OK"}` 200 ; `ws://127.0.0.1:18081/app/cle-dev` →
  `pusher:connection_established` ; une clé inconnue → `pusher:error` 4001 « Application does not exist ».
  Le service reste donc un conteneur (ADR-0129 § 5 tenu, aucun amendement).
- `CACHE_STORE=array` et `LOG_CHANNEL=stderr` sont nécessaires dans le conteneur : le `.env` monté vise la
  base et le cache sur `127.0.0.1` (le conteneur lui-même), et `reverb:start` lit le cache au démarrage puis
  toutes les 5 s (signal de `reverb:restart`). Conséquence : `reverb:restart` est sans effet sur ce service ;
  on le redémarre par `docker compose restart reverb`.
- Le `.env` de travail partagé (`takussan-api/.env`) ne déclare aucune `REVERB_*` : il n'a pas été modifié ;
  les mesures passent leurs clés par l'environnement du processus.


### Décisions et écarts (2026-11-18)

- **Image `serversideup/php:8.4.27-cli-alpine-v5.1.3`** (même digest que `8.4-cli-alpine`, relu par
  `docker buildx imagetools inspect`) : épinglée, et au plancher PHP2Shell (8.4.27). Ajoutée à
  `docs/infra/versions.json` (`check-infra-versions` rougit sur toute image absente du catalogue — fichier que le
  ticket ne nommait pas).
- **Une source pour les clés : le `.env` monté.** Le conteneur ne déclare dans `environment:` que
  `CACHE_STORE=array` et `LOG_CHANNEL=stderr` ; `REVERB_APP_*` viennent de `takussan-api/.env`, lu aussi par l'API.
  L'API qui signe et le serveur qui vérifie ne peuvent pas diverger — sauf entre deux démarrages du conteneur
  (il lit le `.env` au démarrage), ce que la sonde de clé de `doctor` attrape (4001).
- Montage **en lecture seule**, sur `/var/www/html` (répertoire de travail de l'image). Mesuré : démarre sur un
  `bootstrap/cache` vide (`--tmpfs`) et tient 70 s, au-delà des minuteries de 5 s et 60 s, `/up` toujours 200.
- **Le hachage de configuration des quatre services existants est inchangé** (`docker compose config --hash '*'`
  avant/après : seule la ligne `reverb` apparaît) : le prochain `./dev.sh` ne recrée ni postgres ni les autres.
  `reverb` n'a pas de `depends_on`.
- `dev.sh` : le `docker compose up -d` existant lève les cinq services (repli `ATTENDUS` passé à 5, libellés et
  liens mis à jour). `doctor` sonde Reverb quand `BROADCAST_CONNECTION=reverb` en deux temps, comme Meilisearch :
  `GET /up` (répond) puis poignée de main WebSocket sur `/app/<REVERB_APP_KEY>` (accepte la clé publique ; le secret
  n'est éprouvé que par une émission réelle). Sur un Node sans `WebSocket` natif (< 22), la sonde de clé se tait.
  **L'écart de port est jugé pour TOUT port local différent** du service, pas seulement le port canonique comme
  `ecart_port_natif` : aucune instance native de Reverb n'écoute d'ordinaire sur 8080. Un `.env` visant les
  conteneurs mais pas `reverb` est nommé (patron de Redis : « le service tourne, l'API n'y émet rien »).
  Côté front, `doctor` nomme le mode dégradé (clé absente ou vide), une `TEMPS_REEL_CLE` ≠ `REVERB_APP_KEY`, et une
  `TEMPS_REEL_URL` sur un autre port que le service.
- `check-env-production.mjs` : les six `REVERB_*` forment leur propre groupe de résidus (motif du ticket) ; le
  groupe Pusher/Ably garde le motif « pilote de diffusion non utilisé : seul Reverb diffuse (ADR-0129) ».
  `TEMPS_REEL_URL` et `TEMPS_REEL_CLE` entrent dans `VIDES_PERMISES`, et dans le gabarit web sous la classe
  `# intégration` (vide = fonction éteinte, comme les clés de fournisseurs), section « 5. Temps réel » des deux côtés.
- **`PreferenceResolver::channelsFor()` (reste de TCK-2952) : fermé ici.** La case `push` ne s'ouvre plus selon
  `broadcasting.default` — jamais : aucune notification ne part par `broadcast`, et le porteur a exclu la
  notification push. Constante `CHANNEL_PUSH` et `CHANNELS` gardées (la case reste dans la matrice, verrouillée
  `channel_unavailable`). Test : `NotificationPreferenceTest::test_le_pilote_reverb_n_ouvre_aucune_case_push`.

- **Le serveur meurt en silence sur un `.env` sans `REVERB_APP_KEY`, d'où un repli dans la commande du service.**
  Mesuré le 2026-11-18 sur le `.env` partagé du poste (sans aucune `REVERB_*`), service levé tel que déclaré :
  `healthy` en quelques secondes, puis **sorti en 0 sans une ligne de journal** vers 60 s (la minuterie qui
  parcourt les applications ; cause probable : une application de clé `null`). Avec les clés, il tient 90 s. Un
  `.env` d'avant TCK-2953 aurait donc donné un service qui passe l'attente de santé de `./dev.sh` puis disparaît.
  La commande du service est un `sh -c` qui, **seulement si** le `.env` monté n'a pas de `REVERB_APP_KEY` non
  vide, exporte les trois identifiants de développement de `.env.docker` dans l'environnement du processus et le
  dit sur stderr. Mesuré : `.env` partagé (sans clés) → en marche et `healthy` à 80 s, `takussan-dev-cle`
  acceptée ; `.env` de substitution portant `REVERB_APP_KEY=autre-cle` → `autre-cle` acceptée,
  `takussan-dev-cle` refusée (4001) : le `.env` reste la source quand il porte les clés. Troisième copie des
  valeurs de développement : écrite dans le commentaire du service, elles bougent avec `.env.docker`.
- ADR-0129 § 5 relu : service `reverb` dans `docker-compose.yml`, lancé par `./dev.sh`, sondé par `doctor`, clés
  `REVERB_*` et `TEMPS_REEL_*` — conforme, aucun amendement. Aucun workflow ni script ne lance `docker compose up`
  sur ce fichier (`repo-ci.yml` ne le cite que comme chemin déclencheur).

### Mesures des critères (2026-11-18)

- **AC1 — non mesuré par `./dev.sh`** (le service seul l'est). `./dev.sh` n'a PAS été lancé (consigne : les conteneurs servent d'autres agents). Le service **tel
  que déclaré** a été levé sous un autre projet, avec les clés de `.env.docker` passées par un fichier de
  surcharge (le `.env` partagé n'en a pas) :
  `docker compose -p takussan-mesure-2953 -f docker-compose.yml -f <surcharge> up -d --no-deps reverb` →
  `healthy` en < 10 s, `127.0.0.1:8081->8080/tcp`. Client Node 24 sur `ws://127.0.0.1:8081/app/takussan-dev-cle` :
  `{"event":"pusher:connection_established","data":"{\"socket_id\":\"521551918.229493823\",\"activity_timeout\":30}"}`.
  Conteneur et réseau retirés ensuite.
- **AC2 — non mesuré par `doctor`** (les fonctions de sonde seules le sont ; l'attente de santé à cinq services et la branche `BROADCAST_ENV` en ligne n'ont pas tourné). `doctor` n'a pas été lancé (même consigne). Les fonctions `sonde_reverb` et `ecart_port_reverb` ont été
  extraites de `dev.sh` (sed) et jouées sous `set -euo pipefail` : levé + bonne clé → `✓ Reverb répond sur
  127.0.0.1:8081 et accepte REVERB_APP_KEY` ; mauvaise clé → `✗ … REFUSE REVERB_APP_KEY — pusher:error
  {"code":4001,…}` ; **service arrêté** (`docker stop`) → `✗ Reverb NE RÉPOND PAS sur 127.0.0.1:8081 … —
  './dev.sh services' le lève`, et le harnais va au bout (`exit 0`). Écart `REVERB_PORT=8080` → avertissement ; même
  port ou hôte distant → silence. Bloc front : `.env.local` sans clés → « MODE DÉGRADÉ » ; clé ≠ → 4001 annoncé ;
  port ≠ → nommé ; tout juste → silence. `bash -n` et `shellcheck -S warning dev.sh` propres.
- **AC3** — API servie par `php -S 127.0.0.1:8095` depuis `public/` (le routeur d'`artisan serve`, sans son tri
  d'environnement), sous `BROADCAST_CONNECTION=reverb` et les `REVERB_*` de `.env.docker` passées au processus ;
  jeton Sanctum de l'utilisateur 1 créé par `tinker`. Client : connexion, `POST /api/broadcasting/auth` →
  **200, `auth: "takussan-dev-cle:<signature hex 64>"`** (la forme prouve le pilote `reverb`, pas seulement le
  statut), `pusher_internal:subscription_succeeded private-utilisateur.1`. Puis `tinker --execute` :
  `Notification::fake()` (canaux sortants neutralisés : ni courriel ni SMS) et `NotificationService::send(User 1,
  VisitRequested, [])` → reçu : `signal private-utilisateur.1 {"subject":"utilisateur:1","event":"notifications.updated",
  "cursor":"2026-11-18T00:49:34.187325Z"}`. Nettoyage : jeton et notification 5709 supprimés, serveur arrêté par PID.
- **AC4** — `check-env-parity`, `check-env-production`, `check-actions-de-deploiement`, `check-front-env-keys`,
  `check-webhook-env-keys` verts. Ablations (restauration par `cp`, `md5` identique) : `TEMPS_REEL_URL` retirée de
  `cles:` de l'action → `check-actions-de-deploiement` sort en 1 (« la clé `TEMPS_REEL_URL` est neuve et aucune
  action … ne la nomme ») ; `REVERB_SCHEME` retirée de `.env.docker` → `check-env-parity` sort en 1.
- **AC5** — le `.env` partagé n'a pas été écrasé. Forme équivalente : les six `REVERB_*` de `.env.example`
  injectées dans l'environnement du processus (`BROADCAST_CONNECTION` non injectée : en CI, `phpunit.xml` la pose
  avant que Dotenv lise le `.env` ; l'injecter par le processus la ferait gagner sur `phpunit.xml`, ce que la CI ne
  fait pas — essai fait, il rougit `test_la_suite_ne_diffuse_vers_aucun_serveur` pour cette seule raison) →
  `tests/Feature/TempsReel` 24 verts. `grep -E '^REVERB_[A-Z_]+=$' takussan-api/.env.example` ne rend rien.
- **Ablation `channelsFor()`** : version d'avant restaurée → le test neuf rougit (`locked` faux) ; correctif remis,
  `md5` identique. `NotificationPreferenceTest` (10), `NotificationPreferencesCatalogTest`,
  `Notifications/NotificationPreferenceTest`, `OverdueReminderServiceTest`, `BookingConfirmedChannelsTest`,
  `MobileClassEventsTest` : 36 verts.

### Reste

- **Pour la session** : jouer `./dev.sh doctor` puis `./dev.sh services` (ou `docker compose up -d reverb`) une fois
  les autres agents arrêtés — les mesures ci-dessus portent sur le service et sur les fonctions extraites, pas sur le
  script entier.
- **Les postes existants** : `takussan-api/.env` (ignoré par git) n'a ni `BROADCAST_CONNECTION=reverb` ni les six
  `REVERB_*` ; `takussan-web/.env.local` n'a pas les deux `TEMPS_REEL_*`. `./dev.sh` ne recopie les exemples que
  si le fichier manque ; `doctor` le nomme. À recopier à la main.
- Documents qui disent encore « quatre services » hors de ce ticket : `CLAUDE.md` racine (§ Environnement de
  développement), `docs/adr/0011-environnement-de-dev-conteneurise.md`.

### Relevé de la session (2026-11-18)

Mesuré sous `./dev.sh` le 2026-11-18 : `./dev.sh doctor` signale `BROADCAST_CONNECTION=log` et le front sans `TEMPS_REEL_*` (mode dégradé) ; une fois les clés de `.env.docker` et `.env.example` recopiées, `docker compose up -d reverb` rend le service healthy et un message de l'agent parvient au locataire en 615 ms (TCK-2955 AC10).
