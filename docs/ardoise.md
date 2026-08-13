# L'ardoise — inventaire des manquements

> **Mesuré le 2026-08-12**, à la reprise du développement, par un audit parallèle de sept axes
> (architecture back, architecture front, véracité du backlog, décisions non écrites, environnement
> de développement, fraîcheur documentaire, tests & CI) suivi d'une passe de vérification
> adversariale sur les constats les plus structurants.
>
> **Chaque entrée porte sa preuve.** Un inventaire de dettes se re-mesure avant d'être utilisé,
> jamais lu : les chiffres ci-dessous datent du 2026-08-12 et vieillissent à partir de là.
>
> **Ce document n'est pas un backlog.** Il nomme ce qui est faux ou absent aujourd'hui. Ce qui mérite
> d'être fait devient un ticket dans `docs/backlog/`, et l'entrée d'ardoise se ferme en le citant.

## Comment lire

| Marque | Sens |
|---|---|
| 🔴 **P0** | Casse la production, ou peut la casser au prochain déploiement. |
| 🟠 **P1** | Fait perdre du temps ou induit en erreur à chaque reprise du projet. |
| 🟡 **P2** | Incohérence réelle, coût diffus, pas de sinistre immédiat. |
| ✅ | Soldé pendant le chantier de reprise du 2026-08-12. |

---

## 🔴 Production — ce qui est cassé ou dangereux maintenant

Ces quatre-là ne se voient pas depuis le code. Aucun test, aucun lint, aucune lecture de `app/` ne
peut les trouver : ils vivent dans l'écart entre ce que le dépôt déclare et ce que la machine fait.

### D-01 — `composer.lock` ininstallable sur le PHP documenté ✅ *soldé côté dépôt le 2026-08-12*

> **Soldé côté dépôt** : `composer.json` déclare `"php": "^8.4"` et fige la résolution par
> `config.platform.php = 8.4.1`, pour que `composer` refuse lui-même l'écart au lieu qu'on le
> découvre au déploiement. Le guide de déploiement passe en `php8.4-*` et porte un encadré de
> migration.
>
> **✅ LE SERVEUR EST DÉJÀ EN 8.4 — correction du 2026-08-12, après mesure.** Une première
> rédaction de cette entrée annonçait une migration serveur à faire. C'était faux, et voici la
> preuve : le déploiement de **preview du 2026-06-20 a RÉUSSI**, `deploy.sh:134` lance
> `composer install --no-dev`, et le `composer.lock` de `origin/preview` à cette date exigeait
> **déjà** `php >=8.4.1` sur 17 paquets `symfony/*`. Un `composer install` ne peut pas réussir sur
> une version que le lock exclut.
>
> Preview et production **partagent le même serveur** (`178.18.247.62` pour les deux domaines).
> Il n'y a donc rien à migrer : **seule la documentation était en retard**, et elle est corrigée.
>
> *La leçon vaut plus que le correctif : « le guide dit 8.3 » ne prouve rien de ce que la machine
> exécute. Un déploiement réussi, lui, prouve une borne inférieure.*


`composer.json` annonce `"php": "^8.3"`. Le guide de déploiement prescrit
`apt install -y php8.3-fpm php8.3-mysql …`. Mais **19 paquets verrouillés exigent PHP ≥ 8.4** :
17 `symfony/*` en `php >=8.4.1` (`console`, `http-foundation`, `http-kernel`, `routing`, `mailer`,
`translation`, `var-dumper`…), plus `lcobucci/clock` (`~8.4.0 || ~8.5.0`) et
`spatie/laravel-activitylog` (`^8.4`).

Il n'y a **aucun `config.platform`** dans `composer.json` pour figer la cible. Un
`composer install --no-dev` sur un serveur en PHP 8.3 échoue.

> **Le piège est dans l'asymétrie** : la CI tourne sur PHP **8.4** (`shivammathur/setup-php` avec
> `php-version: '8.4'`), donc rien n'a jamais signalé l'écart. La machine qui valide et la machine qui
> sert ne parlent pas la même version, et c'est la seconde qui casse.

**Preuve** : `composer.json` ligne `"php": "^8.3"` · parsing de `composer.lock` → 19 paquets dont la
contrainte exclut 8.3 · `.github/workflows/api-ci.yml` → `php-version: '8.4'` ·
`docs/infra/deploy-preview.html` → `apt install -y php8.3-fpm`.

**Trancher** : soit la production passe en 8.4 et `composer.json` + le guide le disent, soit on
rétrograde les paquets. Dans les deux cas, poser un `config.platform.php` pour que `composer` refuse
lui-même l'écart au lieu de le découvrir au déploiement.

### D-02 — Le worker de production ne consommait qu'une file sur quatre ✅ *soldé le 2026-08-12*

> **Soldé** : `scripts/server-setup.sh` pose désormais
> `--queue=notifications-urgent,default,media,reconciliation` (l'ordre est la priorité).
>
> **Et la garde existe** : `scripts/check-queues.mjs` compare les `onQueue()` du code à la
> commande de production, et tourne dans `repo-ci.yml`. Prouvée par mutation, y compris sur le
> cas réaliste — « on ajoute une file nommée et on oublie de l'inscrire dans l'unité ».
>
> **⚠️ RESTE À FAIRE SUR LE SERVEUR** : rejouer `sudo bash scripts/server-setup.sh` pour réécrire
> l'unité systemd, puis `sudo systemctl restart takussan-queue`. Les jobs déjà empilés dans la
> table `jobs` seront alors consommés — vérifier leur volume avant, ils datent de mai.


`scripts/server-setup.sh:375` :

```
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --max-time=3600
```

**Aucun `--queue`.** Le worker ne consomme donc que la file `default`. Or le code pousse
explicitement sur trois files nommées : `onQueue('media')` (2 sites), `onQueue('reconciliation')`
(2 sites), `onQueue('notifications-urgent')` (1 site).

Ces jobs sont écrits en base et **ne sont jamais consommés**. Ils ne produisent ni erreur, ni
timeout, ni alerte : la ligne s'empile dans `jobs`, l'API a répondu 200, et l'effet attendu
n'arrive simplement jamais. *Une file sans consommateur est le défaut le plus silencieux qui soit.*

**Preuve** : `scripts/server-setup.sh:375` · `grep -rn "onQueue(" takussan-api/app/` → 5 sites sur
3 files nommées.

**Correctif** : `--queue=notifications-urgent,default,media,reconciliation` (l'ordre est la priorité).

### D-03 — La liste d'extensions PHP du guide était incomplète ✅ *soldé le 2026-08-12*

> **Soldé** : la ligne `apt install` du guide porte désormais `php8.4-intl`, `php8.4-gd`,
> `php8.4-bcmath` et `php8.4-redis`, et `docs/configuration.md` §5.1 a été réécrite — Meilisearch
> y était classé « optionnel » alors qu'il est obligatoire, et Redis obligatoire alors qu'il est
> optionnel. Les deux étaient exactement inversés.


Le guide prescrit `php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip`.
Manquent : **`intl`** (requis par `filament/support`), **`gd`** (`phpspreadsheet`, et les watermarks
`intervention/image`), **`bcmath`** (`moneyphp/money`), **`redis`** (`phpredis`, si `CACHE_STORE=redis`).

Une extension manquante ne dégrade pas une fonction : elle **empêche l'application entière de
démarrer**. Sur une installation neuve suivie à la lettre, l'application ne boote pas.

**Preuve** : `docs/infra/deploy-preview.html` (ligne `apt install`) confrontée aux `require` de
`composer.lock`.

### D-04 — La production n'a **jamais** été déployée 🔴 → [TCK-288](backlog/tickets/TCK-288-chaine-de-deploiement-master-fige.md)

> **DIAGNOSTIC CORRIGÉ le 2026-08-12.** L'entrée d'origine disait *« la production ne reçoit plus
> rien depuis trois mois »*, ce qui suppose qu'elle en recevait. **Elle n'en a jamais reçu.**
> Mesuré :
>
> - `gh run list` — **`deploy.yml` n'a jamais tourné, pas une seule fois**. Le seul workflow de
>   déploiement qui se soit exécuté est *Deploy Laravel API (Preview)*, cinq fois, sur `preview`.
> - `https://api.takussan.com/up` → **404**. `https://preview.api.takussan.com/up` → **200**.
> - `deploy.yml`, `deploy-preview.yml`, `deploy.sh` et `server-setup.sh` **n'existent pas sur
>   `master`** : la branche est antérieure au commit `14246ce6` qui a créé toute la chaîne.
> - `origin/dev..origin/master` = **0** — `master` n'a aucun commit propre, c'est un ancêtre strict
>   de `dev`. Un merge serait un simple *fast-forward*.
>
> **L'infrastructure est prête et attend** : DNS résolu, serveur répondant, et **les cinq secrets**
> exigés par `deploy.yml` — dont `ENV_FILE`, le `.env` de production — posés le 2026-05-19.
>
> **Et elle est BLOQUÉE, mécaniquement.** GitHub : `HTTP 404: workflow deploy.yml not found on the
> default branch`. La branche par défaut du dépôt est `master`, `deploy.yml` n'y existe pas, et
> GitHub n'expose `workflow_dispatch` que depuis la branche par défaut. Le blocage est **circulaire**
> — y pousser `deploy.yml` déclencherait le déploiement automatique, puisque son filtre `paths:`
> inclut ce fichier même. Ce qui dénoue : faire de `dev` la branche par défaut, ce qui ne déclenche
> rien et ne fait que rattraper la réalité. Séquence exacte dans TCK-288.
>
> **Résidu trouvé au passage** : `deploy-api-preprod.yml` est enregistré **actif** chez GitHub alors
> qu'il n'existe sur **aucune** branche, et ses deux seuls runs ont échoué en mai. Un workflow
> supprimé dont l'enregistrement survit — inoffensif, mais il fait croire à un pipeline de plus.
>
> Ce n'est donc pas une chaîne cassée à réparer, c'est **une première mise en production à faire**.
> Et cela change le risque : le workflow de production n'a **jamais été exercé**. Son jumeau de
> preview, oui, cinq fois — ce qui est rassurant sans être une preuve.

> **Seule dette P0 non soldée par le chantier du 2026-08-12, et c'est délibéré.** Les deux issues
> cohérentes — amener `dev` sur `master`, ou faire suivre le déclencheur à `dev` — passent par un
> **déploiement de production**. C'est une action sortante et difficilement réversible : elle
> appartient à une personne, pas à un agent. Le ticket pose l'arbitrage, ses deux branches, et son
> prérequis (la migration PHP, D-01).

`origin/master` est figé au **2026-05-18**, **31 commits derrière `dev`**. Or `deploy.yml` ne
déclenche le déploiement de production que sur un push vers `master`.

Tout le travail depuis mai — recherche Meilisearch, canal WhatsApp, refonte RBAC, profils
polymorphes, corrections de sécurité — vit sur `dev` et **n'a jamais été déployé**. Aucun document,
aucune alerte, aucun badge ne le signale ; la configuration du dépôt continue même d'annoncer
`master` comme branche principale.

**Preuve** : `git log origin/master -1` → 2026-05-18 · `git rev-list --count origin/master..dev` → 31 ·
`.github/workflows/deploy.yml` (trigger `push: branches: [master]`).

**Trancher** : soit `master` redevient la branche de production et on l'y amène, soit le déclencheur
suit `dev`. L'état actuel — une branche de production abandonnée qui reste le déclencheur — est le
seul qui ne soit défendable d'aucune façon.

### D-05 — Aucune garde MySQL, alors que les pièges sont documentés ✅ *soldé le 2026-08-12*

`CLAUDE.md` documente quatre familles de pièges « qui passent en CI mais cassent en prod » (DEFAULT
sur JSON/TEXT, `dropUnique` sous FK, nom d'index > 64 caractères, `enum()`). **Aucun job ne les
vérifiait** : la CI n'installait que `pdo_sqlite`/`sqlite3` et tournait sur `:memory:`, puis
`scripts/deploy.sh:148` lance `php artisan migrate --force` directement sur la base de production. La première
machine à exécuter ce DDL en conditions réelles était donc le serveur.

Le dépôt avait déjà payé ce défaut **deux fois**, et les correctifs sont dans son propre historique :
`c473081b` (« JSON column without DEFAULT for MySQL compat ») et `9815694f` (« name long
auto-generated index/FK to stay under MySQL 64-char limit »).

*Une famille de pièges connue, documentée, déjà rencontrée deux fois, et que rien n'attrapait : la
documentation avait remplacé la garde.*

**Soldé** : `api-ci.yml` porte un job `migrations-mysql` qui rejoue les migrations sur un service
MySQL 8.0, puis les **roule en arrière et les rejoue**. Il ne lance pas la suite de tests — c'est
le DDL qu'on éprouve.

> ⚠ **Ce job a tourné sur le mauvais moteur du 2026-06-29 au 2026-08-13** — `mariadb:11.4`, choisi
> sur la foi d'un `apt install mariadb-server` que personne n'avait exécuté. Le serveur est en
> **MySQL 8.0.46**, `utf8mb4_0900_ai_ci` (mesuré). Corrigé, et gardé par
> `scripts/check-db-engine.mjs` (D-43 ci-dessous).

> **Il a trouvé un défaut réel à sa PREMIÈRE exécution**, et c'était exactement le piège n°2.
> `2026_06_18_000001_add_performance_indexes_to_transactional_tables` posait un index composite
> `(agency_id, status)` sur `bookings`, `leases` et `invoices`. Comme `agency_id` est le préfixe
> gauche de ce composite, InnoDB retire l'index auto qui back la FK et **le composite devient le
> seul support de la contrainte** — si bien que le `down()` se voyait refuser sa suppression :
> `SQLSTATE[HY000] 1553 — Cannot drop index 'bookings_agency_id_status_index': needed in a foreign
> key constraint`. Sur les trois tables. Corrigé selon le patron documenté (lâcher la FK, retirer
> l'index, reposer la FK à l'identique), et vérifié sur MariaDB 11.4 — puis rejoué sur MySQL 8.0
> quand le moteur du banc d'essai a été corrigé.
>
> Ce défaut était **invisible par construction** : la CI tournait sur SQLite, qui accepte tout, et
> **la suite de tests n'exécute aucun `down()`**. Le `down()` est le code le moins exécuté du dépôt,
> et le seul dont on ait besoin le jour où un déploiement tourne mal.

### D-05bis — Aucun chemin de rollback au-delà du cutover RBAC ✅ *documenté le 2026-08-12*

> **Documenté** (la contrainte, elle, ne se corrige pas) : le guide de déploiement porte un
> encadré en tête de sa section Rollback. Il dit ce que le rollback ne peut PAS annuler — il
> restaure le code, jamais le schéma — et impose le dump pré-déploiement comme seule marche
> arrière réelle, **avec la vérification que le dump est relisible**. Un dump qu'on n'a jamais
> relu n'est pas une sauvegarde.


`2026_05_18_120000_drop_spatie_permission_tables` est **délibérément irréversible** : son `down()`
lève une `RuntimeException` avec le message *« Restore from a pre-cutover SQL dump if needed »*.

La décision est défendable — reconstituer des rôles historiques depuis un seeder n'aurait restauré
qu'une approximation, ce qui est pire qu'un refus (cf. [ADR-0002](adr/0002-role-est-un-profil-polymorphe.md)).
Mais sa conséquence n'était écrite nulle part : **un déploiement qui tourne mal au-delà de cette
migration n'a pas de marche arrière**, seulement une restauration de dump.

C'est une contrainte d'exploitation, pas un défaut de code. Elle doit figurer dans le runbook de
déploiement — et la procédure de dump pré-déploiement doit exister avant qu'on en ait besoin.

**Preuve** : `database/migrations/2026_05_18_120000_drop_spatie_permission_tables.php:26-32` ·
`php artisan migrate:refresh` sur MySQL → échec à cette migration.

---

## 🟠 Environnement, CI et gardes

### D-00 — 26 avis de sécurité sur 5 paquets, dont 8 de sévérité haute ✅ *découvert et soldé le 2026-08-12*

Trouvé **par accident**, en rafraîchissant l'empreinte du `composer.lock` après la correction de
D-01 : `composer` a signalé *« Found 26 security vulnerability advisories affecting 5 packages »*.
Personne ne l'avait vu, parce que **`composer audit` n'était lancé nulle part** — ni en CI, ni au
déploiement.

| Paquet | Avis | Le plus grave |
|---|---|---|
| `guzzlehttp/guzzle` | 9 (1 haute) | *Noncanonical host can bypass host-based checks* (CVE-2026-69246) |
| `league/commonmark` | 6 (4 hautes) | déni de service par XML profondément imbriqué |
| `dompdf/dompdf` | 6 | fuite d'existence de fichiers via SVG embarqué |
| `phpoffice/phpspreadsheet` | 3 (3 hautes) | épuisement mémoire sur XLS/OLE forgé |
| `guzzlehttp/psr7` | 2 | *Host Confusion via Weak URI Host Validation* |

**Soldé** : les cinq paquets mis à jour dans leurs plages de compatibilité — aucune montée de
version majeure, aucun changement de code applicatif. `guzzle` a demandé un second passage
(`7.15.2` exige `promises ^2.5.1`, épinglé en `2.5.0`), ce qui explique qu'une première mise à jour
l'ait laissé vulnérable.

**Vérifié** : `composer audit` → *« No security vulnerability advisories found »*, et **2052 tests
verts** après la mise à jour.

> **Ce qui reste ouvert, et qui compte plus que les cinq correctifs** : rien ne relancera cet audit.
> Ces avis se sont accumulés parce qu'aucune étape ne les regardait — trois des cinq paquets sont
> exposés à des données non fiables (`guzzle` sur les webhooks entrants, `commonmark` sur du texte
> utilisateur, `phpspreadsheet` sur des fichiers téléversés). Une étape `composer audit` en CI est
> la garde manquante ; elle n'a pas été ajoutée dans ce chantier parce qu'un avis publié un matin
> rendrait la CI rouge sur une PR qui n'y est pour rien. **C'est un arbitrage à poser** : audit
> bloquant sur les sévérités hautes, ou tâche planifiée qui ouvre un ticket.

### D-06 — Le frontend n'avait aucune CI ✅ *soldé le 2026-08-12*

`.github/workflows/` ne contenait qu'`api-ci.yml`, filtré sur `paths: takussan-api/**`. **Une PR ne
touchant que le frontend ne déclenchait rigoureusement rien** — ni les 802 tests vitest, ni ESLint,
ni `tsc`, ni le build.

Conséquence mesurée sur la pointe de `dev` : **trois régressions y vivaient depuis 53 à 94 jours** —
un test en échec (`FeatureFlagProvider`), une erreur ESLint bloquante
(`react-hooks/set-state-in-effect` dans `UserLocationProvider`), une erreur TypeScript
(`afterEach` non importé dans `FloatingDock.test.tsx`).

**Soldé** : les trois sont corrigées, et `.github/workflows/web-ci.yml` exécute désormais lint,
`tsc --noEmit`, tests et build. Le test réparé couvre en plus la porte `enabled: Boolean(user)` que
son commit d'origine avait introduite sans test — et la couverture est **prouvée par mutation**.

### D-07 — La CI était rouge depuis six semaines, sur une ligne vide ✅ *soldé le 2026-08-12*

`./vendor/bin/pint --test` échouait sur **un seul fichier** (`InventoryStoreRequest.php`, fixer
`class_attributes_separation` — une ligne blanche en trop). Comme Pint s'exécute **avant** `Run
tests`, **les 2052 tests de la suite n'avaient plus tourné en CI depuis le 2026-06-29**.

Le coût n'est pas le style : c'est que la garde qui compte a été éteinte par la garde qui ne compte
pas, et que personne ne l'a vu parce que le pipeline était rouge « pour du lint ».

**Soldé** : Pint appliqué, CI verte, 2052 tests verts.

**Reste ouvert** : la règle « Pint avant chaque commit » n'est imposée par **aucun mécanisme** — pas
de hook, pas de `lint-staged`. Elle repose sur la discipline, et la discipline a échoué six semaines.

### D-08 — Les tests écrivaient dans l'index Meilisearch réel du développeur ✅ *soldé le 2026-08-12*

> **Soldé** : `phpunit.xml` pose `SCOUT_PREFIX=testing_`. La suite n'écrit plus dans les index de
> travail. Le prérequis d'une instance Meilisearch reste entier — c'est ADR-0008, pas une dette —
> et `docker-compose.yml` la fournit.


`phpunit.xml` force `SCOUT_DRIVER=meilisearch` **sans repli**, et ne définit ni `MEILISEARCH_HOST`,
ni `MEILISEARCH_KEY`, ni **`SCOUT_PREFIX`**. Conséquence : `php artisan test` indexe et supprime dans
l'instance locale du développeur, sur les mêmes index que son environnement de travail. Aucune
isolation.

Corollaire : un développeur sans Meilisearch **ne peut pas lancer la suite du tout**.

**Preuve** : `takussan-api/phpunit.xml` bloc `<php>` · 10 fichiers de test en dépendent.

**Correctif** : poser `SCOUT_PREFIX=testing_` dans `phpunit.xml`.

### D-09 — Aucune version d'infrastructure n'est figée 🟠

| Service | Dev (brew) | CI | Production |
|---|---|---|---|
| Meilisearch | 1.36.0 | v1.16 | `apt install meilisearch` (latest) |
| Base | MySQL 9.3.0 | SQLite `:memory:` | **MySQL 8.0.46** *(mesuré le 2026-08-13)* |
| Redis | 8.0.2 | *(absent)* | *(absent)* |
| PHP | 8.4.6 | 8.4 | 8.3 *(cf. D-01)* |
| Node | 24.18 | *(aucune CI web avant D-06)* | Vercel (non déclaré) |

Trois environnements, trois piles différentes, aucune épinglée. `docker-compose.yml` fige désormais
la moitié dev (MySQL 8.0 aligné sur la production **mesurée**, Meilisearch v1.16 alignée sur la CI,
Redis 8) — la production, elle, reste posée par `apt` sans version épinglée dans le dépôt.

### D-10 — Le déploiement du frontend est entièrement hors dépôt 🟠

L'application Next.js — 875 fichiers, 111 pages — n'est déployée par **aucun** workflow ni script du
dépôt. Pas de `vercel.json`, pas de mapping branche→environnement documenté. La seule trace de
Vercel dans le dépôt est une regex d'origine CORS côté Laravel.

Il est donc **impossible de savoir, depuis le code, quelle branche déploie quel environnement front**.

### D-11 — Le guide de déploiement contredit les `.env` réellement livrés 🟠

`docs/infra/deploy-preview.html` prescrit `CACHE_STORE=database`, `SESSION_DRIVER=database`,
`MAIL_MAILER=log` — les `.env.preview` / `.env.prod` livrés utilisent `redis`, `redis`, `resend`.
`docs/configuration.md` §5.7 prescrit `QUEUE_CONNECTION=redis` alors que les deux `.env` utilisent
`database`, et exige `SESSION_SECURE_COOKIE=true` / `SESSION_SAME_SITE=lax`, **absents des deux**.

La checklist de production n'a jamais été confrontée aux fichiers qu'elle prétend décrire.

### D-12 — `.env.example` ne reproduit aucun environnement existant ✅ *atténué le 2026-08-12*

Il livrait `DB_CONNECTION=sqlite` (prod : MySQL 8), `SCOUT_DRIVER=collection` (CI et prod :
Meilisearch), et `CACHE_STORE=redis` **sans que rien ne provisionne Redis** — ni la CI, ni
`server-setup.sh`, et le guide dit explicitement « pas de Redis ». Un développeur qui suivait la
documentation obtenait une application qui ne démarre pas.

**Atténué** : `takussan-api/.env.docker` aligne chaque driver sur la production et est servi par
`docker-compose.yml` ; `scripts/check-env-parity.mjs` garde la parité des clés entre les deux
fichiers (83 clés de chaque côté), et la garde est **prouvée par mutation**.

**Reste ouvert** : `.env.example` lui-même n'a pas été corrigé — il reste le contrat des *clés*, mais
ses *valeurs* décrivent toujours un environnement fictif. Le corriger casserait la CI, qui fait
`cp .env.example .env` ; c'est un arbitrage à poser, pas un oubli.

### D-13 — Deux pièges du seeding, muets tous les deux 🟡

`SEED_DOWNLOAD_MEDIA=true` dans `.env.example` alors que le défaut du code est `false` : le premier
`migrate:fresh --seed` d'un nouveau développeur déclenche **1000 à 2700 téléchargements HTTP** vers
picsum.photos (timeout 15 s chacun), **avec tous les échecs avalés en silence**.

Et `LARAVEL_PDF_DRIVER=cloudflare` avec les deux identifiants vides : la génération de PDF est cassée
par défaut en développement. Le seul driver disponible en local est `dompdf`, et il n'est déclaré que
dans `phpunit.xml`. *(Corrigé dans `.env.docker`.)*

---

## 🟠 Documentation qui ment

C'est la famille la plus dense, et la plus coûteuse à la reprise : **lire un document faux coûte plus
cher que de ne rien lire**, parce qu'on ne s'en méfie pas.

### D-14 — `CLAUDE.md` et `AGENTS.md` décrivaient deux squelettes vides ✅ *soldé le 2026-08-12*

Le premier fichier que lit tout agent affirmait *« takussan-api : skeleton vierge. Seuls
`Controller.php` (abstract) et `User.php` existent »* et *« takussan-web : scaffold vierge
(create-next-app) »*. Faux depuis **118 jours** (écrit le 2026-04-15, reformulé le 2026-04-16,
jamais corrigé malgré deux éditions ultérieures) et **308 commits**, pour un dépôt de ~166 000 lignes
applicatives.

`AGENTS.md` en portait une **copie encore plus ancienne** (sans la section sur les pièges MySQL) et
pointait vers un dossier `.Codex/commands/` inexistant.

**Soldé** : `CLAUDE.md` réécrit sur des chiffres mesurés ; `AGENTS.md` ne duplique plus rien et y
renvoie ; `takussan-api/CLAUDE.md` et `takussan-web/CLAUDE.md` créés.

### D-15 — `docs/backlog/INDEX.md` était faux à 80 % ✅ *soldé le 2026-08-12*

**213 de ses 266 entrées** rangeaient un ticket dans une section que son frontmatter contredit. Il
affichait **40 tickets à faire et 177 en review** là où les frontmatters comptaient **3 et 2**.

Le document se condamnait lui-même : il déclarait en tête *« Vue kanban projetée depuis les
frontmatters »* puis *« le maintenir à la main »*. La colonne « Review » (177 entrées) ne
correspondait à **aucune PR ouverte** — `gh pr list --state open` rend `[]`, et les 39 numéros de PR
qu'elle citait sont **tous mergés**. Le premier ticket de la colonne « Todo » — la convention
documentée pour « implémente la tâche suivante » — était `done` depuis trois mois.

Trois encodages de statut se contredisaient dans un seul document : la section, un marqueur inline
`**[review]**`, et le frontmatter.

**Soldé** : `INDEX.md` est désormais **généré** par `docs/backlog/gen-index.mjs` depuis les
frontmatters, et `docs/backlog/check-backlog.mjs` garde sa fraîcheur. Les deux tournent en CI.

### D-16 — `docs/backend-gap-report.md` est un piège ✅ *banni le 2026-08-12*

> **Traité** : bandeau de péremption en tête du document, qui nomme trois de ses affirmations
> fausses avec le chemin qui les contredit. Conservé pour son historique et sa méthode — un audit
> périmé reste un modèle d'audit.


Il se présente comme un audit systématique code-vs-spec (338 lignes, daté du 18/04/2026) et déclare
**25 fonctionnalités « ❌ non implémenté »**. **20 d'entre elles sont implémentées aujourd'hui** —
« Aucun endpoint `unpublish` n'existe » alors que `routes/api/properties.php:42` le définit,
« Dupliquer un bien ❌ » alors que la route et `PropertyPolicy::duplicate()` existent, « Aucun job de
rappel de visite » alors que `SendPropertyVisitReminders` est planifié toutes les 5 minutes.

Un agent qui le lit pour prioriser rouvre des chantiers finis.

**Action** : archiver avec un bandeau de péremption, ou re-mesurer.

### D-17 — `docs/plans/routing-layouts-roles.md` prescrit une stack révoquée ✅ *banni le 2026-08-12*

> **Traité** : bandeau de révocation, avec le tableau « il prescrit / le projet est en ».


589 lignes qui imposent **Next.js 14**, **Tailwind v3** et la palette « Takussan Heritage »
(`#022448`, `#7d5630`, `#fff8f5`) avec des « Règles absolues » (« JAMAIS de `border-b` »,
« uniquement `shadow-[0_0_40px_…]` »). Le projet est en **Next 16, Tailwind v4, palette « Lin »**
depuis TCK-129.

Le ton impératif est ce qui rend ce document dangereux : il ne se présente pas comme une piste.

### D-18 — `docs/models-spec.md` ignore 16 modèles existants 🟠

Désigné source de vérité data, il ne mentionne **aucune** fois : `AccountDeletionRequest`,
`AlertRule`, `DataExport`, `FeatureFlag`, `IntegrationWebhookLog`, `KpiConfig`, `MaintenanceWindow`,
`NotificationDeliveryAttempt`, `PropertyPriceHistory`, `ReportExport`, `ScheduledTaskRun`,
`BankStatement`, `BankStatementLine`… et documente toujours `spatie/laravel-permission` comme
« package transversal » alors qu'il est **désinstallé** et qu'une garde CI casse sur ses imports.

`docs/sync-passes/INDEX.md` affiche par ailleurs un statut de convergence faux (« R1–R7 toujours non
appliquées » alors que R1 et R2 l'ont été), et la rupture qu'il signale date de **plus de trois
mois**.

### D-19 — Cinq documents cités n'existent pas 🟡

Dont un cité par **les deux specs sources** : `docs/takussan-whatsapp-implementation.md`
(`features.md:382`, `models-spec.md`, TCK-282), `docs/claude-code-prompt-notifications.md`
(`models-spec.md`), et trois autres.

Un pointeur mort dans une source de vérité est une dette que M8 de pharma-rebuild a payée en vrai —
un chemin cité pendant des semaines qui n'existait pas.

### D-20 — Deux backlogs concurrents, sans arbitrage ✅ *arbitré le 2026-08-12*

> **Arbitré** : `docs/backlog-mvp/index.md` porte un bandeau qui dit que la stratégie n'a pas été
> suivie, et ses 12 tickets passent `obsolete`. L'agrégat des `todo` sur `docs/` rend désormais 3,
> et non 15. Le raisonnement produit — WhatsApp d'abord, entrée sans authentification — est
> explicitement conservé : ce sont des arbitrages de marché, ils n'ont pas vieilli comme les
> tickets.


`docs/backlog/` (265 tickets) et `docs/backlog-mvp/` (12 tickets, stratégie « vertical slice / zero
auth / WhatsApp first / 5 weekends »). **Les 12 tickets du second sont tous `status: todo` alors
qu'ils décrivent des fonctionnalités livrées depuis avril.** Un outil qui agrège les frontmatters
`todo` sur `docs/` compte **15 tickets ouverts au lieu de 3**.

### D-21 — Des docblocks décrivaient un package désinstallé ✅ *soldé le 2026-08-12*

> **Soldé** : cinq docblocks corrigés — `HasProfiles`, `LeasePolicy` (deux), `Invitation`,
> `bootstrap/app.php`. Chacun dit désormais ce que le code fait, **et** ce qu'il ne fait plus, avec
> un renvoi vers l'ADR. Les mentions de `Spatie\Media`, `Spatie\Activity` et `Spatie\Image` sont
> restées : ces paquets-là sont bien installés.


`spatie/laravel-permission` a été retiré par TCK-278, mais le code continue de le décrire :
`HasProfiles` se présente comme « Sister trait of HasRoles (spatie) », `LeasePolicy` parle d'« une
permission `leases.renew` (Spatie) », et `bootstrap/app.php` présente `ResolveActiveProfile` comme
« sole owner of the spatie team context » qui « locks `setPermissionsTeamId()` ».

*Le commentaire survit au code qu'il décrit — et il survit avec la même autorité qu'un commentaire
juste.*

### D-22 — La règle du montant ×100 ne vivait que dans un commentaire ✅ *écrite ET gardée le 2026-08-12*

> **Soldé, en deux temps.**
>
> **Écrite** : [ADR-0009](adr/0009-montant-decimal-entier-a-la-frontiere.md), et principe non
> négociable n°3 de `CLAUDE.md`.
>
> **Gardée** : `tests/Feature/Api/PaymentAmountScaleTest.php` éprouve la chaîne complète — ce que
> `PaymentGatewayService` multiplie, chaque driver XOF le redivise, et le fournisseur reçoit
> exactement le montant de la base. **Prouvé par mutation** : retirer `/ 100` des deux drivers fait
> rougir les deux cas.
>
> **Le troisième cas est celui qui compte le plus.** Un correctif naïf — « on divise partout » —
> passerait les deux premiers au vert **et casserait la facturation SaaS**, qui est en USD, une
> devise à deux décimales dont le fournisseur attend de vrais centimes. Sans ce cas, on ne saurait
> pas distinguer une règle juste d'une règle appliquée partout. Vérifié aussi par mutation : il
> reste vert quand les deux autres rougissent, ce qui est le comportement attendu.
>
> **Ce que la mesure a trouvé au passage** : `PaymentDriverTest::test_orange_money_driver_initiate_calls_api`
> n'assertait que le `transactionId`. Le montant transmis à Orange Money n'était vérifié **par
> rien** — seul Wave l'était, et par accident.


**XOF n'a pas de sous-unité.** Le montant est décimal en base et devient un entier ×100 à la
frontière du driver de paiement — chaque driver local doit donc **re-diviser par 100**. Cette règle
n'est écrite dans **aucune spec** : sa seule trace est un commentaire de code.

C'est un piège actif : un nouveau driver de paiement écrit sans elle facture **cent fois trop**, ou
cent fois trop peu. Classé P0 malgré son apparence documentaire.

### D-23 — La duplication d'autorisation PHP↔TS n'était gardée par rien ✅ *gardée le 2026-08-12 — et la garde a trouvé un trou*

> **Gardée** : `scripts/check-pro-routes.mjs` vérifie que toute route de `PRO_ROUTES` est gardée
> côté serveur, et tourne dans `repo-ci.yml`. Prouvée par mutation, dans les deux sens — écart
> retiré de l'allowlist → rouge, allowlist devenue périmée → rouge aussi.
>
> **Ce qu'elle a trouvé à sa première exécution.** `pro-features.ts` affirmait, dans un
> commentaire, que *« the pages themselves redirect to `/app` server-side, which is the ultimate
> gate »*. Mesuré : **vrai pour 5 routes sur 9**. Les quatre routes `/app/*` —
> `/app/overview/kpis`, `/app/overview/alerts`, `/app/overview/agency`, `/app/owners` — affichaient
> un cadenas dans la barre latérale **sans aucune garde serveur**. Le cadenas n'empêchait que le
> clic ; une URL tapée à la main passait.
>
> **⛔ CORRECTION du 2026-08-12 (soir) — la mesure ci-dessous était FAUSSE.** Une revue de code a
> établi que les quatre routes `/app/*` **sont** gardées côté serveur : elles écrivent le test
> **en ligne** (`if (agency.kind !== 'standard') redirect('/app')`) au lieu d'appeler le helper.
> La garde ne cherchait que la chaîne `ensureStandardAgencyOrRedirect` : elle a rendu un faux
> négatif avec l'autorité d'une mesure, et le cadenas a été retiré devant des pages qui gardent.
> **Rétabli** — les 9 routes sont dans `PRO_ROUTES`, la garde reconnaît les deux formes et refuse
> de conclure au doute. *Une garde qui cherche un JETON ne mesure pas la PROPRIÉTÉ* : c'est
> l'anti-patron que cette ardoise documente partout, commis par l'ardoise elle-même.
>
> *Ce qui suit était le raisonnement d'origine. Conservé : il montre comment un faux négatif se
> propage en décision.*
>
> ~~**RÉSOLU le 2026-08-12 — et pas dans le sens attendu.**~~ La mesure du backend a tranché la
> question : les endpoints des quatre routes (`KpiConfigController`, `ThresholdAlertController`,
> `owners`, `DashboardController`) **ne portent aucun `AgencyKindGuard` non plus**. La restriction
> n'existait donc **nulle part** — ni page, ni API : elle n'avait jamais été un comportement,
> seulement une promesse d'interface. Arbitré (TCK-284) : **le cadenas était l'erreur**. Les quatre
> entrées sont sorties de `PRO_ROUTES`, `ECARTS_ASSUMES` est vide, la garde est stricte à 5/5.
> Aucun accès n'a été retiré à personne.
>
> *Ce qui suit est le raisonnement qui avait fait suspendre le correctif — conservé parce qu'il
> reste juste, et qu'il explique pourquoi la réponse n'était pas mécanique :*
>
> **Le correctif n'a PAS été appliqué d'emblée, et c'était délibéré.** `ensureStandardAgencyOrRedirect` vise
> *tout* porteur d'`agency_id` dans une agence `individual`, alors que `isProRouteLocked` ne
> cadenasse que les `agency_admin` : **les deux règles n'ont pas le même périmètre**. Poser la
> garde telle quelle redirigerait aussi les agents et les propriétaires, à qui rien n'a jamais été
> refusé — une régression fonctionnelle déguisée en correctif de sécurité. L'arbitrage est un
> **choix produit**, et il est écrit dans **TCK-284**.
>
> Les quatre écarts sont nommés dans `ECARTS_ASSUMES`. Une allowlist est une **dette datée**, pas
> une exemption : la garde échoue aussi le jour où une entrée y devient périmée.


`src/lib/access/server-guards.ts` porte un jumeau PHP, assumé dans un commentaire (« Backend twin of
`lib/access/server-guards.ts` »). **Aucun test, aucune garde CI ne vérifie que les deux
implémentations restent d'accord.** Une règle d'autorisation rendue à deux endroits et tenue à un
seul est le motif le plus tenace de ce genre de duplication.

### D-24 — La règle « le front possède le texte affiché » est une intention 🟠 → [TCK-286](backlog/tickets/TCK-286-i18n-textes-en-dur.md)

Les trois dictionnaires sont complets (1376 clés `fr`/`en`, 1265 `wo`), mais seuls **82 fichiers sur
875** utilisent `useTranslations`/`getTranslations`. Des libellés produits sont codés en dur en
français, **y compris dans la navigation**. Aucune garde ne mesure l'écart.

### D-25 — Divers documents périmés 🟡

- `docs/features-by-actor.md` se déclare « vue miroir de `features.md` » mais est gelé au
  2026-04-14, alors que `features.md` a évolué six fois depuis.
- `docs/seeding-plan.md` décrit l'état **antérieur** à l'implémentation (« le seeding actuel est
  minimal… 3 seeders ») alors que 38 seeders sont en place.
- `docs/configuration.md` **se contredit lui-même** sur Meilisearch : §1 « driver `collection` par
  défaut », §3.6 « Meilisearch sur TOUS les environnements », §5.1 « (Optionnel) ».
- `docs/qa/admin-qa.md` fait tester une page `/admin/roles` qui n'existe pas.
- `docs/superpowers/specs/2026-05-10-onboarding-discovery-design.md` porte `status: draft` alors que
  les 10 tickets qu'il pilote sont tous `done`.
- `takussan-web/README.md` est resté le **template create-next-app par défaut**.
- `docs/image.png` (2,99 Mo) et `docs/image copy.png` (1,19 Mo) sont versionnés — **53 % du poids de
  `docs/`** — pour des captures commitées accidentellement.

---

## 🟡 Couverture de tests

> **Les quatre entrées de cette section sont couvertes par [TCK-285](backlog/tickets/TCK-285-couverture-tests-services-policies.md)**, qui les ordonne par coût d'un défaut plutôt que par volume : policies d'abord (isolation multi-agence), puis webhooks (surfaces non authentifiées), puis commandes destructrices, puis services.

2052 tests backend et 802 frontend, tous verts — mais la couverture est très inégale, et les trous
sont concentrés là où ça compte.

### D-26 — La couche services est le trou principal 🟠

**81 des 148 services ne sont jamais nommés dans `tests/`** ; seuls 28 ont un test dédié. Cela inclut
le cœur métier : `BookingService`, `PropertyService`, `LeasePaymentService`, `InvoiceService`,
`PayoutService`, `InventoryService`.

### D-27 — L'autorisation est très peu testée directement 🟠

**12 des 16 policies ne sont jamais nommées dans `tests/`** — dont `LeasePolicy`,
`ConversationPolicy`, `InvitationPolicy`, `BankStatementPolicy`, `RoleDelegationPolicy`,
`PropertyModerationPolicy`. Sur un produit multi-tenant où l'agence est la frontière d'isolation,
c'est la couche dont un défaut est le plus coûteux et le moins visible.

### D-28 — Les effets asynchrones et planifiés sont quasi non testés 🟠

**10/12 observers, 9/30 jobs et 13/14 commandes artisan** ne sont jamais nommés dans `tests/`. Parmi
les commandes non testées : des opérations **destructrices ou irréversibles**
(`ExecuteScheduledAccountDeletions`, `PurgeOldWizardDrafts`, `MediaCleanup`).

### D-29 — 78 routes sur 517 n'ont aucun littéral d'URI dans les tests 🟡

Concentrées sur la console super-admin (20 routes `/api/admin`) et **les webhooks entrants**
(5 routes `/api/webhooks` : paiements, statuts SMS Orange/Mtarget/LAfricaMobile, statut WhatsApp).
Un webhook est une surface d'entrée non authentifiée pilotée par un tiers : c'est le pire endroit où
ne pas avoir de test.

### D-30bis — Quatre tests front rougissent sous charge 🟡 *découvert le 2026-08-12*

Mesuré en lançant les suites back et front **simultanément** : quatre tests de la console
super-admin (`InviteSuperAdminModal`, `AgencyOnboardingDialog`, `FeatureFlags`, `TemplateEditor`)
sortent en `Test timed out in 5000ms`. Au repos, les **802 tests passent**.

Ces tests ne mesurent donc pas seulement ce qu'ils visent : ils mesurent aussi la machine. Sur un
runner GitHub partagé, ils rougiront un jour sur une PR qui n'y est pour rien — et *une garde qui
rougit sous charge accuse le code*. Le correctif n'est pas d'augmenter le délai en aveugle mais de
mesurer leur marge réelle : un test à 12 % de son plafond n'a pas le même problème qu'un test
à 90 %.

### D-30 — Aucune mesure de couverture, aucune parallélisation 🟡

La CI passe explicitement `coverage: none` et le bloc `<source>` de `phpunit.xml` n'alimente aucun
rapport : ni seuil, ni tendance, ni garde-fou contre l'érosion. Et la suite n'est pas parallélisée
(`--parallel` n'est configuré nulle part) — 616 s en local sous contention.

---

## 🟡 Dette de code — conventions concurrentes

Aucune n'est un bug. Toutes coûtent une décision à chaque fois qu'on écrit du code neuf, et cette
décision est reprise à zéro par chaque contributeur. **`takussan-api/CLAUDE.md` tranche désormais
pour le code neuf** ; l'existant reste à converger.

| # | Dette | Mesure | Tranché pour le neuf |
|---|---|---|---|
| **D-31** | Enveloppe de pagination dupliquée à la main | 44 fichiers, clés incohérentes (`total` 72×, `current_page` 65×, `last_page` 49×, `per_page` 43×, `links`/`from`/`to` sporadiques) | les 4 clés canoniques |
| **D-32** | Validation inline vs FormRequest | 120 `$request->validate()` vs 69 FormRequest | `BaseFormRequest` |
| **D-33** | Policy vs helpers de contrôleur | 16 policies pour 72 modèles, mais **38 contrôleurs** redéfinissent `authorizeAccess()`/`authorizeManage()` (124 appels, logique copiée-collée) | policy |
| **D-34** | Deux mécanismes de filtrage sur les mêmes modèles | DSL maison `scopeFilter` **et** spatie `HasQueryBuilder`, tous deux sur `AbstractModel` | `buildQuery()` pour toute API |
| **D-35** | `BasePolicy` partiellement morte par construction | ses abilities `{resource}.view`/`.update` ne correspondent à **aucun** cas de `Capability` | — *(à corriger)* |
| **D-36** | `BaseResource` peu adoptée | 7 ressources sur 44 l'étendent ; 36 refont les conversions à la main | `BaseResource` |
| **D-37** | Trois classes de base de test | `TestCase`, `BaseTestCase`, `ApiTestCase`, sans règle écrite | `ApiTestCase` pour l'API |
| **D-38** | Deux préfixes de commandes plateforme | `platform:grant-super-admin` et `takussan:create-super-admin` font le même travail | `platform:` |
| **D-39** | ~~`NotificationPreference` n'étend pas `AbstractModel`~~ | ✅ **soldé le 2026-08-12** — il l'étend désormais ; 106 tests notifications verts | ✅ |
| **D-40** | Namespaces de contrôleurs dédoublés | l'authentification est éclatée entre `Controllers/Auth/` (8) et `Controllers/Api/Auth/` (5) | — |

### D-41 — Filament v4 : scaffold oublié ou décision non assumée 🟠 → [TCK-287](backlog/tickets/TCK-287-filament-supprimer-ou-securiser.md)

Deux dépendances composer, un panel monté sur `/admin` avec `->login()`, pour **une seule Resource**
(Property, 6 fichiers) — alors que le back-office réel est en Next.js.

**Le panel n'est protégé par aucun middleware `super-admin`, et `User` n'implémente pas
`FilamentUser`.** C'est une surface d'administration exposée dont personne ne réclame la
responsabilité. Soit on la supprime, soit on la sécurise et on l'assume en ADR.

### D-42 — Code mort et stubs menteurs côté frontend ✅ *soldé le 2026-08-12*

> **Soldé** : six fichiers supprimés — `NotificationContext.tsx` (provider monté nulle part), les
> quatre hooks stubs (tous **vides** : `export {}` sous un TODO qui promettait une API « pas encore
> prête », alors que les modules correspondants existent depuis des mois dans `lib/queries/`), et
> `useNotifications.ts` qui réexportait le contexte mort. **Zéro import exact** vérifié avant
> suppression ; `tsc` propre après.
>
> `mockData.ts` a été **scindé** plutôt que supprimé : il portait deux choses très différentes. Ses
> ~300 lignes d'annonces factices n'avaient aucun usage et sont parties ; ses constantes de
> navigation, elles, sont consommées **en production** par `Navbar` et `Footer` — elles vivent
> désormais dans `src/data/navigation.ts`. *Des données de navigation servies depuis un fichier
> nommé « mock » finissent par être supprimées par quelqu'un qui fait le ménage — ou pire, jamais
> relues parce que le nom promet qu'elles ne comptent pas.*
>
> **Reste ouvert** : `src/lib/api.ts` n'exporte toujours ni `API_URL` ni `API_BASE`, et 23 fichiers
> redéclarent chacun `.replace(/\/api$/, '')`.

- `src/context/NotificationContext.tsx` : provider monté nulle part, `useNotifications()` lève hors
  provider, **0 site d'appel** dans tout le dépôt.
- 4 hooks annoncent « TODO: implement when X API is ready » alors que les modules correspondants sont
  implémentés : `useLeases.ts`, `useMessages.ts`, `usePayments.ts`, `useMaintenance.ts`.
- `src/data/mockData.ts` (nom explicite) est importé par **deux composants de production** :
  `Navbar` (navLinks, categories) et `Footer` (footerLinks).
- `src/lib/api.ts` n'exporte ni `API_URL` ni `API_BASE` : **23 fichiers** relisent
  `process.env.NEXT_PUBLIC_API_URL` et redéclarent chacun `.replace(/\/api$/, '')`.

### D-43 — Le banc d'essai des migrations tournait sur le mauvais moteur ✅ *soldé le 2026-08-13*

Le job `migrations-mysql` (posé par D-05) et `docker-compose.yml` tournaient tous deux sur
`mariadb:11.4`, avec `utf8mb4_unicode_ci`. Le commentaire du job justifiait ce choix ainsi : *« il
tourne sur MariaDB parce que c'est ce que `apt install mariadb-server` pose sur le serveur »*.

**Personne n'avait exécuté cette commande.** Mesuré sur le serveur le 2026-08-13, en préparant le
premier déploiement :

```
$ dpkg -l | grep -Ei 'mysql-server|mariadb-server'
ii  mysql-server  8.0.46-0ubuntu0.24.04.3
$ sudo mysql -e "SELECT VERSION(), @@collation_server, @@character_set_server;"
8.0.46-0ubuntu0.24.04.3 | utf8mb4_0900_ai_ci | utf8mb4
```

Ce n'était donc pas un écart de version : **c'était le mauvais moteur**. MariaDB 11 et MySQL 8 ont
divergé pour de bon — collation par défaut, contraintes `CHECK`, colonnes `JSON` (natives chez
MySQL, alias de `LONGTEXT` chez MariaDB), noms d'index générés. Un DDL accepté par MariaDB 11.4 et
refusé par MySQL 8 passait le job et aurait cassé `migrate --force` au déploiement : **l'échec exact
que ce job existe pour empêcher**. Et `utf8mb4_unicode_ci` ne compare pas les chaînes comme
`utf8mb4_0900_ai_ci` — unicité des e-mails, `LIKE` de recherche.

La production n'ayant jamais été déployée, rien n'a cassé. Mais pendant six semaines le job a
affirmé une garantie qu'il ne tenait pas, à chaque exécution.

> C'est la sœur exacte de la leçon de D-04 : *ne jamais déduire l'état d'un environnement de la
> configuration qui le vise* — ici, d'une **commande d'installation supposée**. Le fichier
> `api-ci.yml` portait pourtant déjà un avertissement disant que 11.4 était « une hypothèse, pas
> une mesure » (TCK-289). L'avertissement était juste et il n'a rien empêché : *une hypothèse
> signalée reste une hypothèse exécutée.*

**Soldé** : `docker-compose.yml`, le job `migrations-mysql` et `docker/mysql-init.sql` portent
`mysql:8.0` et `utf8mb4_0900_ai_ci`. `scripts/check-db-engine.mjs` (Repo CI) garde leur accord :
toute image de base et toute collation écrites dans le dépôt doivent valoir celles de la production
mesurée, **et les déclarations exigées doivent être présentes** — la première version restait verte
quand on supprimait purement et simplement la ligne `--collation-server`. Le job de CI mesure en
outre `@@collation_server` du conteneur de service, qui n'accepte pas d'arguments de commande.
Fermé par TCK-289.

---

---

## Ce que cet inventaire ne couvre pas

Il est dérivé de ce qu'on peut **mesurer depuis le dépôt** : fichiers, historique git, exécution des
suites, configuration. Il ne dit rien de :

- **la production réelle** — à une exception près (le moteur de base, mesuré le 2026-08-13, cf.
  D-43), aucune de ses métriques n'a été consultée. D-01 à D-04 sont déduits de scripts et de
  guides, pas d'un serveur observé — et D-43 montre ce que cette déduction coûte ;
- **ce que le produit devrait faire** — la question fonctionnelle appartient à `docs/features.md` ;
- **l'ergonomie et l'accessibilité** — aucune campagne navigateur n'a été menée dans ce chantier ;
- **une fiche codée sans le dire** — un ticket implémenté dont le frontmatter n'a jamais bougé reste
  invisible ici comme dans le backlog. `check-backlog.mjs` attrape le pointeur pourri, la dépendance
  incohérente et le statut contredit par git ; il ne peut pas deviner qu'on a codé sans le dire.
