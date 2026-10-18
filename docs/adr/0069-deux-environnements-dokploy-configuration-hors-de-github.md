# ADR-0069 — Préproduction et production sont deux environnements Dokploy ; la configuration vit dans Dokploy, les images n'en portent aucune

- **Statut** : Accepté le 2026-10-18 par le porteur (décisions du 2026-10-17 : 1a, 3a, 4a, « les
  variables d'environnement quittent GitHub », et le déclencheur gardé dans GitHub, option a)
- **Date** : 2026-10-18
- **Tickets** : à écrire (un par section de la décision, dans l'ordre de l'Application)
- **Amende** : [ADR-0028](0028-auto-hebergement-conteneurise-sur-le-vps.md) § 3 (une image de front
  par environnement → une seule image par commit), § 5 (réseau des piles), § 6 (un Redis par
  projet → un Redis par environnement) et § 7 (sauvegarde nocturne → restauration à l'instant près
  pour la production). Le reste d'ADR-0028 tient.

## Contexte

Audit du 2026-10-17, demandé par le porteur, qui comparait l'installation à Vercel (un environnement
de préproduction et un de production, chacun avec sa configuration). Tout a été mesuré sur l'API de
Dokploy (v0.30.8) et sur le serveur, en lecture seule :

- **Dokploy a des environnements, et nous ne nous en servons pas.** Un projet Dokploy contient des
  environnements, chacun avec ses services et ses variables partagées (`${{environment.X}}`), et
  l'API sait déplacer un service de l'un à l'autre (`application.move`, `compose.move`). Le projet
  **Takussan** n'en a qu'un, créé par défaut et nommé **`production`**, et il contient les deux
  services de **préproduction**, `takussan-web-preview` et `takussan-api-preview`. La phase F du
  plan (F3, étape 1) ajoutait la production dans ce même environnement.
- **Toutes les piles partagent `dokploy-network`, et `api` y est un alias.** Compose donne à chaque
  service l'alias de son nom sur chaque réseau. Avec deux piles, `api` désignerait les deux API, et
  le plan contourne le problème par le nom du conteneur (F3, `API_INTERNAL_URL`). Le Redis et la base
  de chaque environnement sont joignables par le réseau depuis l'autre.
- **Un seul Redis, avec un seul mot de passe** (`redis-takussan`, Compose `donnees`), séparé par le
  numéro de base (`REDIS_DB` 0/1 en préproduction, 2/3 prévus en production). La préproduction
  est volontairement moins sûre (`OTP_PREVIEW_ENABLED=true`, comptes de test partagés) : un secret
  qui fuit de ce côté ouvre le cache et les sessions de la production.
- **La base ne se restaure qu'à la nuit près.** `archive_mode=off` ; une sauvegarde `pg_dump` par
  nuit vers R2, 14 exemplaires, sans verrou de rétention sur le seau `vps-sauvegardes`. En
  production, avec des encaissements et des signatures de bail, c'est jusqu'à 24 h perdues.
- **La configuration du front est dans GitHub.** `images.yml` inscrit `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_SITE_URL` et `NEXT_PUBLIC_MEDIA_URL` dans l'image au build, une valeur par branche, et
  ADR-0028 § 3 en a tiré « une image de front par environnement ». Les identifiants Dokploy et les
  secrets de déploiement vivent dans l'environnement GitHub `preview`. GitHub porte en plus deux
  environnements sans règle, `Preview` et `Production` (le second, hérité de Vercel), et le plan en
  créait un troisième, `prod`.
- **Le dépôt peut devenir privé dans quelques mois** (porteur, 2026-10-17). Sur le plan gratuit de
  GitHub, un dépôt privé perd les environnements et leurs secrets, la protection des branches, et le
  réviseur obligatoire d'un environnement (réservé aux dépôts publics hors Enterprise). Tout ce qui
  repose sur un environnement GitHub tomberait ce jour-là.

Trois faits rendent la troisième décision possible :

- **le layout racine du front lit `cookies()`** (`takussan-web/src/app/layout.tsx`) : toutes les
  routes sont déjà rendues à la demande, une valeur lue à l'exécution atteint donc chaque page ;
- **les lectures côté client sont rares** : 31 fichiers de `src/` lisent `NEXT_PUBLIC_*`, surtout
  des route handlers. Six seulement s'exécutent dans le navigateur : `lib/api.ts`,
  `lib/image-loader.ts`, `useTelechargementApi`, `AuditTrail`, `InventoryPdfButton` et
  `QuoteActions` ;
- **`resoudreOrigineSite()` n'est importé que par des fichiers serveur** (`alternates.ts`, relevé
  du 2026-08-27).

## Décision

### 1. Deux environnements Dokploy dans le projet Takussan

- **`preview`** et **`production`**. Les deux services de préproduction sont **déplacés** dans
  `preview` (`application.move`, `compose.move`), sans être recréés : leurs identifiants ne changent
  pas. Le déplacement est prouvé par trois relevés, avant et après :
  - le nom interne du Compose (`takussan-api-preview-4iza80`), dont dépendent la commande de
    déploiement, le volume `storage` et le préfixe des sauvegardes ;
  - `X-Build-Sha` servi ;
  - un déploiement `done`.
- **`production` reste vide jusqu'à la phase F.** La production y est créée **à partir de la table
  de F3**, jamais par `environment.duplicate`, qui recopierait les secrets de la préproduction
  (`APP_KEY`, jeton R2, mot de passe de la base).
- **Le projet `Serveur` reste l'infrastructure partagée, et seulement elle** : l'instance PostgreSQL
  et Meilisearch. Le Redis en sort (§ 3).

### 2. La configuration vit dans Dokploy ; GitHub construit et déclenche, rien d'autre

- **Ce qui ne vaut que pour un environnement** (origines, URL publiques, clés de fournisseurs,
  drapeaux) se pose dans Dokploy : au niveau de l'environnement quand plusieurs services le lisent
  (`${{environment.SITE_URL}}`), sinon au niveau du service. Le relevé (`docs/infra/hebergement.md`)
  en porte les **clés**, jamais les valeurs, comme aujourd'hui.
- **GitHub ne garde aucun environnement.** `environment:` disparaît d'`images.yml`, et les
  environnements GitHub `Preview` et `Production` sont supprimés. Il reste des **secrets de
  dépôt**, disponibles sur un dépôt privé gratuit, et seulement ce qu'il faut pour déclencher et
  prouver un déploiement :
  - un déclencheur par service à déployer. Si le webhook de déploiement de Dokploy se déclenche
    sans charge utile GitHub, ce sera son URL, limitée à ce service. Sinon, ce sera la clé d'API.
    C'est à mesurer en premier ;
  - le compte `ci` de l'authentification basique de la préproduction.
- **La branche choisit la cible, pas la configuration** : `preview` déploie l'environnement
  `preview`, `master` l'environnement `production`. Le `case` d'`images.yml` ne porte plus d'URL.
- **Le réviseur obligatoire de F2 est abandonné.** Il disparaîtrait avec le dépôt public. Ce qui
  garde la production, c'est la protection de `master`, tant que le dépôt est public, et la
  promotion par PR décidée par le porteur.

### 3. Une image par commit, front compris : l'image ne porte plus d'environnement

- **Le front lit sa configuration à l'exécution.** Les trois valeurs deviennent des variables
  d'exécution sans préfixe `NEXT_PUBLIC_`, que Next n'inline donc pas : `API_URL`, `SITE_URL`,
  `MEDIA_URL`.
  - Le serveur les lit dans `process.env`.
  - Le navigateur les reçoit du layout racine : un objet de configuration publique, sérialisé
    dans la page, lu par un module unique. Aucun composant ne relit `process.env` côté client.
  - Ces trois valeurs sont publiques par nature. Aucun secret ne passe par ce canal, et une garde
    le vérifie.
- **La protection d'ADR-0028 § 3 passe du build au démarrage.** Le conteneur **refuse de démarrer**
  sans `SITE_URL`, `API_URL` et `MEDIA_URL` bien formées (origine seule, sans chemin). C'est le
  contrôle que `next.config.ts` fait aujourd'hui sur `NEXT_PUBLIC_MEDIA_URL`. Une préproduction
  sans `SITE_URL` ne peut donc toujours pas déclarer ses pages canoniques en production
  (ADR-0026) : elle ne sert rien du tout.
- **Le loader de Cloudflare Transformations devient inconditionnel** dès que plus aucune branche ne
  passe par Vercel (phase F, F5). D'ici là, la lecture de `NEXT_PUBLIC_*` reste un repli pour le seul
  build de Vercel, et disparaît avec lui. *Note du 2026-10-18 : Vercel est supprimé depuis le
  2026-10-15, avant la phase F ; ce repli, le loader conditionnel et la branche `VERCEL_ENV` sont du
  code mort, retiré par TCK-860.*
- **La production sert l'image que la préproduction a servie.** Chaque image est étiquetée
  `sha-<commit>` et `tree-<arbre>`, l'arbre étant celui du commit, comme la clé d'ADR-0063.
  Au push sur `master`, l'image dont l'arbre égale celui de `master` est **réétiquetée** `production`.
  Elle n'est reconstruite que si elle n'existe pas. La promotion `dev → preview → master` ne change
  pas l'arbre : en pratique, rien ne se reconstruit.
- **Les étiquettes d'environnement (`preview`, `production`) se déplacent, les `sha-` jamais.**
  Revenir en arrière, c'est réétiqueter un `sha-` précédent, puis redéployer.

### 4. Un réseau, un Redis et un nom d'API par environnement

- **Redis rejoint la pile d'API.** `compose.api.yml` gagne un service `redis`, avec son volume,
  sur le réseau **propre à la pile** : pas sur `dokploy-network`, aucun port publié, un mot de passe
  par environnement. Chaque environnement a donc le sien, et aucun conteneur de l'autre ne peut le
  joindre. `redis-takussan` quitte `compose.data.yml` une fois la préproduction basculée.
- **Le front joint l'API de son environnement par un nom propre à l'environnement**, déclaré comme
  alias réseau dans `compose.api.yml` (`${API_ALIAS}`, par exemple `takussan-api-preview` et
  `takussan-api-production`), **jamais par `api`**. Une garde du dépôt refuse `http://api:` dans la
  configuration et la documentation de déploiement.
- **Ce qui reste partagé l'est délibérément**, et sous des identifiants séparés :
  - l'instance PostgreSQL : une base, un rôle et `REVOKE CONNECT … FROM PUBLIC` par environnement
    (ADR-0028 § 6) ;
  - Meilisearch : une clé restreinte aux index de chaque environnement ;
  - Traefik.

### 5. La production se restaure à l'instant près

- **Archivage continu des journaux de transactions (WAL) de l'instance PostgreSQL vers R2, par
  WAL-G.**
  - L'image de la base devient `pgvector/pgvector` à une version épinglée, plus WAL-G, construite
    par GitHub Actions et déclarée dans le service *Database* de Dokploy, qui accepte une image
    propre.
  - `archive_timeout = 300` : au plus 5 minutes perdues.
  - Une sauvegarde de base complète chaque semaine, et 14 jours de journaux.
  - Un seau dédié, `takussan-wal`, avec un jeton qui n'écrit que là.
- **La sauvegarde `pg_dump` nocturne de Dokploy reste.** C'est une copie logique, indépendante de
  WAL-G, et lisible sans lui.
- **Un verrou de rétention (*Bucket Lock*, 7 jours) sur `vps-sauvegardes` et `takussan-wal`.** Un
  serveur compromis ne peut plus effacer ses propres sauvegardes de la semaine.
- **ADR-0028 § 7 s'applique à WAL-G avant la mise en production.** Il faut une restauration à un
  instant choisi, sur une instance vierge, mesurée : comptes de lignes, et la dernière ligne écrite
  avant l'instant visé est présente. *Depuis le 2026-10-18 (P42.03, ADR-0028 § 7 amendé), la copie
  doit aussi se lire : `backup:verify-encryption` sort en `0` avec l'`APP_KEY` de l'environnement.*

## Conséquences

- **Le front ne se construit plus qu'une fois par commit**, et ce que la production sert est
  exactement ce que la préproduction a servi. Le cache de build cesse d'être séparé par
  environnement.
- **Changer une URL ou une clé ne demande plus de reconstruire** : on la modifie dans Dokploy, puis
  on redéploie.
- **Un oubli dans Dokploy se voit au démarrage, plus au build.** Le conteneur refuse de démarrer,
  Swarm garde l'ancien (`start-first`, retour arrière automatique, relevé le 2026-10-17), et la
  preuve `X-Build-Sha` d'`images.yml` rougit.
- **La page porte un objet de configuration de plus.** Trois origines, une fois par page.
- **Le WAL est celui de toute l'instance**, préproduction comprise : un seed de préproduction
  produit des journaux que l'archive conserve. À mesurer pendant un seed. Si le volume est
  déraisonnable, la production prend sa propre instance PostgreSQL, ce qui demandera un amendement.
- **Chaque environnement a son propre Redis : +192 Mo.** Le budget mesuré au repos le permet
  (5,4 Go disponibles le 2026-10-17), et la mesure à quatre environnements de F3, étape 6, reste
  due.
- **Passer le dépôt en privé ne casse plus le déploiement.** Il restera à faire, ce jour-là :
  - déclarer le registre GHCR dans Dokploy (jeton `read:packages`) ;
  - faire cloner les Compose par le fournisseur GitHub de Dokploy, qui est déjà déclaré et doit
    être gardé ;
  - accepter la perte de la protection des branches, ou passer à GitHub Pro ;
  - surveiller le plafond de minutes d'Actions.

  `hebergement.md` en portera la liste.
- **Le plan de la phase F est à reprendre** : F2 étapes 1 et 2, F3 étapes 1 et 2.

## Alternatives écartées

| Option | Pourquoi non |
|---|---|
| Garder une image de front par environnement, les valeurs dans `images.yml` | La configuration reste dans GitHub, contre la décision du porteur, et la production sert une image que la préproduction n'a jamais servie. |
| Construire le front dans Dokploy, avec ses variables comme arguments de build | ADR-0028 § 2 : le serveur ne construit rien (vCPU partagé, `next build` le sature). |
| Remplacer au démarrage des valeurs sentinelles dans `.next/` | Les flux RSC portent des longueurs de texte : changer la longueur d'une chaîne peut corrompre un rendu, sans erreur visible. |
| Renommer `production` en `preview`, puis recréer `production` | On renomme l'environnement par défaut de Dokploy au lieu d'y ranger ce qu'il annonce. Le déplacement garde les mêmes identifiants, pour le même coût. |
| Un second VPS pour la préproduction | C'est l'isolation la plus nette, mais elle coûte. Elle reste le premier geste de montée en charge (ADR-0028), plus tard. |
| Sauvegarde `pg_dump` toutes les heures | Elle perd encore jusqu'à une heure, et chaque passage relit toute la base. |
| Une instance PostgreSQL propre à la production | Décision 3a du porteur : instance commune, rôle propre. Elle reste la sortie si le volume de WAL ou la charge l'imposent. |

## Application

Dans cet ordre. Chaque étape est un ticket, prouvé par une mesure avant/après :

1. **Environnements Dokploy** (§ 1) : créer `preview` et y déplacer les deux services ; consigner
   le relevé dans `hebergement.md`.
2. **Configuration du front à l'exécution** (§ 3), en code seulement : le module de configuration
   publique, le refus au démarrage, le loader inconditionnel hors Vercel. Il faut un test qui
   rougit si un fichier client lit `process.env`, et un test du démarrage refusé.
3. **`images.yml` sans environnement GitHub** (§ 2, § 3) : une image par commit, étiquettes `sha-`
   et `tree-`, la variable `SITE_URL` et les autres posées dans Dokploy pour `preview`, puis la
   suppression des environnements `Preview` et `Production` de GitHub.
4. **Redis et nom d'API par environnement** (§ 4) : le service `redis` dans `compose.api.yml`,
   l'alias `${API_ALIAS}`, `API_INTERNAL_URL` posée sur `takussan-web-preview` (elle rejoint les
   réglages de TCK-720), la garde contre `http://api:`, puis le retrait de `redis-takussan`.
5. **WAL-G** (§ 5) : l'image de la base, le seau, le jeton, le verrou de rétention, et la
   restauration à un instant choisi, mesurée.
6. **Le plan de la phase F** : F2 et F3 réécrits sur cette base.
