---
id: TCK-2787
title: "Lot dépendances : fermer les alertes de sécurité ouvertes — next en tête (8 critiques), et ce que Dependabot ne voit pas (composer, laravel/framework)"
status: todo
phase: P1
family: technique
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
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

- [ ] Relevé initial daté (les trois audits et Dependabot), dans les notes.
- [ ] `takussan-web` : `next` et les paquets d'exécution vulnérables à leur version corrigée ; `npm audit` sans
  critique ni haute à l'exécution.
- [ ] `takussan-api` : `composer update` ciblé (`laravel/framework`, `symfony/*`, `league/*`, `phpoffice/phpspreadsheet`,
  `phpseclib/phpseclib`) dans leurs lignes majeures ; `npm` de l'API (`concurrently`, `shell-quote`, `vite`).
- [ ] Exposition au `TokenGuard` et à l'inclusion de relation : mesurée le 2026-11-13 (voir le Contrat de données),
  à re-vérifier d'un `grep` avant la montée. Si le verdict a changé, l'écrire dans les notes.
- [ ] Garde d'architecture `tests/Unit/Architecture/AucunGuardTokenTest.php` : aucun guard de `config('auth.guards')`
  n'a `driver = token`, et aucun `TokenGuard`, `createTokenDriver` ni `Auth::viaRequest` n'apparaît dans `app/`,
  `config/` ni `bootstrap/`.
- [ ] Garde `tests/Feature/Architecture/IncludeNomDeMethodeRefuseTest.php`. Sur chaque route `GET` qui passe par
  `buildQuery()` (énumérée par le routeur, pas listée à la main), `include=truncate`, `include=unguard`,
  `include=delete` et une forme imbriquée (`include=<relation admise>.truncate`) rendent 400. La table visée
  garde son nombre de lignes, et `Model::isUnguarded()` reste faux. Une garde statique refuse aussi
  `JsonApiResource` dans `app/` tant qu'aucune liste blanche des includes imbriqués ne l'accompagne.
- [ ] Relevé final daté, avec la liste de ce qui reste ouvert et pourquoi (pas de correctif, montée majeure, faux
  positif mesuré).

## Critères d'acceptation

- [ ] AC1 — `npm audit --omit=dev` de `takussan-web` ne rend ni critique ni haute.
- [ ] AC2 — `composer audit` de `takussan-api` ne rend ni critique ni haute. Chaque avis restant est listé dans les
  notes avec sa raison.
- [ ] AC3 — `npm audit` de `takussan-api` ne rend aucune critique.
- [ ] AC4 — La CI de la PR est verte sur les trois workflows (API, front, dépôt), et `smoke-web.sh` passe sur l'image
  du front.
- [ ] AC5 — Le décompte Dependabot de fin, relevé par la même commande `gh api` en lecture, est écrit dans les notes,
  avec ce qui reste ouvert.
- [ ] AC6 — La garde `AucunGuardTokenTest` existe et elle est verte. Vérifiée par ablation : un guard
  `'api' => ['driver' => 'token', 'provider' => 'users']` ajouté à `config/auth.php` la rend rouge.
- [ ] AC7 — La garde `IncludeNomDeMethodeRefuseTest` existe et elle est verte sur toutes les routes énumérées.
  Vérifiée par ablation : retirer le filtre `getRequestLoadable()` de
  `CustomerCommercialAttributes::clesEtrangeresDesIncludes()` la rend rouge (l'appel a lieu avant le refus de
  spatie).
  - Garde écrite en avance du lot le 2026-11-13, <sha> à venir. Mesuré : **67 routes retenues** (le plancher
    `RETENUES_MIN`), chaque nom envoyé seul et sous `fields[<table>]=id` de toutes les tables d'un modèle à
    `buildQuery()`, comparé à un témoin `include=__sonde__` (les sources du Radar s'écrivent à la première lecture :
    sans témoin, faux positif). Trois routes à `buildQuery(` où la sonde reste muette, nommées dans `SONDE_MUETTE`
    avec leur raison (`maintenance-requests/summary` et `property-visits/counts` passent une requête neuve sans
    include ; `me/service-provider/collaborations` rend vide avant pour un appelant sans profil de prestataire).
    Ablation faite : sans le filtre, rouge sur `api/customers` sous `fields` seulement — `include=truncate` vide
    `customers` et ses cascades, `include=unguard` lève la protection — alors que le statut reste 400 : le statut
    seul ne l'aurait pas vu. La garde statique `JsonApiResource` est dans le même fichier, ablation faite (une sonde
    dans `app/` la rend rouge).

## Hors périmètre

- Lever la pause de Dependabot, ou ajouter un audit composer à la CI : un ticket à part, qui serait utile puisque
  Dependabot ne voit pas composer.
- TCK-463 (TypeScript 7, bloqué par typescript-eslint).
- Les montées majeures.

## Notes d'implémentation

_(à remplir par implementing-specs)_
