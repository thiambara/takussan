---
id: TCK-2787
title: "Lot dépendances : fermer les alertes de sécurité ouvertes — next en tête (8 critiques), et ce que Dependabot ne voit pas (composer, laravel/framework)"
status: done
phase: P1
family: technique
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, dependances, securite, dependabot, npm, composer, next, laravel]
---

## Objectif utilisateur

Aucune dépendance connue comme vulnérable ne tourne dans l'image servie, et le décompte des alertes dit la vérité
sur les trois écosystèmes du dépôt.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 33 : « lot dépendances **après fusion** ». Ce lot passe après la
fusion de la PR #1669 (n° 34a : une fois la file vide et la CI verte). Il ne s'ouvre pas avant.

**Mesure du 2026-11-13, en lecture seule, à re-prendre au démarrage** : les chiffres ci-dessous seront périmés à
l'ouverture du ticket.

- Dependabot :
  `gh api -X GET 'repos/thiambara/takussan/dependabot/alerts?state=open&per_page=100' --paginate`.
- npm : `npm audit --json` dans `takussan-web/` et dans `takussan-api/`.
- composer : `composer audit --format=json` dans `takussan-api/`.

**Dependabot : 85 alertes ouvertes**, sur 21 paquets distincts.

| Gravité | Nombre |
|---|---|
| Critique | 8 |
| Haute | 25 |
| Moyenne | 41 |
| Basse | 11 |

- Par manifeste :
  - `takussan-web/package-lock.json` : 67 ;
  - `takussan-web/package.json` : 10 ;
  - `takussan-api/package-lock.json` : 5 ;
  - `package.json` (racine) : 3.
- Par portée : 56 à l'exécution, 29 en développement.
- **Les 8 critiques sont toutes `next`** : 4 avis (GHSA-673q-mjm6-r5xr, GHSA-2464-fhr4-w9xw, GHSA-p293-qw3h-jr36,
  GHSA-2xp9-vwfh-vxw4), comptés deux fois chacun (manifeste et lock). Le dépôt fige `"next": "16.3.1"` (exact). La
  première version corrigée la plus haute parmi les critiques est **16.4.1**. Les hautes de `next` demandent 16.3.8
  ou 16.4.1.
- Hautes à l'exécution hors `next` (front) : `@modelcontextprotocol/sdk`, `body-parser`, `browserslist`, `fast-uri`,
  `js-yaml`, `nanoid`, `sharp`, `zod`. En développement : `undici`, `vite` (front et API).
- **Les 3 alertes sur `package.json` à la racine visent un fichier qui n'existe pas** (`ls package.json` : absent).
  C'est le cas que `.github/dependabot.yml` décrit depuis le 2026-08-16 : non réévaluables, elles ne se ferment pas
  seules.

**Ce que Dependabot ne voit pas.**

- **composer : 23 avis** sur `takussan-api/composer.lock` (critique 1, hautes 5, moyennes 5, basses 3, sans
  gravité 9). Dependabot n'en montre **aucun** : 0 alerte d'écosystème composer.
  - `laravel/framework` est installé en **v13.25.0**. L'avis critique « TokenGuard authentication bypass through
    non-string API credentials » vise `>=13.0.0,<13.27.0`, et l'avis moyen « relationship inclusion can trigger
    unauthorized data destruction » vise la même plage.
  - **Verdict sur l'avis critique (redac-1, 2026-11-13, lecture seule) : non atteignable.** L'avis porte les
    identifiants PKSA-b41t-wbzk-9q51, CVE-2026-114509 et GHSA-f9x3-7vq9-cph6.
    - **Le chemin visé, dans `vendor/laravel/framework/src/Illuminate/Auth` :**
      - `TokenGuard.php:97-102` lit `api_token` dans la query, le corps, l'en-tête Bearer ou le mot de passe, sans le
        convertir en chaîne ;
      - `TokenGuard.php:84-85` le passe à `retrieveByCredentials` ;
      - `EloquentUserProvider.php:129-130` transforme un tableau en `whereIn` ;
      - `AuthManager.php:161-166` est le seul endroit qui crée un `TokenGuard`, et seulement pour un guard
        `'driver' => 'token'`.
    - **Pourquoi c'est inatteignable :**
      - `config/auth.php:40-45` ne déclare que `web` (session), et `config:show auth.guards` rend `web` et
        `sanctum`. Les guards sont écrits en dur, et `AUTH_GUARD` n'apparaît dans aucun gabarit d'environnement.
      - Dans `app`, `config`, `bootstrap`, `routes` et les migrations, il n'y a ni `TokenGuard`, ni
        `Auth::extend`, ni `viaRequest`, ni `createTokenDriver`, ni colonne `api_token`.
      - Les routes passent par `auth:sanctum` (×101), sans aucun `auth:api` ni `auth:token`.
      - Sanctum v4.3.3 essaie d'abord la session (`Guard.php:32-33`, `config/sanctum.php:40`). Il lit ensuite le seul
        en-tête Bearer, une chaîne (`Guard.php:83-91`), et compare par `hash_equals` (`PersonalAccessToken.php:58-68`).
    - **Ce que le verdict vaut** : il tient tant qu'aucun guard `token` n'est ajouté. D'où AC6.
  - **Verdict sur l'avis moyen « relationship inclusion can trigger unauthorized data destruction » (même plage,
    redac-1, 2026-11-13, lecture seule) : non atteignable.**
    - **Le mécanisme.** Eloquent résout un nom de relation en appelant la méthode du même nom sur une instance neuve
      (`Eloquent/Builder.php:966-977`, `getRelation()`, `$this->getModel()->newInstance()->$name()`). Un nom venu de
      la requête qui atteint `with`, `load` ou `loadMissing` appelle donc n'importe quelle méthode publique :
      `unguard`, `delete`, ou `truncate`, que `__call` transmet au constructeur de requête.
    - **Le chemin le plus probable du correctif**, déduit du code installé (le texte de l'avis n'a pas été lu) : les
      ressources JSON:API du framework. `Http/Resources/JsonApi/JsonApiRequest.php:50-62` découpe `include=a.b`.
      `Concerns/ResolvesJsonApiElements.php:196-214` filtre le premier niveau par `->only(...)`, puis passe le niveau
      imbriqué **sans filtre** à `$relatedModels->loadMissing($relations)`. L'application ne s'en sert pas : aucun
      fichier de `app` ne contient `JsonApi`, `JsonApiResource` ni `toResource`.
    - **Nos propres chemins sont tous fermés** par la liste blanche :
      - `HasQueryBuilder::buildQuery()` → spatie 7.3.0 `allowedIncludes(...getAllowedQueryIncludes())`, qui ne
        reprend que `$requestLoadable` et `$requestCountable`. `ensureAllIncludesExist()` lève
        `InvalidIncludeQuery` **avant** `addIncludesToQuery()` (`AddsIncludesToQuery.php:28-32, 81-96`).
        `disable_invalid_include_query_exception` n'est pas surchargé : l'application n'a pas de
        `config/query-builder.php`, et le défaut est `false`.
      - `getAllAllowedQueryFields()` (`HasQueryBuilder.php:133-139`) et `AgencyScopedRelationship.php:35`
        n'appellent que des noms de `$requestLoadable` ou d'includes déjà admis.
      - `CustomerCommercialAttributes::clesEtrangeresDesIncludes()` (`:115-118`) filtre par
        `Customer::getRequestLoadable()` avant `$modele->{$relation}()`. C'est le correctif de l'incident du
        2026-11-12 (34c796ce1), épinglé par `CustomerIndexSparseFieldsTest`.
      - Les lectures d'`include` hors spatie ne font qu'un `in_array` contre des chaînes fixes. Elles n'atteignent
        aucune relation : `PropertyController:219-290`, `LeaseController:81-82` (`array_intersect(['landlord',
        'agent'])`), `PaymentHistory::requestedIncludes` (`HISTORY_INCLUDES`), `ThresholdAlertController:58`,
        `UserAdminController:84,178`, `CommissionEntryController:47`.
      - Tous les `load`, `loadMissing` et `with` des contrôleurs portent des noms littéraux (balayage du
        2026-11-13).
      - Les tris manuels (`BankStatementLineController:77-78`, `AgencyModerationController:109-111`,
        `UserDetailController:89-91`) ordonnent par colonne et n'appellent aucune relation : ils sont hors du chemin
        de l'avis.
    - **Ce que le verdict vaut** : il repose sur une règle que rien n'impose hors de `CustomerIndexSparseFieldsTest`.
      D'où AC7.
  - Autres paquets visés : `league/commonmark` (haute), `phpoffice/phpspreadsheet` (3 hautes), `phpseclib/phpseclib`,
    `symfony/http-foundation` (dont une haute), `symfony/http-kernel`, `symfony/mime`, `symfony/routing`,
    `symfony/yaml`, `symfony/filesystem`, `league/flysystem`.
- **npm de l'API** : `npm audit` en compte 4 (2 critiques : `concurrently`, `shell-quote` ; 2 hautes :
  `source-map-js`, `vite`). Dependabot n'en montre que 5 lignes, toutes sur `vite`.
- **npm du front** : `npm audit` en compte 37 (23 hors développement), dont 2 critiques.

## Contraintes strictes (métier)

- **Après la fusion de #1669**, sur une branche à part, en PR vers `dev`. La CI joue les suites entières ; aucune
  suite entière en local.
- **Mesurer avant de corriger, et après.** Les trois audits et le décompte Dependabot sont relevés au début et à la
  fin, datés, et écrits dans les notes du ticket. Une alerte se ferme par une version installée hors de la plage
  vulnérable, vérifiée dans le lock. Une plage d'avis ne suffit pas : c'est la leçon de `vite` dans
  `dependabot.yml`.
- **`next` d'abord.** Passer à une version qui ferme les critiques et les hautes (au moins 16.4.1). Cela relève le
  plancher de React et d'ESLint du front : `npm run lint`, `npx tsc --noEmit`, `npm run test` et `npm run build`
  doivent passer, puis `deploy/takussan/smoke-web.sh`. La ligne « Next.js 16.3.1 » de `CLAUDE.md` est mise à jour
  dans la même PR.
- **`laravel/framework` dans sa ligne 13** (au moins 13.40.0 pour fermer les quatre avis). Pint et la suite de la CI
  doivent être verts.
- Aucun saut de version majeure n'entre dans ce lot sans décision. Une montée majeure nécessaire (par exemple
  `phpspreadsheet` d'une branche à une autre) devient un ticket à part. TCK-463 (TypeScript 7) reste à part.
- **Les 3 alertes fantômes de `package.json` à la racine** se ferment par une écriture sur GitHub (« dismiss »), qui
  est une action sortante. Elle se fait seulement sur demande du porteur, avec le motif « manifeste inexistant ».
- `.github/dependabot.yml` est en pause (`open-pull-requests-limit: 0`). La lever est hors de ce lot.

## Delta à produire

- [x] Relevé initial daté (les trois audits et Dependabot), dans les notes.
- [x] `takussan-web` : `next` et les paquets d'exécution vulnérables à leur version corrigée ; `npm audit` sans
  critique ni haute à l'exécution.
- [x] `takussan-api` : `composer update` ciblé (`laravel/framework`, `symfony/*`, `league/*`, `phpoffice/phpspreadsheet`,
  `phpseclib/phpseclib`) dans leurs lignes majeures ; `npm` de l'API (`concurrently`, `shell-quote`, `vite`).
- [x] Exposition au `TokenGuard` et à l'inclusion de relation : mesurée le 2026-11-13 (voir le Contrat de données),
  à re-vérifier d'un `grep` avant la montée. Si le verdict a changé, l'écrire dans les notes.
- [x] Garde d'architecture `tests/Unit/Architecture/AucunGuardTokenTest.php` : aucun guard de `config('auth.guards')`
  n'a `driver = token`, et aucun `TokenGuard`, `createTokenDriver` ni `Auth::viaRequest` n'apparaît dans `app/`,
  `config/` ni `bootstrap/`.
- [x] Garde `tests/Feature/Architecture/IncludeNomDeMethodeRefuseTest.php`. Sur chaque route `GET` qui passe par
  `buildQuery()` (énumérée par le routeur, pas listée à la main), `include=truncate`, `include=unguard`,
  `include=delete` et une forme imbriquée (`include=<relation admise>.truncate`) rendent 400. La table visée
  garde son nombre de lignes, et `Model::isUnguarded()` reste faux. Une garde statique refuse aussi
  `JsonApiResource` dans `app/` tant qu'aucune liste blanche des includes imbriqués ne l'accompagne.
- [x] Relevé final daté, avec la liste de ce qui reste ouvert et pourquoi (pas de correctif, montée majeure, faux
  positif mesuré).

## Critères d'acceptation

- [x] AC1 — `npm audit --omit=dev` de `takussan-web` ne rend ni critique ni haute.
- [x] AC2 — `composer audit` de `takussan-api` ne rend ni critique ni haute. Chaque avis restant est listé dans les
  notes avec sa raison.
- [x] AC3 — `npm audit` de `takussan-api` ne rend aucune critique.
- [x] AC4 — La CI de la PR est verte sur les trois workflows (API, front, dépôt), et `smoke-web.sh` passe sur l'image
  du front.
  - CI de #1676 verte sur les trois workflows, sur la tête a48dc4189 ; fusionnée en e27c5c93b.
  - `smoke-web.sh` n'a pas pu passer en local : il reconstruit toujours l'image, et la construction meurt au
    contrôle de types (« JavaScript heap out of memory »), même Docker Desktop porté à 12 Go — c'est le tas de Node
    qui plafonne, pas la machine. Preuve retenue (option b, 2026-11-15) : le job « Image du front (construite, pas
    poussée) » de Web CI, vert sur a48dc4189 (run 43657439754). Ce qu'elle ne prouve pas : le démarrage du conteneur
    et sa réponse HTTP, que seul `smoke-web.sh` éprouve. Correctif possible, à décider par le porteur :
    `NODE_OPTIONS=--max-old-space-size=…` dans l'étape de construction du Dockerfile du front.
- [x] AC5 — Le décompte Dependabot de fin, relevé par la même commande `gh api` en lecture, est écrit dans les notes,
  avec ce qui reste ouvert.
  - Relevé du 2026-11-15 : **82 alertes encore ouvertes** côté GitHub, aucune passée `fixed`, aucune mise à jour
    depuis le 2026-11-13 — Dependabot n'a pas réévalué `dev` (le graphe de dépendances répond 404 à l'API). Les
    alertes 1, 2 et 3 (manifeste inexistant) ont été écartées le 2026-11-14.
  - Mesure par alerte, faite à la place (recommandation 1a de la session) : pour chacune des 82, la plage
    vulnérable confrontée par `semver.satisfies` à **toutes** les versions du paquet dans le `package-lock.json` de
    `origin/dev` (takussan-web et takussan-api, dépendances imbriquées comprises) : **82 / 82 hors plage** — aucune
    version vulnérable ne reste sur `dev`. Exemples : `next` 16.4.6 (corrigé en 16.4.1), `vite` 8.3.8 (8.1.6) ;
    `hono` et `fast-uri` ne sont plus dans le verrou du front.
  - Ce qui reste ouvert : rien sur `dev` ; le décompte GitHub retombera à la réévaluation de Dependabot, sans rouvrir
    ce ticket. Hors périmètre maintenu : TCK-2843 (minimatch 11, en attente de l'amont).
- [x] AC6 — La garde `AucunGuardTokenTest` existe et elle est verte. Vérifiée par ablation : un guard
  `'api' => ['driver' => 'token', 'provider' => 'users']` ajouté à `config/auth.php` la rend rouge.
  - Garde écrite en avance du lot le 2026-11-13, 7641542ea, sous `tests/Feature/Architecture/` et non
    `tests/Unit/` : elle lit la configuration et le routeur, donc étend `Tests\TestCase`. Quatre tests : les guards
    sont exactement `web` (session) et `sanctum` ; aucun `TokenGuard`, `RequestGuard`, `createTokenDriver`,
    `viaRequest`, `Auth::extend` ni `'driver' => 'token'` dans le code de `app/`, `config/`, `bootstrap/`,
    `routes/` ; toute route dont la pile résolue porte un middleware d'authentification le porte sous le seul
    guard `sanctum` (727 routes `api/*` le 2026-11-13) ; les 97 routes `api/*` sans authentification sont une liste
    fermée, chacune avec sa raison (entrée de session, site public, jeton de capacité, URL signée, webhook), et une
    entrée morte en sort. Ablations faites, chaque fichier rendu à son md5 : le guard `token` ajouté à
    `config/auth.php` rougit les deux premiers tests ; une route sous `auth:api` et une sous `auth` sans guard
    rougissent le troisième ; une route `api/*` sans authentification rougit le quatrième.
  - Observation, relevée en lecture le 2026-11-13 : `broadcasting/auth` (déclarée par `channels:` de
    `bootstrap/app.php`) est hors de `api/*` et n'a que le groupe `web` : elle juge par le guard `web` (session),
    jamais par un guard `token`. Elle ne sert rien aujourd'hui : `takussan-web/src` n'importe ni `laravel-echo` ni
    `pusher` et n'ouvre aucun canal (la messagerie relit par `refetchInterval`, `lib/queries/conversations.ts`), et
    `BROADCAST_CONNECTION=null` en préproduction (`docs/infra/prod-drivers.json`, mesuré le 2026-11-01). Le canal
    privé `App.Models.User.{userId}` (`routes/channels.php`) et les deux événements qui y diffusent (`NewNotification`,
    `NewMessage`) restent déclarés. Le jour où un client temps réel s'y abonne, sa route passe sous `auth:sanctum`.
- [x] AC7 — La garde `IncludeNomDeMethodeRefuseTest` existe et elle est verte sur toutes les routes énumérées.
  Vérifiée par ablation : retirer le filtre `getRequestLoadable()` de
  `CustomerCommercialAttributes::clesEtrangeresDesIncludes()` la rend rouge (l'appel a lieu avant le refus de
  spatie).
  - Garde écrite en avance du lot le 2026-11-13, 844560fe1. Mesuré : **67 routes retenues** (le plancher
    `RETENUES_MIN`), chaque nom envoyé seul et sous `fields[<table>]=id` de toutes les tables d'un modèle à
    `buildQuery()`, comparé à un témoin `include=__sonde__` (les sources du Radar s'écrivent à la première lecture :
    sans témoin, faux positif). Trois routes à `buildQuery(` où la sonde reste muette, nommées dans `SONDE_MUETTE`
    avec leur raison (`maintenance-requests/summary` et `property-visits/counts` passent une requête neuve sans
    include ; `me/service-provider/collaborations` rend vide avant pour un appelant sans profil de prestataire).
    Ablation faite : sans le filtre, rouge sur `api/customers` sous `fields` seulement — `include=truncate` vide
    `customers` et ses cascades, `include=unguard` lève la protection — alors que le statut reste 400 : le statut
    seul ne l'aurait pas vu. La garde statique `JsonApiResource` est dans le même fichier, ablation faite (une sonde
    dans `app/` la rend rouge).

## Reste sur dev

Rien : AC4 et AC5 sont écrits (2026-11-15), le ticket passe `done`.

## Hors périmètre

- Lever la pause de Dependabot, ou ajouter un audit composer à la CI : un ticket à part, qui serait utile puisque
  Dependabot ne voit pas composer.
- TCK-463 (TypeScript 7, bloqué par typescript-eslint).
- Les montées majeures.

## Notes d'implémentation

### 2026-11-14 — montée, branche `fix/dependances-tck-2787`

**Relevé initial (2026-11-14, avant toute montée).** Dependabot : 85 ouvertes (8 critiques, 25 hautes,
41 moyennes, 11 basses). `npm audit` du front : 37 (hors développement : 2 critiques, 11 hautes). `npm audit` de
l'API : 4 (2 critiques, 2 hautes). `composer audit` : 23 avis (1 critique, 5 hautes).

**Versions installées, lues dans les locks.**

- Front : `next` 16.3.1 → **16.4.6** (exact), `eslint-config-next` 16.4.6, `react` 19.2.8, `shadcn` ^4.23.0 (ne tire
  plus `@modelcontextprotocol/sdk`), `zod` 4.6.7, `sharp` 0.35.5 (exact), puis `npm audit fix` sans majeure.
- API composer, `update` ciblé `-w` dans les lignes majeures (`brick/math` tenu en `~0.18`,
  `guzzlehttp/uri-template` en `^1.0`, pour éviter deux majeures) : `laravel/framework` v13.25.0 → **v13.42.0**,
  `symfony/*` 8.1.9 à 8.1.11, `league/commonmark` 2.10.7, `league/flysystem` 3.36.0,
  `phpoffice/phpspreadsheet` 5.11.0, `phpseclib/phpseclib` 3.0.58 (et `aws-sdk-php`, `guzzle`, `carbon`, `monolog`
  en mineure ou correctif).
- API npm : `concurrently` 10.0.7, `shell-quote` 1.12.0, `vite` 8.3.8, `source-map-js` 1.2.2.

**Relevé final local (2026-11-14).**

- AC1 : `npm audit --omit=dev` du front : 0 critique, 0 haute (4 moyennes, 2 basses, via `shadcn`, `ts-morph`,
  `minimatch`, `deepmerge`). `npm audit` complet : 16 (2 basses, 14 moyennes).
- AC2 : `composer audit` : 0 avis.
- AC3 : `npm audit` de l'API : 0.
- Restent ouverts, en développement : `vitest` (le correctif est la v5, majeure : ticket à part),
  `typescript-eslint` / `minimatch` (aucune version corrigée compatible).
- Exposition `TokenGuard` / inclusion de relation re-vérifiée par `grep` avant la montée : verdict inchangé (le seul
  `api_token` du code est `config/cdn.php`, le jeton Cloudflare).

**Preuves locales (2026-11-14), sans suite entière.**

- `npx tsc --noEmit` : propre ; `npm run lint` : 0 erreur ;
  `npm run build` : réussi (133 pages, compilé en 72 s).
- `./vendor/bin/pint --test` : passed ; `php artisan route:list` charge (841 routes).
- AC6/AC7 : `AucunGuardTokenTest` (4) et `IncludeNomDeMethodeRefuseTest` (2) verts sous laravel 13.42.0.
- Authentification : 14 fichiers ciblés (`Auth/*` login, session, inscription, 2FA, OAuth, réinitialisation,
  `Session/TokenLifetimeTest`, `Session/IdleTokenPruneTest`, `BlockedUserTokenRejectedTest`,
  `LocaleBearerTokenTest`…) : 104 tests verts.

**Reste, après la PR** : AC4 (CI verte sur les trois workflows, `smoke-web.sh` sur l'image du front), AC5
(décompte Dependabot de fin, à relever après fusion sur `dev`, l'alerte ne se fermant qu'une fois le lock sur la
branche par défaut), et les 3 alertes fantômes de `package.json` racine (« dismiss » sur demande du porteur).

### 2026-11-14 (soir) — re-mesure sur `dev` après la fusion de #1673, branche `chore/deps-securite-2787`

**#1673 est fusionnée** (2026-11-14 14:24 Z, `3aea4820e`). Sa CI était verte sur les trois workflows : API
(`lint-and-test`, rollback des migrations, image), front (ESLint, tsc, Vitest, build, image), dépôt (gardes
documentaires). Cela tient la première moitié d'AC4.

**Relevé du 2026-11-14 à 22:00 (heure locale), sur `origin/dev` 66099de74, avant cette branche.**

- `composer audit --locked` : 0 avis. `npm audit` de l'API : 0.
- `npm audit` du front : 16 (2 basses, 14 moyennes) ; `--omit=dev` : 6 (2 basses, 4 moyennes), 0 critique, 0 haute.
- **Dependabot : 82 ouvertes** (8 critiques, 25 hautes, 38 moyennes, 11 basses), même commande `gh api`.
  - **Le compte ne dit pas l'état du dépôt.** La dernière mise à jour des alertes date du 2026-11-01 (`updated_at`),
    alors que les locks corrigés sont sur `dev` (branche par défaut) depuis 12:16 Z. Dependabot n'a pas réévalué.
  - Mesure par alerte : pour chacune, toutes les instances du paquet dans le lock visé (y compris imbriquées) ont été
    comparées à sa `vulnerable_version_range` (script `semver`). **79 sur 82 sont hors plage**, dont les 8 critiques
    `next` (lock en 16.4.6). Les **3 restantes** étaient `vitest` / `@vitest/mocker` 4.1.10 (n° 22, 24, 68 :
    moyennes, développement).
  - Les 3 alertes fantômes du `package.json` racine (n° 1, 2, 3, `vite`) ont été **fermées par la session**
    (« dismiss », motif « manifeste inexistant »), sur décision du porteur du 2026-11-14. Elles n'apparaissent plus.

**Correction d'une note précédente.** « `vitest` : le correctif est la v5, majeure » était faux. La ligne 4
a reçu le correctif : `vitest` 4.1.12 (étiquette `V4`), première version corrigée de l'avis le plus haut (4.1.12).

**Montée de cette branche (mineures et correctifs seulement).**

- `vitest` ^4.1.5 → **^4.1.12** (lock 4.1.12, `@vitest/mocker` 4.1.12), et `@vitest/ui` ^4.1.10 → **^4.1.12**.
  Ferme les alertes Dependabot n° 22, 24, 68.
- `eslint` ^10 (lock 10.8.1) → **^10.15.0** (lock 10.15.0). Il tire `minimatch ^11.0.5` et sort d'`npm audit`.
  Les avertissements de pair (`eslint-plugin-import`, `-jsx-a11y`, `-react` déclarent `<= ^9`) existaient déjà
  avec 10.8.1.

**Relevé final (2026-11-14, 22:15), sur la branche.**

- AC1 : `npm audit --omit=dev` du front : 6 (2 basses, 4 moyennes), **0 critique, 0 haute**.
  `npm audit` complet : 12 (2 basses, 10 moyennes).
- AC2 : `composer audit --locked` : **0 avis**.
- AC3 : `npm audit` de l'API : **0**.
- Dependabot, mesuré contre les locks de la branche : **0 alerte sur 82 dont la version installée tombe encore
  dans la plage**. Il faut encore que Dependabot réévalue après la fusion (AC5).
- **Ce qui reste ouvert dans `npm audit`, et pourquoi.**
  - `minimatch` 10.2.6 (10 moyennes, via `typescript-eslint` 8.72.2 et `shadcn` → `ts-morph` → `@ts-morph/common`).
    Aucune version amont ne déclare `^11` : la seule voie est une surcharge `overrides` d'une majeure transitive.
    C'est **TCK-2843**.
  - `deepmerge` via `@shadcn/registry` (2 basses). Le seul correctif proposé est `shadcn@1.0.0`, une régression
    de trois majeures : faux correctif, laissé ouvert.
- Preuves locales, sans suite entière :
  - front : `npx eslint .` sort en 0, `npx tsc --noEmit` est propre, 6 fichiers Vitest à `vi.mock` passent
    (32 tests) sous 4.1.12 ;
  - API : `pint --test` passe, `AucunGuardTokenTest` + `IncludeNomDeMethodeRefuseTest` sont verts (6 tests) ;
  - pas de `npm run build` : `next` n'a pas bougé sur cette branche.
- Exposition `TokenGuard` / inclusion de relation : les deux gardes sont vertes sur `dev`, et le verdict est
  inchangé.

**Reste.**

- AC4, seconde moitié : `deploy/takussan/smoke-web.sh` sur l'image du front (Docker), à lancer par la session.
- AC5 : le décompte Dependabot de fin, à relever après la fusion de cette branche, une fois les alertes
  réévaluées (rien ne bouge depuis le 2026-11-01). Si elles restent figées, le relevé par alerte ci-dessus est
  la mesure.
