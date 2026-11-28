---
id: TCK-3010
title: "Un harnais de test du front : un rendu unique (intl, QueryClient, auth, gestes) et une doublure de l'API par ressource, fidèle à fields[] et include="
status: done
phase: P2
family: technique
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-28
depends_on: [TCK-3008, TCK-3009]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, tests, technique, architecture]
---

## Objectif utilisateur

Un test du front se monte en une ligne et parle à une API simulée qui ne rend que les colonnes demandées, comme la vraie.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7), 1 971 fichiers de test :

- `vi.mock('@/lib/api')` ×252, `stubGlobal('fetch')` ×170, `vi.mock('@/lib/queries/…')` ×549, `AuthContext` ×492, `new QueryClient` ×556 ; aucun outil partagé pour `QueryClient` ni l'auth (chaque test refait son `monter`).
- Outils partagés existants : `withIntl` (`src/test/intl.tsx`, 1 181 importeurs), `avecGestes` (`src/test/habilitations.tsx`), `navigationDeTest`.
- Une seule doublure fidèle : `commeLApi` (`src/test/visites-comme-l-api.ts`), au niveau du retour d'`apiRequest`, pour `/api/property-visits` seulement ; le contrat TCK-1800 recopie la table de renommage des relais (`requetes-du-front.tck-1800.test.tsx:122-125`).

## Contraintes strictes (métier)

- Pas de dépendance neuve (pas de MSW) ; interception au niveau de `fetch`, qui couvre Laravel, le BFF et le contrat TCK-1800.
- La doublure applique `fields[<table>]` et `include=` sur les listes (ADR-0006, ADR-0021) et signale une clé lue hors de `fields`.
- La table de renommage des relais n'existe qu'une fois (lue par le harnais et par le contrat TCK-1800).
- Migration progressive : les tests existants ne sont pas réécrits en bloc ; on migre ceux des dossiers touchés par TCK-3005, 3007, 3008, 3009, et la doublure des visites.

## Delta à produire

- [x] Intention : un rendu de test unique (intl, QueryClient frais, auth fournie, gestes, navigation)
- [x] Intention : une doublure d'API par ressource sur `fetch`, qui généralise `commeLApi` (au moins visites, réservations, baux), avec erreurs à la forme de TCK-3008
- [x] `commeLApi` passe par la nouvelle doublure ; ses 11 importeurs restent verts
- [x] Tests du harnais lui-même (fields, include, clé hors fields signalée, erreur)

## Critères d'acceptation

- [x] AC1 — Un test qui lit une clé non demandée dans `fields[]` échoue avec un message qui la nomme (test du harnais).
- [x] AC2 — Les tests migrés n'ont plus de `new QueryClient` ni de `vi.mock('@/lib/api')` locaux.
- [x] AC3 — La table de renommage des relais n'est écrite qu'une fois dans `src/test/`.
- [x] AC4 — `tsc --noEmit`, lint et les tests touchés sont verts.

## Hors périmètre

- La migration des ~1 900 autres fichiers de test (elle se fera au fil des tickets qui les touchent).

## Notes d'implémentation

Livré le 2026-11-28 (branche `feat/approfondissements-architecture`).

**Le harnais** (`takussan-web/src/test/`) :

- `api-simulee.ts` — `doublerLApi()`, au niveau du module d'un test : installe un `fetch` simulé avant chaque test et
  vérifie après lui. `servir(ressource, lignes)` (liste et détail `<route>/<id>`, bornés par `fields[<table>]` et
  `include=`), `sur(méthode, motif, corps)`, `refuser(méthode, motif, statut, { code, message, params, errors })`
  (l'enveloppe de `bootstrap/app.php`, ADR-0032 : `ApiError.codeMetier` et `params` la lisent, TCK-3008), un
  producteur qui lève `new ApiError(…)` refuse selon la requête, `parDefaut(corps)`, `appels(chemin)` (méthode,
  chemin, requête, corps décodé, en-têtes), `oublierLesAppels()`, `auRepos()`, `verifier()`. Une déclaration faite pendant un
  test ne vaut que pour lui. **Ce qui fait échouer un test après lui** : une clé lue hors de `fields`/`include`
  (nommée, avec sa table et sa route) et une requête qu'aucune déclaration ne sert — notées pendant le test,
  jamais levées dans le rendu, où React Query les avalerait. `json()` rend l'arbre sous surveillance (le `Proxy`
  ne survivrait pas à `JSON.stringify`). Le chemin journalisé est celui que Laravel reçoit : absolu tel quel,
  relatif par `RELAIS_DU_BFF` (cinq relais, gardés par un recensement des route handlers : cf. la vérification adverse), seule copie de la table.
- `ressources-de-l-api.ts` — visites, réservations, baux : `colonnes` (suivent `fields`), `inclusions` (nom
  d'`include=` → clés), `calculees` (servies telles quelles, jamais signalées). Chaque description est gardée
  contre le `toArray` de sa `Resource` PHP (`toutesLesCles` pour les visites).
- `rendu.tsx` — `rendre(ui, { compte, locale, gestes, url })`, `rendreLeHook`, `enveloppeDeTest` (pour un
  `renderToString` puis `hydrateRoot`) : `QueryClient` frais sans nouvel essai, le **vrai** `AuthProvider`
  (le Bearer et `X-Active-Profile-Hint` partent avec l'appel, vérifié), `avecGestes`, `withIntl`.
- `__tests__/api-simulee.test.tsx` — 24 cas au premier tour (34 après la vérification adverse) : fields, include, détail et 404, réservations et baux selon leur
  description, clé hors fields nommée par `apiRequest` ET par `appelBff`, requête non doublée, refus 409 codé et
  422, portée d'une déclaration, `auRepos`, les relais, corps, auth (Bearer, profil actif, profil non
  hérité du rendu précédent), langue, gestes et URL de départ, et les trois gardes PHP.

**Ce qui différait du ticket, re-mesuré :**

- Réservations : `BookingController::index` charge `property`, `customer` et la contre-offre quoi que dise
  `include=` (et la fiche, les paiements) : ce sont des `calculees`, pas des inclusions. Baux : les noms
  d'inclusion `documentsCount`/`historyCount` ne sont pas ceux des clés ; `signatures` n'est pas incluable
  en liste (`Lease::$requestLoadable`). Sous `fields`, Laravel rend une colonne non lue tantôt absente
  (`whenHas`, `lue()`), tantôt `null` : la doublure l'omet dans les deux cas et signale sa lecture.
- Les blocs imbriqués (`property` sous `fields[properties]`) sont rendus entiers : la doublure ne les borne pas.
- `next/navigation` reste une ligne du fichier de test : un `vi.mock` ne se hisse que dans le fichier qui
  l'écrit ; l'option `url` ne fait que poser la requête de départ.
- Périmètre de la migration, mesuré : les dossiers de 3005/3007/3008/3009 comptent ~128 fichiers qui ont l'un
  des motifs. Migrés : les 10 importeurs de `commeLApi` (`visites-comme-l-api.ts` supprimé, sa garde PHP et
  son test passés au harnais), le contrat TCK-1800 (fixture identique, md5 `901debc6…`), la fiche de visite
  (`visits/fiche/__tests__/fiche.tck-2587`, TCK-3005), `bookings.trois-natures.tck-2594` (TCK-3007) et
  `leases.locataire.tck-2780`. Limite acceptée par la session qui a délégué le ticket (2026-11-28) : elle tient le
  « hors périmètre ». Les autres fichiers se migrent quand un ticket les touche. La règle doit vivre dans
  `takussan-web/CLAUDE.md`, § Tests (texte proposé ci-dessous, à poser par la session).
- Règle proposée pour `takussan-web/CLAUDE.md`, § Tests :
  > **Un test neuf, ou un test qu'un ticket modifie, monte par `rendre`/`rendreLeHook` (`src/test/rendu.tsx`) et
  > double le réseau par `doublerLApi()` (`src/test/api-simulee.ts`)** : ni `new QueryClient`, ni
  > `vi.mock('@/lib/api')`, ni `vi.stubGlobal('fetch')` locaux (TCK-3010). Il remplace sa plomberie, il ne
  > l'empile pas ([ADR-0140](../docs/adr/0140-une-classe-de-tests-par-module-la-livraison-qui-approfondit-retire-ce-qu-elle-absorbe.md)).
  > Avant une assertion d'absence (« aucune lecture de… »), `await api.auRepos()`.
- Garde possible (non écrite) : un test de `src/test/__tests__/` qui lit `git diff --name-only --diff-filter=A
  origin/dev...HEAD -- '*.test.ts*'` et rougit sur `new QueryClient(` ou `vi.mock('@/lib/api'` dans un fichier
  AJOUTÉ. C'est un cliquet sur les seuls fichiers neufs : il ne voit pas un test modifié, et il dépend de la base
  de comparaison (en local, `dev` peut être périmé, cf. la garde du cimetière).
- Au niveau de `fetch`, une lecture part après les attentes d'`apiRequest` : un test qui vidait son journal
  juste après le montage attend désormais la première lecture (`semaine-et-filtres`), et **toute assertion
  d'absence** (« aucune lecture de… ») passe d'abord par `await api.auRepos()` — sans lui elle serait verte quoi
  que fasse le code (12 sites dans les fichiers migrés).

**Vérifié :** les 15 fichiers de test touchés verts ; `tsc --noEmit` et eslint propres ;
`npm run check:*` : les seuls rouges viennent de `playground/maquettes` (et, au relevé, de `src/lib/bff.ts`,
corrigé depuis par TCK-3009) ; `node scripts/gen-requetes-du-front.mjs --check` vert ; gardes qui parcourent
`src/` (13 fichiers) vertes (`relais-bff.tck-968`, rouge au relevé du fait de TCK-3009, y a été corrigée).
Ablations : sans l'`afterEach` de `doublerLApi`, un test qui lit une clé non demandée passe au vert ; sans
`cancelled_by` dans `VISIT_CLIENT_FIELDS`, `mes-visites.tck-2883` rougit en nommant la clé ; sans l'entrée
`super-admin` de `RELAIS_DU_BFF`, le contrat TCK-1800 rougit ; sans `enabled: false` dans `useBookings`, l'assertion
d'absence de `bookings.trois-natures` rougit.


**Vérification adverse (2026-11-28), quatre défauts.** Chacun a d'abord eu un test du harnais en échec :

- **Relais incomplets** : `RELAIS_DU_BFF` oubliait `super-admin-properties` (→ `/api/properties`) et `super-admin-users`
  (→ `/api/admin/users`, par `urlApiServeur`, sans `relayerVersApi`). La table est désormais gardée par un
  recensement de TOUS les `src/app/api/**/route.ts`. Chaque handler y entre dans exactement une case :
  - il garde son chemin ;
  - `RELAIS_DU_BFF` le traduit (le préfixe fixe, lu dans `relayerVersApi`, `urlApiServeur` ou `apiRequest`) ;
  - il figure dans `SANS_RELAIS` avec sa raison (12 handlers : cookies de session, gestes du BFF comme
    `impersonation/start`, sonde `/up`…).

  Un handler neuf ou un relais oublié fait échouer le test, et une exception devenue périmée aussi. La fixture TCK-1800
  n'a pas changé (md5 `901debc6…`).
- **`id`** : un descripteur ne le force plus que si `idToujours` est posé, et seule `PropertyVisitResource`
  l'ajoute (`['id', ...$noms]`, gardé contre le PHP). Sous `fields[…]` sans `id`, une réservation ou un bail ne
  porte donc pas d'`id`, et une lecture de cet `id` est signalée. **Au détail**, `inclusAuDetail` : `show` charge
  toujours property, agent, visitor et customer pour une visite, et property pour un bail. Une relation vide y vaut
  `null`, comme le rend `whenLoaded`.
- **Pagination et filtres** :
  - La liste est découpée comme le fait l'API (`page`, `per_page` borné à [1, 100], 15 par défaut comme Eloquent).
    `last_page` est tiré du total, et un `total` donné par `meta` le recalcule.
  - La doublure ne simule aucun filtre. Un `filter[…]` envoyé à une ressource servie fait échouer le test s'il n'est
    ni lu par un producteur (la requête qu'il reçoit est suivie, et un parcours compte comme une lecture de tout) ni
    déclaré par `servir(…, { filtres })`.
  - Neuf fichiers migrés déclarent ainsi les filtres qu'ils ne jugent que sur la requête.
  - `mes-visites.tck-2587` fabriquait une deuxième page à la main (`last_page: 2` pour 3 lignes à 20 par page). Il
    sert maintenant 21 lignes, et la doublure les pagine.
  - `sur` (corps libre) n'est pas suivi : c'est le test qui y écrit la réponse.
- **Coupable mal désigné** : l'`afterEach` du harnais attend le repos du réseau, démonte (`cleanup` de RTL),
  attend de nouveau, puis vérifie. Ensuite, dans un `finally`, `fetch` est remplacé par une fonction qui lève. Une
  lecture notée pour un test terminé (son numéro d'époque) n'accuse personne. `auRepos` attend aussi les réponses
  en vol, sur le vrai `setTimeout`, que l'on saisit au chargement.
  - Le test « requête tardive » est un `it.fails`. Avant le correctif, ce test passait et le test SUIVANT
    recevait la requête. Après le correctif, le test fautif échoue et le suivant n'en voit rien.
  - Un `afterAll` vérifie que `fetch` lève entre deux tests.
- **Ablations**, toutes restaurées avec vérification md5. Chaque mutation fait échouer des tests :

  | Mutation | Tests en échec |
  |---|---|
  | entrée `super-admin-properties` retirée | 1 (recensement) |
  | `id` forcé partout | 3 |
  | `inclusAuDetail` des visites vidé | 1 |
  | pagination sans découpe | 2 |
  | filtres non notés | 2 |
  | `afterEach` sans attente du repos | 2 (dont l'`it.fails`) |
  | `fetch` non remplacé après le test | l'`afterAll` |

  Les 15 fichiers passent (233 tests, plus l'`it.fails`), ainsi que `tsc --noEmit`, eslint,
  `gen-requetes-du-front.mjs --check` et `scripts/check-front-routes.mjs`.
